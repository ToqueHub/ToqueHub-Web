import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { AuditAction, HrContractStatus, HrDocumentCategory, HrEmployeeStatus, HrHistoryEventType, HrOnboardingStatus, HrRotationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignHrRotationDto, ChangeEmployeeRotationDto, HrListQueryDto, RemoveHrRotationDto, UpsertHrEmployeeDto, UpsertHrReferenceDto, UpsertHrRotationDto } from './dto/hr.dto';
import { HR_CATALOG } from './hr.catalog';

type Actor = { id: string; role: string; employeeId?: string | null };
type Tx = Prisma.TransactionClient;
const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];
const MANAGER_ROLES = [...WRITE_ROLES, 'Manager', 'MANAGER', 'Chef', 'Responsable'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN'];
const ROTATION_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const LEGACY_HR_DEFAULT_DEPARTMENTS = ['Cuisine', 'Pâtisserie', 'Administration', 'Entretien', 'Soins', 'Animation', 'Direction', 'Magasin'];
const LEGACY_HR_DEFAULT_POSITIONS = ['Chef de cuisine', 'Second de cuisine', 'Commis', 'Pâtissier', 'Magasinier', 'Agent polyvalent', 'Directeur', 'Infirmier', 'Animateur'];
const includeRotation = { department: true, assignments: { where: { endDate: null }, include: { employee: { include: { department: true, position: true } } }, orderBy: { createdAt: 'desc' as const } } };
const includeEmployee: any = { department: true, position: { include: { department: true } }, secondaryPositions: { include: { position: { include: { department: true } } } }, mainSite: true, user: { select: { id: true, email: true, firstName: true, lastName: true, role: { select: { name: true } } } }, manager: { select: { id: true, firstName: true, lastName: true } }, rotationAssignments: { where: { endDate: null }, include: { rotation: { include: { department: true } } }, orderBy: { createdAt: 'desc' }, take: 1 }, history: { orderBy: { createdAt: 'desc' }, take: 30, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } }, contracts: { orderBy: { startDate: 'desc' } }, compensations: { orderBy: { effectiveFrom: 'desc' } }, salaryReviews: { orderBy: { dueDate: 'asc' } }, documents: { orderBy: { createdAt: 'desc' } } };
const HR_UPLOAD_ROOT = resolve(process.env.HR_UPLOAD_DIR || process.env.UPLOAD_DIR || 'uploads', 'hr');

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) { if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('RH write access is restricted to managers and administrators'); }
  assertRead(actor: Actor, targetEmployeeId?: string, userEmployeeId?: string | null) {
    if (ADMIN_ROLES.includes(actor.role) || MANAGER_ROLES.includes(actor.role)) return;
    if (userEmployeeId && targetEmployeeId && userEmployeeId === targetEmployeeId) return;
    throw new ForbiddenException('Accès restreint à vos propres informations RH');
  }

  private isAdminOrManager(actor: Actor) { return ADMIN_ROLES.includes(actor.role) || MANAGER_ROLES.includes(actor.role); }
  private page(q?: HrListQueryDto) { const take = Math.min(q?.pageSize ?? 50, 200); return { take, skip: ((q?.page ?? 1) - 1) * take }; }
  private normalizeName(name: string) { return name.trim().toLowerCase(); }

  async getOnboardingProgress(organizationId: string) {
    let progress = await this.prisma.hrOnboardingProgress.findUnique({ where: { organizationId } });
    if (!progress) {
      progress = await this.prisma.hrOnboardingProgress.create({ data: { organizationId, status: HrOnboardingStatus.NOT_STARTED } });
    }
    return progress;
  }

  /**
   * recomputeOnboarding vérifie la cohérence entre l'état persistant et les données existantes.
   * Il ne progresse jamais automatiquement vers une étape supérieure.
   * Seules les méthodes explicites (completeServices, etc.) peuvent faire avancer le parcours.
   */
  async recomputeOnboarding(organizationId: string) {
    const progress = await this.getOnboardingProgress(organizationId);
    return progress;
  }

  async completeServices(organizationId: string, actor: Actor, selectedNames: string[] = []) {
    this.assertWrite(actor);
    if (selectedNames.length) await this.keepOnlySelectedInitialDepartments(organizationId, selectedNames);
    const hasDepartments = await this.prisma.hrDepartment.findFirst({ where: { organizationId, isArchived: false } });
    if (!hasDepartments) throw new BadRequestException('Aucun service actif n\'existe. Créez au moins un service avant de valider cette étape.');
    const progress = await this.getOnboardingProgress(organizationId);
    if (progress.servicesCompletedAt) return progress;
    const updated = await this.prisma.hrOnboardingProgress.update({
      where: { organizationId },
      data: { status: HrOnboardingStatus.SERVICES_COMPLETED, servicesCompletedAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'HrOnboardingProgress', entityId: updated.id, entityName: 'Onboarding RH', details: { step: 'services' } } });
    return updated;
  }

  private async keepOnlySelectedInitialDepartments(organizationId: string, selectedNames: string[]) {
    const selected = new Set(selectedNames.map((name) => this.normalizeName(name)).filter(Boolean));
    if (!selected.size) return;
    const [departments, positions] = await Promise.all([
      this.prisma.hrDepartment.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true } }),
      this.prisma.hrPosition.findMany({ where: { organizationId, isArchived: false }, select: { id: true, name: true, departmentId: true } }),
    ]);
    const departmentIdsToArchive: string[] = [];
    for (const department of departments) {
      if (selected.has(this.normalizeName(department.name))) continue;
      const activeEmployeeCount = await this.prisma.hrEmployee.count({ where: { organizationId, departmentId: department.id, isArchived: false } });
      if (activeEmployeeCount === 0) departmentIdsToArchive.push(department.id);
    }
    const legacyPositionNames = new Set(LEGACY_HR_DEFAULT_POSITIONS.map((name) => this.normalizeName(name)));
    const selectedDepartmentIds = new Set(departments.filter((department) => selected.has(this.normalizeName(department.name))).map((department) => department.id));
    const positionIdsToArchive: string[] = [];
    for (const position of positions) {
      const belongsToArchivedDepartment = Boolean(position.departmentId && departmentIdsToArchive.includes(position.departmentId));
      const isLegacyUnassigned = !position.departmentId && legacyPositionNames.has(this.normalizeName(position.name));
      const belongsOutsideSelectedDepartment = Boolean(position.departmentId && !selectedDepartmentIds.has(position.departmentId));
      if (!belongsToArchivedDepartment && !isLegacyUnassigned && !belongsOutsideSelectedDepartment) continue;
      const activeEmployeeCount = await this.prisma.hrEmployee.count({ where: { organizationId, positionId: position.id, isArchived: false } });
      if (activeEmployeeCount === 0) positionIdsToArchive.push(position.id);
    }
    const now = new Date();
    await this.prisma.$transaction([
      ...(departmentIdsToArchive.length ? [this.prisma.hrDepartment.updateMany({ where: { organizationId, id: { in: departmentIdsToArchive } }, data: { isArchived: true, archivedAt: now } })] : []),
      ...(positionIdsToArchive.length ? [this.prisma.hrPosition.updateMany({ where: { organizationId, id: { in: positionIdsToArchive } }, data: { isArchived: true, archivedAt: now } })] : []),
    ]);
  }

  async completePositions(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    const progress = await this.getOnboardingProgress(organizationId);
    if (!progress.servicesCompletedAt) throw new BadRequestException('Validez d\'abord l\'étape Services avant de passer à Postes.');
    const hasPositions = await this.prisma.hrPosition.findFirst({ where: { organizationId, isArchived: false } });
    if (!hasPositions) throw new BadRequestException('Aucun poste actif n\'existe. Créez au moins un poste avant de valider cette étape.');
    if (progress.positionsCompletedAt) return progress;
    const updated = await this.prisma.hrOnboardingProgress.update({
      where: { organizationId },
      data: { status: HrOnboardingStatus.POSITIONS_COMPLETED, positionsCompletedAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'HrOnboardingProgress', entityId: updated.id, entityName: 'Onboarding RH', details: { step: 'positions' } } });
    return updated;
  }

  async unlockEmployees(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    const progress = await this.getOnboardingProgress(organizationId);
    if (!progress.servicesCompletedAt || !progress.positionsCompletedAt) throw new BadRequestException('Validez d\'abord les étapes Services et Postes.');
    if (progress.employeesUnlockedAt) return progress;
    const updated = await this.prisma.hrOnboardingProgress.update({
      where: { organizationId },
      data: { status: HrOnboardingStatus.EMPLOYEES_UNLOCKED, employeesUnlockedAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'HrOnboardingProgress', entityId: updated.id, entityName: 'Onboarding RH', details: { step: 'employees_unlocked' } } });
    return updated;
  }

  async completeFirstEmployee(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    const progress = await this.getOnboardingProgress(organizationId);
    if (!progress.employeesUnlockedAt) throw new BadRequestException('Débloquez d\'abord l\'accès aux collaborateurs.');
    const hasEmployees = await this.prisma.hrEmployee.findFirst({ where: { organizationId, isArchived: false } });
    if (!hasEmployees) throw new BadRequestException('Aucun collaborateur n\'existe. Créez au moins un collaborateur.');
    if (progress.firstEmployeeCreatedAt) return progress;
    const updated = await this.prisma.hrOnboardingProgress.update({
      where: { organizationId },
      data: { status: HrOnboardingStatus.FIRST_EMPLOYEE_CREATED, firstEmployeeCreatedAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'HrOnboardingProgress', entityId: updated.id, entityName: 'Onboarding RH', details: { step: 'first_employee' } } });
    return updated;
  }

  async completeOnboarding(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    const progress = await this.getOnboardingProgress(organizationId);
    if (!progress.firstEmployeeCreatedAt) throw new BadRequestException('Créez d\'abord un collaborateur avant de finaliser le parcours.');
    if (progress.completedAt) return progress;
    const updated = await this.prisma.hrOnboardingProgress.update({
      where: { organizationId },
      data: { status: HrOnboardingStatus.COMPLETED, completedAt: new Date() },
    });
    await this.prisma.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'HrOnboardingProgress', entityId: updated.id, entityName: 'Onboarding RH', details: { step: 'completed' } } });
    return updated;
  }

  async installDefaults(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { hrInstalledAt: new Date() } });
      await this.ensureDefaultRotations(tx, organizationId);
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'Module', entityId: 'hr', entityName: 'RH' } });
      return { installed: true };
    });
  }

  async createDepartments(organizationId: string, actor: Actor, names: string[]) {
    this.assertWrite(actor);
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (!unique.length) throw new BadRequestException('Aucun nom de service fourni.');
    const existing = await this.prisma.hrDepartment.findMany({ where: { organizationId, name: { in: unique, mode: 'insensitive' } } });
    const existingNames = new Set(existing.map((d) => d.name.toLowerCase()));
    const archivedIds = existing.filter((department) => department.isArchived).map((department) => department.id);
    if (archivedIds.length) {
      await this.prisma.hrDepartment.updateMany({ where: { organizationId, id: { in: archivedIds } }, data: { isArchived: false, archivedAt: null } });
    }
    const toCreate = unique.filter((n) => !existingNames.has(n.toLowerCase()));
    if (!toCreate.length) return { created: 0, skipped: unique.length };
    await this.prisma.hrDepartment.createMany({ data: toCreate.map((name) => ({ organizationId, name })), skipDuplicates: true });
    return { created: toCreate.length, skipped: unique.length - toCreate.length };
  }

  async createPositions(organizationId: string, actor: Actor, names: string[]) {
    this.assertWrite(actor);
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (!unique.length) throw new BadRequestException('Aucun nom de poste fourni.');
    const existing = await this.prisma.hrPosition.findMany({ where: { organizationId, name: { in: unique, mode: 'insensitive' } } });
    const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));
    const toCreate = unique.filter((n) => !existingNames.has(n.toLowerCase()));
    if (!toCreate.length) return { created: 0, skipped: unique.length };
    const departments = await this.prisma.hrDepartment.findMany({ where: { organizationId, isArchived: false } });
    await this.prisma.hrPosition.createMany({ data: toCreate.map((name) => {
      const departmentId = this.departmentIdForCatalogPosition(name, departments);
      const departmentName = departments.find((department) => department.id === departmentId)?.name;
      return { organizationId, name, description: this.buildJobDescription(name, departmentName), departmentId };
    }), skipDuplicates: true });
    return { created: toCreate.length, skipped: unique.length - toCreate.length };
  }

  async createPositionReferences(organizationId: string, actor: Actor, references: UpsertHrReferenceDto[]) {
    this.assertWrite(actor);
    const normalized = references
      .map((reference) => ({ name: reference.name.trim(), description: reference.description?.trim() || undefined, departmentId: reference.departmentId || undefined }))
      .filter((reference) => reference.name);
    if (!normalized.length) throw new BadRequestException('Aucun poste fourni.');
    const unique = new Map<string, typeof normalized[number]>();
    normalized.forEach((reference) => unique.set(reference.name.toLowerCase(), reference));
    const items = [...unique.values()];
    const departmentIds = [...new Set(items.map((item) => item.departmentId).filter(Boolean))] as string[];
    const departments = departmentIds.length ? await this.prisma.hrDepartment.findMany({ where: { id: { in: departmentIds }, organizationId, isArchived: false }, select: { id: true, name: true } }) : [];
    if (departmentIds.length) {
      if (departments.length !== departmentIds.length) throw new NotFoundException('Un ou plusieurs services RH sont introuvables ou archivés');
    }
    const existing = await this.prisma.hrPosition.findMany({ where: { organizationId, name: { in: items.map((item) => item.name), mode: 'insensitive' } } });
    for (const position of existing) {
      const selected = items.find((item) => this.normalizeName(item.name) === this.normalizeName(position.name));
      const departmentId = selected?.departmentId ?? position.departmentId;
      const departmentName = departments.find((department) => department.id === departmentId)?.name;
      const description = selected?.description ?? (this.shouldEnrichJobDescription(position.description) ? this.buildJobDescription(position.name, departmentName) : position.description);
      if (!position.isArchived && position.departmentId === departmentId && position.description === description) continue;
      await this.prisma.hrPosition.update({
        where: { id: position.id, organizationId },
        data: { isArchived: false, archivedAt: null, departmentId, description },
      });
    }
    const existingNames = new Set(existing.map((position) => position.name.toLowerCase()));
    const toCreate = items.filter((item) => !existingNames.has(item.name.toLowerCase()));
    if (!toCreate.length) return { created: 0, skipped: items.length };
    await this.prisma.hrPosition.createMany({ data: toCreate.map((item) => ({ organizationId, name: item.name, description: item.description ?? this.buildJobDescription(item.name, departments.find((department) => department.id === item.departmentId)?.name), departmentId: item.departmentId ?? null })), skipDuplicates: true });
    return { created: toCreate.length, skipped: items.length - toCreate.length };
  }

  async uninstall(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    await this.prisma.organization.update({ where: { id: organizationId }, data: { hrInstalledAt: null } });
    await this.prisma.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_UNINSTALLED, entityType: 'Module', entityId: 'hr', entityName: 'RH' } });
    return { installed: false };
  }

  dashboard(organizationId: string) {
    return this.buildDashboard(organizationId);
  }

  private async buildDashboard(organizationId: string) {
    const [employeeCount, departmentCount, positionCount, linkedCount, latestEmployees, grouped, activeRotationCount, employeesWithRotation, rotationAverage] = await Promise.all([
      this.prisma.hrEmployee.count({ where: { organizationId, isArchived: false } }),
      this.prisma.hrDepartment.count({ where: { organizationId, isArchived: false } }),
      this.prisma.hrPosition.count({ where: { organizationId, isArchived: false } }),
      this.prisma.hrEmployee.count({ where: { organizationId, isArchived: false, userId: { not: null } } }),
      this.prisma.hrEmployee.findMany({ where: { organizationId, isArchived: false }, include: { department: true, position: true, rotationAssignments: { where: { endDate: null }, include: { rotation: { include: { department: true } } }, take: 1 } }, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.hrEmployee.groupBy({ by: ['departmentId'], where: { organizationId, isArchived: false }, _count: { _all: true } }),
      this.prisma.hrRotation.count({ where: { organizationId, isArchived: false } }),
      this.prisma.hrRotationAssignment.groupBy({ by: ['employeeId'], where: { organizationId, endDate: null }, _count: { _all: true } }),
      this.prisma.hrRotation.aggregate({ where: { organizationId, isArchived: false }, _avg: { weeklyHoursMinutesAverage: true } }),
    ]);
    const departments = await this.prisma.hrDepartment.findMany({ where: { id: { in: grouped.map((g) => g.departmentId) } } });
    return { employeeCount, departmentCount, positionCount, linkedCount, latestEmployees, departmentDistribution: grouped.map((g) => ({ department: departments.find((d) => d.id === g.departmentId), count: g._count._all })), rotationStats: { activeRotationCount, employeesWithRotationCount: employeesWithRotation.length, employeesWithoutRotationCount: Math.max(employeeCount - employeesWithRotation.length, 0), averageWeeklyHoursMinutes: Math.round(rotationAverage._avg.weeklyHoursMinutesAverage ?? 0) } };
  }

  listDepartments(organizationId: string, q: HrListQueryDto = {}) { return this.prisma.hrDepartment.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  createDepartment(organizationId: string, actor: Actor, dto: UpsertHrReferenceDto) { this.assertWrite(actor); return this.prisma.hrDepartment.create({ data: { ...dto, organizationId } }); }
  updateDepartment(organizationId: string, actor: Actor, id: string, dto: UpsertHrReferenceDto) { this.assertWrite(actor); return this.prisma.hrDepartment.update({ where: { id, organizationId }, data: dto }); }
  archiveDepartment(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); return this.prisma.hrDepartment.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() } }); }

  listPositions(organizationId: string, q: HrListQueryDto = {}) { return this.prisma.hrPosition.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), departmentId: q.departmentId, name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, include: { department: true }, orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }], ...this.page(q) }); }
  async createPosition(organizationId: string, actor: Actor, dto: UpsertHrReferenceDto) {
    this.assertWrite(actor);
    if (dto.departmentId) await this.ensureActiveDepartment(organizationId, dto.departmentId);
    const department = dto.departmentId ? await this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId }, select: { name: true } }) : null;
    return this.prisma.hrPosition.create({ data: { name: dto.name, description: dto.description || this.buildJobDescription(dto.name, department?.name), departmentId: dto.departmentId || null, organizationId }, include: { department: true } });
  }
  async updatePosition(organizationId: string, actor: Actor, id: string, dto: UpsertHrReferenceDto) {
    this.assertWrite(actor);
    if (dto.departmentId) await this.ensureActiveDepartment(organizationId, dto.departmentId);
    const department = dto.departmentId ? await this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId }, select: { name: true } }) : null;
    return this.prisma.hrPosition.update({ where: { id, organizationId }, data: { name: dto.name, description: dto.description || this.buildJobDescription(dto.name, department?.name), departmentId: dto.departmentId || null }, include: { department: true } });
  }
  archivePosition(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); return this.prisma.hrPosition.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() }, include: { department: true } }); }

  async listEmployees(organizationId: string, actor: Actor, q: HrListQueryDto = {}) {
    if (!this.isAdminOrManager(actor)) {
      if (actor.employeeId) {
        const employee = await this.prisma.hrEmployee.findFirst({ where: { id: actor.employeeId, organizationId }, include: includeEmployee });
        return employee ? [employee] : [];
      }
      throw new ForbiddenException('Accès restreint à vos propres informations RH');
    }
    const OR = q.search ? [{ firstName: { contains: q.search, mode: 'insensitive' as const } }, { lastName: { contains: q.search, mode: 'insensitive' as const } }, { email: { contains: q.search, mode: 'insensitive' as const } }, { department: { name: { contains: q.search, mode: 'insensitive' as const } } }, { position: { name: { contains: q.search, mode: 'insensitive' as const } } }] : undefined;
    return this.prisma.hrEmployee.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), status: q.status, departmentId: q.departmentId, positionId: q.positionId, ...(q.linkedToUser === undefined ? {} : { userId: q.linkedToUser ? { not: null } : null }), OR }, include: includeEmployee, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], ...this.page(q) });
  }

  async getEmployee(organizationId: string, actor: Actor, id: string) {
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id, organizationId }, include: includeEmployee });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');
    this.assertRead(actor, id, actor.employeeId);
    return employee;
  }

  async createEmployee(organizationId: string, actor: Actor, dto: UpsertHrEmployeeDto) {
    this.assertWrite(actor);
    const onboarding = await this.recomputeOnboarding(organizationId);
    if (onboarding.status === HrOnboardingStatus.NOT_STARTED || onboarding.status === HrOnboardingStatus.SERVICES_IN_PROGRESS || onboarding.status === HrOnboardingStatus.SERVICES_COMPLETED) {
      throw new BadRequestException('Vous devez d’abord créer au moins un service et un poste avant de pouvoir ajouter un collaborateur.');
    }
    await this.validateEmployeeRefs(organizationId, dto);
    if (dto.email) await this.ensureEmailAvailable(organizationId, dto.email);
    if (dto.userId) await this.ensureUserAvailable(organizationId, dto.userId);
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.hrEmployee.create({ data: this.employeeData(organizationId, dto), include: includeEmployee });
      if (dto.secondaryPositionIds?.length) {
        await tx.hrEmployeeSecondaryPosition.createMany({ data: dto.secondaryPositionIds.map((positionId) => ({ employeeId: employee.id, positionId })), skipDuplicates: true });
      }
      await this.syncContractAndCompensation(tx, organizationId, employee.id, dto, actor.id);
      await this.history(tx, organizationId, employee.id, actor.id, HrHistoryEventType.CREATED, 'Création du collaborateur');
      if (dto.userId) await this.history(tx, organizationId, employee.id, actor.id, HrHistoryEventType.USER_LINKED, 'Compte ToqueHub associé', { userId: dto.userId });
      await this.recomputeOnboarding(organizationId);
      return tx.hrEmployee.findFirst({ where: { id: employee.id, organizationId }, include: includeEmployee });
    });
  }

  async updateEmployee(organizationId: string, actor: Actor, id: string, dto: UpsertHrEmployeeDto) {
    this.assertWrite(actor);
    const current = await this.prisma.hrEmployee.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Collaborateur introuvable');
    await this.validateEmployeeRefs(organizationId, dto, id);
    if (dto.email && dto.email !== current.email) await this.ensureEmailAvailable(organizationId, dto.email);
    if (dto.userId && dto.userId !== current.userId) await this.ensureUserAvailable(organizationId, dto.userId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.hrEmployee.update({ where: { id, organizationId }, data: this.employeeUpdateData(dto), include: includeEmployee });
      if (dto.secondaryPositionIds !== undefined) {
        await tx.hrEmployeeSecondaryPosition.deleteMany({ where: { employeeId: id } });
        if (dto.secondaryPositionIds.length) {
          await tx.hrEmployeeSecondaryPosition.createMany({ data: dto.secondaryPositionIds.map((positionId) => ({ employeeId: id, positionId })), skipDuplicates: true });
        }
      }
      await this.syncContractAndCompensation(tx, organizationId, id, dto, actor.id);
      await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.UPDATED, 'Mise à jour du collaborateur');
      if (dto.status && dto.status !== current.status) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.STATUS_CHANGED, 'Changement de statut', { from: current.status, to: dto.status });
      if (dto.departmentId !== current.departmentId) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.DEPARTMENT_CHANGED, 'Changement de service');
      if (dto.positionId !== current.positionId) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.POSITION_CHANGED, 'Changement de poste');
      if (dto.userId !== current.userId) await this.history(tx, organizationId, id, actor.id, dto.userId ? HrHistoryEventType.USER_LINKED : HrHistoryEventType.USER_UNLINKED, dto.userId ? 'Compte ToqueHub associé' : 'Compte ToqueHub retiré');
      if (dto.managerId !== current.managerId) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.MANAGER_CHANGED, 'Changement de responsable');
      await this.recomputeOnboarding(organizationId);
      return tx.hrEmployee.findFirst({ where: { id, organizationId }, include: includeEmployee });
    });
  }

  async archiveEmployee(organizationId: string, actor: Actor, id: string) {
    this.assertWrite(actor);
    const employee = await this.prisma.hrEmployee.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() }, include: includeEmployee });
    await this.prisma.hrEmployeeHistory.create({ data: { organizationId, employeeId: id, userId: actor.id, type: HrHistoryEventType.ARCHIVED, label: 'Archivage du collaborateur' } });
    return employee;
  }

  async uploadEmployeeDocument(organizationId: string, actor: Actor, employeeId: string, file: any, category = 'OTHER', notes?: string, expiresAt?: string) {
    this.assertWrite(actor);
    if (!file) throw new BadRequestException('Aucun fichier PDF fourni');
    if (file.mimetype !== 'application/pdf' && extname(file.originalname).toLowerCase() !== '.pdf') throw new BadRequestException('Seuls les documents PDF sont acceptés');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Le document ne doit pas dépasser 10 Mo');
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id: employeeId, organizationId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');
    const documentCategory = this.parseDocumentCategory(category);
    const filename = `${randomUUID()}.pdf`;
    const relativePath = join(organizationId, employeeId, filename);
    const absoluteDirectory = join(HR_UPLOAD_ROOT, organizationId, employeeId);
    const absolutePath = join(absoluteDirectory, filename);
    await mkdir(absoluteDirectory, { recursive: true });
    await writeFile(absolutePath, file.buffer);
    const document = await this.prisma.hrDocument.create({
      data: {
        organizationId,
        employeeId,
        category: documentCategory,
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/pdf',
        sizeBytes: file.size,
        storagePath: relativePath,
        notes: notes || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: actor.id,
      },
    });
    await this.prisma.hrEmployeeHistory.create({ data: { organizationId, employeeId, userId: actor.id, type: HrHistoryEventType.UPDATED, label: 'Document RH ajouté', details: { documentId: document.id, category: document.category } } });
    return document;
  }

  async getEmployeeDocument(organizationId: string, actor: Actor, employeeId: string, documentId: string) {
    const document = await this.prisma.hrDocument.findFirst({ where: { id: documentId, employeeId, organizationId } });
    if (!document) throw new NotFoundException('Document introuvable');
    this.assertRead(actor, employeeId, actor.employeeId);
    return { document, absolutePath: join(HR_UPLOAD_ROOT, document.storagePath) };
  }

  async replaceEmployeeDocument(organizationId: string, actor: Actor, employeeId: string, documentId: string, file: any) {
    this.assertWrite(actor);
    if (!file) throw new BadRequestException('Aucun fichier PDF fourni');
    if (file.mimetype !== 'application/pdf' && extname(file.originalname).toLowerCase() !== '.pdf') throw new BadRequestException('Seuls les documents PDF sont acceptés');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Le document ne doit pas dépasser 10 Mo');
    const { document, absolutePath } = await this.getEmployeeDocument(organizationId, actor, employeeId, documentId);
    const filename = `${randomUUID()}.pdf`;
    const relativePath = join(organizationId, employeeId, filename);
    const absoluteDirectory = join(HR_UPLOAD_ROOT, organizationId, employeeId);
    const nextAbsolutePath = join(absoluteDirectory, filename);
    await mkdir(absoluteDirectory, { recursive: true });
    await writeFile(nextAbsolutePath, file.buffer);
    await unlink(absolutePath).catch(() => undefined);
    const updated = await this.prisma.hrDocument.update({
      where: { id: document.id },
      data: {
        filename,
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/pdf',
        sizeBytes: file.size,
        storagePath: relativePath,
      },
    });
    await this.prisma.hrEmployeeHistory.create({ data: { organizationId, employeeId, userId: actor.id, type: HrHistoryEventType.UPDATED, label: 'Document RH remplacé', details: { documentId: document.id, category: document.category } } });
    return updated;
  }

  async deleteEmployeeDocument(organizationId: string, actor: Actor, employeeId: string, documentId: string) {
    this.assertWrite(actor);
    const { document, absolutePath } = await this.getEmployeeDocument(organizationId, actor, employeeId, documentId);
    await this.prisma.hrDocument.delete({ where: { id: document.id } });
    await unlink(absolutePath).catch(() => undefined);
    await this.prisma.hrEmployeeHistory.create({ data: { organizationId, employeeId, userId: actor.id, type: HrHistoryEventType.UPDATED, label: 'Document RH supprimé', details: { documentId: document.id, category: document.category } } });
    return { deleted: true };
  }

  async orgChart(organizationId: string, departmentId?: string) {
    const employees = await this.prisma.hrEmployee.findMany({ where: { organizationId, isArchived: false, departmentId }, include: { department: true, position: true }, orderBy: [{ department: { name: 'asc' } }, { lastName: 'asc' }] });
    return { employees, roots: employees.filter((e) => !e.managerId), withoutManager: employees.filter((e) => !e.managerId) };
  }

  listAssignableUsers(organizationId: string) { return this.prisma.user.findMany({ where: { organizationId, isActive: true, hrEmployee: null }, select: { id: true, email: true, firstName: true, lastName: true, role: { select: { name: true } } }, orderBy: { email: 'asc' } }); }

  async listRotations(organizationId: string, q: HrListQueryDto = {}) {
    return this.prisma.hrRotation.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), departmentId: q.departmentId, name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, include: includeRotation, orderBy: [{ isArchived: 'asc' }, { name: 'asc' }], ...this.page(q) });
  }

  async getRotation(organizationId: string, id: string) {
    const rotation = await this.prisma.hrRotation.findFirst({ where: { id, organizationId }, include: includeRotation });
    if (!rotation) throw new NotFoundException('Roulement introuvable');
    return rotation;
  }

  async createRotation(organizationId: string, actor: Actor, dto: UpsertHrRotationDto) {
    this.assertWrite(actor);
    await this.validateRotation(organizationId, dto);
    const metrics = this.rotationMetrics(dto);
    return this.prisma.hrRotation.create({ data: { organizationId, name: dto.name, description: dto.description || null, departmentId: dto.departmentId || null, cycleLengthWeeks: dto.cycleLengthWeeks, cycle: this.rotationCycle(dto), ...metrics }, include: includeRotation });
  }

  async updateRotation(organizationId: string, actor: Actor, id: string, dto: UpsertHrRotationDto) {
    this.assertWrite(actor);
    await this.getRotation(organizationId, id);
    await this.validateRotation(organizationId, dto);
    const metrics = this.rotationMetrics(dto);
    return this.prisma.hrRotation.update({ where: { id, organizationId }, data: { name: dto.name, description: dto.description || null, departmentId: dto.departmentId || null, cycleLengthWeeks: dto.cycleLengthWeeks, cycle: this.rotationCycle(dto), ...metrics }, include: includeRotation });
  }

  async archiveRotation(organizationId: string, actor: Actor, id: string) {
    this.assertWrite(actor);
    return this.prisma.hrRotation.update({ where: { id, organizationId }, data: { isArchived: true, status: HrRotationStatus.ARCHIVED, archivedAt: new Date() }, include: includeRotation });
  }

  async listRotationAssignments(organizationId: string, rotationId: string) {
    await this.getRotation(organizationId, rotationId);
    return this.prisma.hrRotationAssignment.findMany({ where: { organizationId, rotationId }, include: { employee: { include: { department: true, position: true } }, rotation: { include: { department: true } } }, orderBy: [{ endDate: 'asc' }, { createdAt: 'desc' }] });
  }

  async listAvailableEmployeesForRotation(organizationId: string, rotationId: string) {
    const rotation = await this.getRotation(organizationId, rotationId);
    return this.prisma.hrEmployee.findMany({ where: { organizationId, isArchived: false, status: HrEmployeeStatus.ACTIVE, ...(rotation.departmentId ? { departmentId: rotation.departmentId } : {}), rotationAssignments: { none: { endDate: null } } }, include: { department: true, position: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
  }

  async assignRotation(organizationId: string, actor: Actor, rotationId: string, dto: AssignHrRotationDto) {
    this.assertWrite(actor);
    await this.ensureRotationAssignable(organizationId, rotationId, dto.employeeId);
    return this.prisma.$transaction(async (tx) => {
      await tx.hrRotationAssignment.updateMany({ where: { organizationId, employeeId: dto.employeeId, endDate: null }, data: { endDate: dto.startDate ? new Date(dto.startDate) : new Date(), endedById: actor.id } });
      const assignment = await tx.hrRotationAssignment.create({ data: { organizationId, rotationId, employeeId: dto.employeeId, startDate: dto.startDate ? new Date(dto.startDate) : new Date(), createdById: actor.id }, include: { rotation: { include: { department: true } }, employee: { include: { department: true, position: true } } } });
      await this.history(tx, organizationId, dto.employeeId, actor.id, HrHistoryEventType.ROTATION_ASSIGNED, 'Assignation à un roulement', { rotationId });
      return assignment;
    });
  }

  async removeRotationAssignment(organizationId: string, actor: Actor, rotationId: string, employeeId: string, dto: RemoveHrRotationDto = {}) {
    this.assertWrite(actor);
    const active = await this.prisma.hrRotationAssignment.findFirst({ where: { organizationId, rotationId, employeeId, endDate: null } });
    if (!active) throw new NotFoundException('Assignation active introuvable');
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.hrRotationAssignment.update({ where: { id: active.id }, data: { endDate: dto.endDate ? new Date(dto.endDate) : new Date(), endedById: actor.id }, include: { rotation: { include: { department: true } }, employee: true } });
      await this.history(tx, organizationId, employeeId, actor.id, HrHistoryEventType.ROTATION_REMOVED, 'Retrait du roulement', { rotationId });
      return assignment;
    });
  }

  async changeEmployeeRotation(organizationId: string, actor: Actor, employeeId: string, dto: ChangeEmployeeRotationDto) {
    this.assertWrite(actor);
    if (!dto.rotationId) return this.removeEmployeeRotation(organizationId, actor, employeeId, {});
    await this.ensureRotationAssignable(organizationId, dto.rotationId, employeeId);
    return this.assignRotation(organizationId, actor, dto.rotationId, { employeeId, startDate: dto.startDate });
  }

  async removeEmployeeRotation(organizationId: string, actor: Actor, employeeId: string, dto: RemoveHrRotationDto = {}) {
    this.assertWrite(actor);
    const active = await this.prisma.hrRotationAssignment.findFirst({ where: { organizationId, employeeId, endDate: null } });
    if (!active) throw new NotFoundException('Aucun roulement actif');
    return this.removeRotationAssignment(organizationId, actor, active.rotationId, employeeId, dto);
  }

  private async validateRotation(organizationId: string, dto: UpsertHrRotationDto) {
    if (dto.weeks.length !== dto.cycleLengthWeeks) throw new BadRequestException('Le nombre de semaines doit correspondre à la durée du cycle');
    if (dto.departmentId && !(await this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId, isArchived: false } }))) throw new NotFoundException('Service RH introuvable');
    dto.weeks.forEach((week, wi) => {
      if (week.days.length !== 7) throw new BadRequestException(`La semaine ${wi + 1} doit contenir 7 jours`);
      week.days.forEach((day, di) => {
        if (day.type === 'WORK' && (!day.startTime || !day.endTime)) throw new BadRequestException(`${ROTATION_DAY_NAMES[di]}: heures de début et fin obligatoires`);
      });
    });
  }

  private async ensureRotationAssignable(organizationId: string, rotationId: string, employeeId: string) {
    const [rotation, employee, active] = await Promise.all([
      this.prisma.hrRotation.findFirst({ where: { id: rotationId, organizationId, isArchived: false } }),
      this.prisma.hrEmployee.findFirst({ where: { id: employeeId, organizationId, isArchived: false } }),
      this.prisma.hrRotationAssignment.findFirst({ where: { organizationId, employeeId, endDate: null } }),
    ]);
    if (!rotation) throw new NotFoundException('Roulement actif introuvable');
    if (!employee) throw new NotFoundException('Collaborateur actif introuvable');
    if (active && active.rotationId === rotationId) throw new ConflictException('Le collaborateur possède déjà ce roulement actif');
    if (rotation.departmentId && rotation.departmentId !== employee.departmentId) throw new BadRequestException('Collaborateur incompatible avec le service du roulement');
  }

  private rotationCycle(dto: UpsertHrRotationDto): Prisma.InputJsonValue { return { weeks: dto.weeks.map((week) => ({ weekNumber: week.weekNumber, days: week.days.map((day) => ({ type: day.type, startTime: day.startTime ?? null, endTime: day.endTime ?? null, breakMinutes: day.breakMinutes ?? 0 })) })) }; }

  private rotationMetrics(dto: UpsertHrRotationDto): Pick<Prisma.HrRotationUncheckedCreateInput, 'weeklyHoursMinutesAverage' | 'weeklyPresenceMinutesAverage' | 'workedDaysAverage' | 'restDaysAverage' | 'averageDailyPresenceMinutes'> {
    const weekMetrics = dto.weeks.map((week) => week.days.reduce((acc, day) => {
      if (day.type === 'REST') return { ...acc, restDays: acc.restDays + 1 };
      const presence = this.minutesBetween(day.startTime!, day.endTime!);
      const worked = Math.max(presence - (day.breakMinutes ?? 0), 0);
      return { workedMinutes: acc.workedMinutes + worked, presenceMinutes: acc.presenceMinutes + presence, workedDays: acc.workedDays + 1, restDays: acc.restDays };
    }, { workedMinutes: 0, presenceMinutes: 0, workedDays: 0, restDays: 0 }));
    const sum = weekMetrics.reduce((acc, w) => ({ workedMinutes: acc.workedMinutes + w.workedMinutes, presenceMinutes: acc.presenceMinutes + w.presenceMinutes, workedDays: acc.workedDays + w.workedDays, restDays: acc.restDays + w.restDays }), { workedMinutes: 0, presenceMinutes: 0, workedDays: 0, restDays: 0 });
    const divisor = Math.max(dto.cycleLengthWeeks, 1);
    return { weeklyHoursMinutesAverage: Math.round(sum.workedMinutes / divisor), weeklyPresenceMinutesAverage: Math.round(sum.presenceMinutes / divisor), workedDaysAverage: sum.workedDays / divisor, restDaysAverage: sum.restDays / divisor, averageDailyPresenceMinutes: sum.workedDays ? Math.round(sum.presenceMinutes / sum.workedDays) : 0 };
  }

  private minutesBetween(start: string, end: string) {
    const parse = (value: string) => { const [h, m] = value.split(':').map(Number); if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) throw new BadRequestException('Format horaire invalide'); return h * 60 + m; };
    const s = parse(start); let e = parse(end); if (e <= s) e += 24 * 60; return e - s;
  }

  private defaultWeek(startTime: string, endTime: string, breakMinutes = 30) {
    return { weekNumber: 1, days: ROTATION_DAY_NAMES.map((_, index) => index < 5 ? { type: 'WORK', startTime, endTime, breakMinutes } : { type: 'REST' }) };
  }

  private async ensureDefaultRotations(tx: Tx, organizationId: string) {
    const departments = await tx.hrDepartment.findMany({ where: { organizationId } });
    const dep = (name: string) => departments.find((d) => d.name === name)?.id;
    const samples = [
      { name: 'Cuisine matin', departmentId: dep('Cuisine'), start: '06:00', end: '14:00' },
      { name: 'Cuisine soir', departmentId: dep('Cuisine'), start: '14:00', end: '22:00' },
      { name: 'Pâtisserie', departmentId: dep('Pâtisserie'), start: '05:00', end: '13:00' },
      { name: 'Week-end', departmentId: null, start: '08:00', end: '16:00' },
      { name: 'Cuisine centrale', departmentId: dep('Cuisine'), start: '07:00', end: '15:00' },
      { name: 'Agent polyvalent', departmentId: null, start: '09:00', end: '17:00' },
      { name: 'Administration', departmentId: dep('Administration'), start: '09:00', end: '17:00' },
    ];
    for (const sample of samples) {
      const dto = { name: sample.name, description: 'Roulement exemple modifiable', departmentId: sample.departmentId ?? undefined, cycleLengthWeeks: 1, weeks: [this.defaultWeek(sample.start, sample.end)] } as UpsertHrRotationDto;
      await tx.hrRotation.upsert({ where: { organizationId_name: { organizationId, name: sample.name } }, update: {}, create: { organizationId, name: sample.name, description: dto.description, departmentId: sample.departmentId, cycleLengthWeeks: 1, cycle: this.rotationCycle(dto), ...this.rotationMetrics(dto) } });
    }
  }

  private async validateEmployeeRefs(organizationId: string, dto: UpsertHrEmployeeDto, employeeId?: string) {
    const [department, position] = await Promise.all([this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId, isArchived: false } }), this.prisma.hrPosition.findFirst({ where: { id: dto.positionId, organizationId, isArchived: false }, include: { department: true } })]);
    if (!department) throw new NotFoundException('Service RH introuvable ou archivé');
    if (!position) throw new NotFoundException('Poste RH introuvable ou archivé');
    if (!this.positionBelongsToDepartment(position, department)) {
      throw new BadRequestException('Le poste principal sélectionné n’appartient pas au service principal.');
    }
    if (dto.mainSiteId && !(await this.prisma.site.findFirst({ where: { id: dto.mainSiteId, organizationId } }))) throw new NotFoundException('Site introuvable');
    if (dto.managerId) {
      if (dto.managerId === employeeId) throw new BadRequestException('Un collaborateur ne peut pas être son propre responsable');
      const manager = await this.prisma.hrEmployee.findFirst({ where: { id: dto.managerId, organizationId, isArchived: false } });
      if (!manager) throw new NotFoundException('Responsable introuvable');
      if (employeeId && (await this.wouldCreateCycle(organizationId, employeeId, dto.managerId))) throw new BadRequestException('Boucle hiérarchique détectée');
    }
    if (dto.secondaryPositionIds?.length) {
      if (dto.secondaryPositionIds.includes(dto.positionId)) throw new BadRequestException('Le poste principal ne peut pas être sélectionné comme poste secondaire');
      const uniqueIds = [...new Set(dto.secondaryPositionIds)];
      if (uniqueIds.length !== dto.secondaryPositionIds.length) throw new BadRequestException('Les postes secondaires doivent être uniques');
      const secondaryPositions = await this.prisma.hrPosition.findMany({ where: { id: { in: uniqueIds }, organizationId, isArchived: false } });
      if (secondaryPositions.length !== uniqueIds.length) throw new BadRequestException('Un ou plusieurs postes secondaires sont introuvables ou archivés');
    }
  }

  private async wouldCreateCycle(organizationId: string, employeeId: string, managerId: string) {
    let current: string | null = managerId;
    const seen = new Set<string>();
    while (current) {
      if (current === employeeId || seen.has(current)) return true;
      seen.add(current);
      const manager: { managerId: string | null } | null = await this.prisma.hrEmployee.findFirst({ where: { id: current, organizationId }, select: { managerId: true } });
      current = manager?.managerId ?? null;
    }
    return false;
  }

  private async ensureEmailAvailable(organizationId: string, email: string) { if (await this.prisma.hrEmployee.findFirst({ where: { organizationId, email } })) throw new ConflictException('Email collaborateur déjà utilisé'); }
  private async ensureUserAvailable(organizationId: string, userId: string) { const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId } }); if (!user) throw new NotFoundException('Utilisateur ToqueHub introuvable'); if (await this.prisma.hrEmployee.findFirst({ where: { organizationId, userId } })) throw new ConflictException('Utilisateur déjà lié à un collaborateur'); }
  private async ensureActiveDepartment(organizationId: string, departmentId: string) { if (!(await this.prisma.hrDepartment.findFirst({ where: { id: departmentId, organizationId, isArchived: false } }))) throw new NotFoundException('Service RH introuvable ou archivé'); }
  private departmentIdForCatalogPosition(positionName: string, departments: Array<{ id: string; name: string }>) {
    const catalog = HR_CATALOG.find((item) => item.positions.some((position) => this.sameLabel(position, positionName)));
    if (!catalog) return null;
    return departments.find((department) => this.sameLabel(department.name, catalog.name))?.id ?? null;
  }
  private positionBelongsToDepartment(position: { name: string; departmentId?: string | null }, department: { id: string; name: string }) {
    if (position.departmentId) return position.departmentId === department.id;
    const catalog = HR_CATALOG.find((item) => this.sameLabel(item.name, department.name));
    return Boolean(catalog?.positions.some((name) => this.sameLabel(name, position.name)));
  }
  private shouldEnrichJobDescription(description?: string | null) {
    if (!description?.trim()) return true;
    return description.trim().length < 180;
  }
  private buildJobDescription(positionName: string, departmentName?: string | null) {
    const catalog = HR_CATALOG.find((item) => this.sameLabel(item.name, departmentName) || item.positions.some((position) => this.sameLabel(position, positionName)));
    const service = departmentName || catalog?.name || 'Service RH';
    const context = catalog?.description || `Activites rattachees au service ${service}.`;
    const normalized = this.normalizeLabel(`${positionName} ${service}`);
    const isManager = /responsable|directeur|chef|manager|maitre|maitre|coordinateur|gouvernant general/.test(normalized);
    const isProduction = /cuisine|patisserie|boulanger|production|commis|cuisinier|plongeur|preparateur|conditionneur|econome|magasinier/.test(normalized);
    const isService = /salle|serveur|bar|barista|accueil|reception|sommelier|runner|comptoir|hote|hotesse/.test(normalized);
    const isSupport = /administratif|comptable|rh|paie|achat|stock|maintenance|securite|logistique|entretien/.test(normalized);
    const missions = isManager
      ? ['Organiser et superviser l activite quotidienne du service.', 'Animer l equipe, repartir les priorites et accompagner la montee en competence.', 'Garantir la qualite de service, le respect des procedures internes et la bonne communication avec les autres services.', 'Suivre les indicateurs utiles et alerter la direction en cas d ecart.']
      : isProduction
        ? ['Preparer et realiser les productions selon les standards de l etablissement.', 'Respecter les fiches techniques, les quantites, les delais et les consignes d hygiene.', 'Participer a la mise en place, au rangement et a l entretien du poste de travail.', 'Signaler les besoins, anomalies, ruptures ou risques operationnels au responsable.']
        : isService
          ? ['Accueillir, conseiller et servir les clients avec professionnalisme.', 'Assurer la mise en place, le suivi du service et la fluidite de l experience client.', 'Appliquer les standards de presentation, d encaissement et de communication de l etablissement.', 'Transmettre les informations utiles aux equipes operationnelles et a la hierarchie.']
          : isSupport
            ? ['Assurer le traitement rigoureux des activites administratives ou support du service.', 'Tenir a jour les informations, documents et suivis necessaires au bon fonctionnement de l etablissement.', 'Collaborer avec les services internes et respecter les procedures de controle.', 'Identifier les anomalies et proposer des actions correctives simples.']
            : ['Realiser les missions confiees dans le respect des standards de l etablissement.', 'Contribuer a la qualite de service et a la satisfaction client ou interne.', 'Appliquer les procedures, consignes de securite et regles d organisation.', 'Alerter le responsable en cas de difficulte, risque ou besoin particulier.'];
    return [
      `FICHE DE POSTE - ${positionName}`,
      '',
      `Service rattache : ${service}`,
      `Contexte du service : ${context}`,
      '',
      'Mission generale',
      `${positionName} contribue au bon fonctionnement du service ${service} en assurant les missions operationnelles, relationnelles et organisationnelles liees a son metier. Le poste s exerce dans le respect des standards ToqueHub de qualite, de tracabilite, d hygiene, de securite et de collaboration interservices.`,
      '',
      'Missions principales',
      ...missions.map((mission) => `- ${mission}`),
      '',
      'Competences attendues',
      '- Maitrise des gestes, outils et procedures propres au poste.',
      '- Sens de l organisation, ponctualite et fiabilite dans l execution.',
      '- Communication claire avec les responsables, collegues et interlocuteurs concernes.',
      '- Respect des regles d hygiene, de securite, de confidentialite et de tenue professionnelle.',
      '',
      'Responsabilites',
      '- Appliquer les consignes transmises et rendre compte de l avancement.',
      '- Maintenir un environnement de travail propre, sur et conforme aux attentes de l etablissement.',
      '- Participer a l amelioration continue du service par des retours terrain utiles.',
      '',
      'Indicateurs de suivi',
      '- Qualite du travail realise et respect des delais.',
      '- Fiabilite des informations transmises.',
      '- Satisfaction client ou satisfaction interne selon le poste.',
      '- Respect des procedures et absence d incident majeur.',
      '',
      'Evolution et polyvalence',
      'Cette fiche peut etre adaptee par l utilisateur selon l organisation, le niveau d autonomie, les responsabilites exactes, les horaires, les formations obligatoires et les specificites de l etablissement.',
    ].join('\n');
  }
  private requiredDate(value: string, label: string) { const date = new Date(value); if (!value || Number.isNaN(date.getTime())) throw new BadRequestException(`${label} invalide ou manquante`); return date; }
  private optionalDate(value?: string | null, label = 'Date') { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} invalide`); return date; }
  private cleanText(value?: string | null) { return value && value.trim() ? value : null; }
  private sameLabel(a?: string | null, b?: string | null) { return this.normalizeLabel(a) === this.normalizeLabel(b); }
  private normalizeLabel(value?: string | null) { return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  private employeeData(organizationId: string, dto: UpsertHrEmployeeDto): Prisma.HrEmployeeUncheckedCreateInput {
    return {
      organizationId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      photoDataUrl: this.cleanText(dto.photoDataUrl),
      email: this.cleanText(dto.email),
      phone: this.cleanText(dto.phone),
      address: this.cleanText(dto.address),
      postalCode: this.cleanText(dto.postalCode),
      city: this.cleanText(dto.city),
      country: this.cleanText(dto.country),
      primaryLanguage: this.cleanText(dto.primaryLanguage),
      secondaryLanguage: this.cleanText(dto.secondaryLanguage),
      emergencyContact: this.cleanText(dto.emergencyContact),
      birthDate: this.optionalDate(dto.birthDate, 'Date de naissance'),
      hireDate: this.requiredDate(dto.hireDate, 'Date d\'embauche'),
      departmentId: dto.departmentId,
      positionId: dto.positionId,
      mainSiteId: this.cleanText(dto.mainSiteId),
      employeeNumber: this.cleanText(dto.employeeNumber),
      notes: this.cleanText(dto.notes),
      status: dto.status ?? HrEmployeeStatus.ACTIVE,
      userId: this.cleanText(dto.userId),
      managerId: this.cleanText(dto.managerId),
      contractType: this.cleanText(dto.contractType),
      contractEndDate: this.optionalDate(dto.contractEndDate, 'Date de fin de contrat'),
      trialEndDate: this.optionalDate(dto.trialEndDate, 'Date de fin de période d\'essai'),
      contractWeeklyMinutes: dto.contractWeeklyMinutes ?? null,
      hourlyRate: dto.hourlyRate != null && Number.isFinite(dto.hourlyRate) ? new Prisma.Decimal(dto.hourlyRate) : null,
      currency: this.cleanText(dto.currency),
      rateEffectiveDate: this.optionalDate(dto.rateEffectiveDate, 'Date d\'effet'),
      nextReviewDate: this.optionalDate(dto.nextReviewDate, 'Date de prochaine revalorisation'),
      reviewFrequency: this.cleanText(dto.reviewFrequency),
    };
  }
  private employeeUpdateData(dto: UpsertHrEmployeeDto): Prisma.HrEmployeeUncheckedUpdateInput {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      photoDataUrl: this.cleanText(dto.photoDataUrl),
      email: this.cleanText(dto.email),
      phone: this.cleanText(dto.phone),
      address: this.cleanText(dto.address),
      postalCode: this.cleanText(dto.postalCode),
      city: this.cleanText(dto.city),
      country: this.cleanText(dto.country),
      primaryLanguage: this.cleanText(dto.primaryLanguage),
      secondaryLanguage: this.cleanText(dto.secondaryLanguage),
      emergencyContact: this.cleanText(dto.emergencyContact),
      birthDate: this.optionalDate(dto.birthDate, 'Date de naissance'),
      hireDate: this.requiredDate(dto.hireDate, 'Date d\'embauche'),
      departmentId: dto.departmentId,
      positionId: dto.positionId,
      mainSiteId: this.cleanText(dto.mainSiteId),
      employeeNumber: this.cleanText(dto.employeeNumber),
      notes: this.cleanText(dto.notes),
      status: dto.status ?? HrEmployeeStatus.ACTIVE,
      userId: this.cleanText(dto.userId),
      managerId: this.cleanText(dto.managerId),
      contractType: this.cleanText(dto.contractType),
      contractEndDate: this.optionalDate(dto.contractEndDate, 'Date de fin de contrat'),
      trialEndDate: this.optionalDate(dto.trialEndDate, 'Date de fin de période d\'essai'),
      contractWeeklyMinutes: dto.contractWeeklyMinutes ?? null,
      hourlyRate: dto.hourlyRate != null && Number.isFinite(dto.hourlyRate) ? new Prisma.Decimal(dto.hourlyRate) : null,
      currency: this.cleanText(dto.currency),
      rateEffectiveDate: this.optionalDate(dto.rateEffectiveDate, 'Date d\'effet'),
      nextReviewDate: this.optionalDate(dto.nextReviewDate, 'Date de prochaine revalorisation'),
      reviewFrequency: this.cleanText(dto.reviewFrequency),
    };
  }
  private async syncContractAndCompensation(tx: Tx, organizationId: string, employeeId: string, dto: UpsertHrEmployeeDto, actorId: string) {
    const lastContract = await tx.hrEmploymentContract.findFirst({ where: { employeeId, status: HrContractStatus.ACTIVE }, orderBy: { startDate: 'desc' } });
    const lastCompensation = await tx.hrEmployeeCompensation.findFirst({ where: { employeeId, effectiveTo: null }, orderBy: { effectiveFrom: 'desc' } });
    const lastReview = await tx.hrSalaryReview.findFirst({ where: { employeeId, status: { in: ['UPCOMING', 'DUE_SOON', 'DUE'] as any } }, orderBy: { dueDate: 'asc' } });

    const contractChanged = this.isContractChanged(dto, lastContract);
    if (contractChanged) {
      if (lastContract) {
        await tx.hrEmploymentContract.updateMany({ where: { employeeId, status: HrContractStatus.ACTIVE }, data: { status: HrContractStatus.ENDED } });
        await this.history(tx, organizationId, employeeId, actorId, HrHistoryEventType.CONTRACT_ENDED, 'Clôture du contrat précédent', { contractId: lastContract.id });
      }
      const newContract = await tx.hrEmploymentContract.create({ data: { organizationId, employeeId, contractType: dto.contractType || 'CDI', startDate: this.optionalDate(dto.rateEffectiveDate, 'Date d\'effet') ?? new Date(), endDate: this.optionalDate(dto.contractEndDate, 'Date de fin de contrat'), weeklyHours: dto.contractWeeklyMinutes ?? null, trialEndDate: this.optionalDate(dto.trialEndDate, 'Date de fin de période d\'essai'), status: HrContractStatus.ACTIVE, createdById: actorId } });
      await this.history(tx, organizationId, employeeId, actorId, HrHistoryEventType.CONTRACT_CREATED, 'Création d\'un nouveau contrat', { contractId: newContract.id, contractType: dto.contractType });
    }

    const compensationChanged = this.isCompensationChanged(dto, lastCompensation);
    if (compensationChanged) {
      if (lastCompensation) {
        await tx.hrEmployeeCompensation.updateMany({ where: { employeeId, effectiveTo: null }, data: { effectiveTo: new Date() } });
        await this.history(tx, organizationId, employeeId, actorId, HrHistoryEventType.COMPENSATION_ENDED, 'Clôture de la rémunération précédente', { compensationId: lastCompensation.id });
      }
      const newCompensation = await tx.hrEmployeeCompensation.create({ data: { employeeId, hourlyRate: new Prisma.Decimal(dto.hourlyRate!), currency: dto.currency || 'EUR', effectiveFrom: this.optionalDate(dto.rateEffectiveDate, 'Date d\'effet') ?? new Date(), reason: 'Modification depuis la fiche collaborateur', createdById: actorId } });
      await this.history(tx, organizationId, employeeId, actorId, HrHistoryEventType.COMPENSATION_CREATED, 'Nouvelle rémunération enregistrée', { compensationId: newCompensation.id, hourlyRate: dto.hourlyRate });
    }

    const reviewChanged = this.isReviewChanged(dto, lastReview);
    if (reviewChanged) {
      if (lastReview) {
        await tx.hrSalaryReview.updateMany({ where: { employeeId, status: { in: ['UPCOMING', 'DUE_SOON', 'DUE'] as any } }, data: { status: 'POSTPONED' as any } });
        await this.history(tx, organizationId, employeeId, actorId, HrHistoryEventType.REVIEW_POSTPONED, 'Revalorisation reportée', { reviewId: lastReview.id });
      }
      const dueDate = this.optionalDate(dto.nextReviewDate, 'Date de prochaine revalorisation');
      if (!dueDate) throw new BadRequestException('Date de prochaine revalorisation invalide');
      const newReview = await tx.hrSalaryReview.create({ data: { employeeId, dueDate, frequencyMonths: this.parseFrequency(dto.reviewFrequency), notes: dto.reviewFrequency ? `Fréquence : ${dto.reviewFrequency}` : undefined } });
      await this.history(tx, organizationId, employeeId, actorId, HrHistoryEventType.REVIEW_CREATED, 'Revalorisation planifiée', { reviewId: newReview.id, dueDate: dto.nextReviewDate });
    }
  }

  private isContractChanged(dto: UpsertHrEmployeeDto, lastContract: { contractType: string; endDate: Date | null; weeklyHours: number | null; trialEndDate: Date | null } | null): boolean {
    const hasData = dto.contractType || dto.contractEndDate || dto.trialEndDate || dto.contractWeeklyMinutes != null;
    if (!hasData) return false;
    if (!lastContract) return true;
    const sameType = (dto.contractType || 'CDI') === lastContract.contractType;
    const dtoEnd = this.optionalDate(dto.contractEndDate, 'Date de fin de contrat');
    const dtoTrial = this.optionalDate(dto.trialEndDate, 'Date de fin de période d\'essai');
    const sameEnd = (dtoEnd ? dtoEnd.toISOString().slice(0, 10) : null) === (lastContract.endDate ? lastContract.endDate.toISOString().slice(0, 10) : null);
    const sameWeekly = (dto.contractWeeklyMinutes ?? null) === (lastContract.weeklyHours ?? null);
    const sameTrial = (dtoTrial ? dtoTrial.toISOString().slice(0, 10) : null) === (lastContract.trialEndDate ? lastContract.trialEndDate.toISOString().slice(0, 10) : null);
    return !(sameType && sameEnd && sameWeekly && sameTrial);
  }

  private isCompensationChanged(dto: UpsertHrEmployeeDto, lastCompensation: { hourlyRate: Prisma.Decimal; currency: string } | null): boolean {
    if (dto.hourlyRate == null) return false;
    if (!lastCompensation) return true;
    const sameRate = new Prisma.Decimal(dto.hourlyRate).equals(lastCompensation.hourlyRate);
    const sameCurrency = (dto.currency || 'EUR') === lastCompensation.currency;
    return !(sameRate && sameCurrency);
  }

  private isReviewChanged(dto: UpsertHrEmployeeDto, lastReview: { dueDate: Date; frequencyMonths: number | null } | null): boolean {
    if (!dto.nextReviewDate) return false;
    if (!lastReview) return true;
    const nextReviewDate = this.optionalDate(dto.nextReviewDate, 'Date de prochaine revalorisation');
    if (!nextReviewDate) return false;
    const sameDate = nextReviewDate.toISOString().slice(0, 10) === lastReview.dueDate.toISOString().slice(0, 10);
    const sameFreq = this.parseFrequency(dto.reviewFrequency) === lastReview.frequencyMonths;
    return !(sameDate && sameFreq);
  }

  private parseFrequency(value?: string): number | null {
    switch (value) {
      case 'MONTHLY': return 1;
      case 'QUARTERLY': return 3;
      case 'YEARLY': return 12;
      default: return null;
    }
  }

  private parseDocumentCategory(value?: string): HrDocumentCategory {
    const normalized = (value || 'OTHER').toUpperCase();
    if (Object.values(HrDocumentCategory).includes(normalized as HrDocumentCategory)) return normalized as HrDocumentCategory;
    return HrDocumentCategory.OTHER;
  }

  private history(tx: Tx, organizationId: string, employeeId: string, userId: string, type: HrHistoryEventType, label: string, details?: Prisma.InputJsonValue) { return tx.hrEmployeeHistory.create({ data: { organizationId, employeeId, userId, type, label, details } }); }
}
