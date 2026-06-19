import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, HrEmployeeStatus, HrHistoryEventType, HrRotationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignHrRotationDto, ChangeEmployeeRotationDto, HrListQueryDto, RemoveHrRotationDto, UpsertHrEmployeeDto, UpsertHrReferenceDto, UpsertHrRotationDto } from './dto/hr.dto';

type Actor = { id: string; role: string };
type Tx = Prisma.TransactionClient;
const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];
const DEFAULT_DEPARTMENTS = ['Cuisine', 'Pâtisserie', 'Administration', 'Entretien', 'Soins', 'Animation', 'Direction', 'Magasin'];
const DEFAULT_POSITIONS = ['Chef de cuisine', 'Second de cuisine', 'Commis', 'Pâtissier', 'Magasinier', 'Agent polyvalent', 'Directeur', 'Infirmier', 'Animateur'];
const ROTATION_DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const includeRotation = { department: true, assignments: { where: { endDate: null }, include: { employee: { include: { department: true, position: true } } }, orderBy: { createdAt: 'desc' as const } } };
const includeEmployee = { department: true, position: true, mainSite: true, user: { select: { id: true, email: true, firstName: true, lastName: true, role: { select: { name: true } } } }, manager: { select: { id: true, firstName: true, lastName: true } }, rotationAssignments: { where: { endDate: null }, include: { rotation: { include: { department: true } } }, orderBy: { createdAt: 'desc' as const }, take: 1 }, history: { orderBy: { createdAt: 'desc' as const }, take: 30, include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } } };

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) { if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('RH write access is restricted to managers and administrators'); }
  private page(q?: HrListQueryDto) { const take = Math.min(q?.pageSize ?? 50, 200); return { take, skip: ((q?.page ?? 1) - 1) * take }; }

  async installDefaults(organizationId: string, actor: Actor) {
    this.assertWrite(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: { hrInstalledAt: new Date() } });
      await tx.hrDepartment.createMany({ data: DEFAULT_DEPARTMENTS.map((name) => ({ organizationId, name })), skipDuplicates: true });
      await tx.hrPosition.createMany({ data: DEFAULT_POSITIONS.map((name) => ({ organizationId, name })), skipDuplicates: true });
      await this.ensureDefaultRotations(tx, organizationId);
      await tx.auditLog.create({ data: { organizationId, userId: actor.id, action: AuditAction.MODULE_HR_INSTALLED, entityType: 'Module', entityId: 'hr', entityName: 'RH' } });
      return { installed: true };
    });
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

  listPositions(organizationId: string, q: HrListQueryDto = {}) { return this.prisma.hrPosition.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined }, orderBy: { name: 'asc' }, ...this.page(q) }); }
  createPosition(organizationId: string, actor: Actor, dto: UpsertHrReferenceDto) { this.assertWrite(actor); return this.prisma.hrPosition.create({ data: { ...dto, organizationId } }); }
  updatePosition(organizationId: string, actor: Actor, id: string, dto: UpsertHrReferenceDto) { this.assertWrite(actor); return this.prisma.hrPosition.update({ where: { id, organizationId }, data: dto }); }
  archivePosition(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); return this.prisma.hrPosition.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() } }); }

  async listEmployees(organizationId: string, q: HrListQueryDto = {}) {
    const OR = q.search ? [{ firstName: { contains: q.search, mode: 'insensitive' as const } }, { lastName: { contains: q.search, mode: 'insensitive' as const } }, { email: { contains: q.search, mode: 'insensitive' as const } }, { department: { name: { contains: q.search, mode: 'insensitive' as const } } }, { position: { name: { contains: q.search, mode: 'insensitive' as const } } }] : undefined;
    return this.prisma.hrEmployee.findMany({ where: { organizationId, ...(q.includeArchived ? {} : { isArchived: false }), status: q.status, departmentId: q.departmentId, positionId: q.positionId, ...(q.linkedToUser === undefined ? {} : { userId: q.linkedToUser ? { not: null } : null }), OR }, include: includeEmployee, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], ...this.page(q) });
  }

  async getEmployee(organizationId: string, id: string) {
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id, organizationId }, include: includeEmployee });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');
    return employee;
  }

  async createEmployee(organizationId: string, actor: Actor, dto: UpsertHrEmployeeDto) {
    this.assertWrite(actor);
    await this.validateEmployeeRefs(organizationId, dto);
    if (dto.email) await this.ensureEmailAvailable(organizationId, dto.email);
    if (dto.userId) await this.ensureUserAvailable(organizationId, dto.userId);
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.hrEmployee.create({ data: this.employeeData(organizationId, dto), include: includeEmployee });
      await this.history(tx, organizationId, employee.id, actor.id, HrHistoryEventType.CREATED, 'Création du collaborateur');
      if (dto.userId) await this.history(tx, organizationId, employee.id, actor.id, HrHistoryEventType.USER_LINKED, 'Compte ToqueHub associé', { userId: dto.userId });
      return employee;
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
      await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.UPDATED, 'Mise à jour du collaborateur');
      if (dto.status && dto.status !== current.status) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.STATUS_CHANGED, 'Changement de statut', { from: current.status, to: dto.status });
      if (dto.departmentId !== current.departmentId) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.DEPARTMENT_CHANGED, 'Changement de service');
      if (dto.positionId !== current.positionId) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.POSITION_CHANGED, 'Changement de poste');
      if (dto.userId !== current.userId) await this.history(tx, organizationId, id, actor.id, dto.userId ? HrHistoryEventType.USER_LINKED : HrHistoryEventType.USER_UNLINKED, dto.userId ? 'Compte ToqueHub associé' : 'Compte ToqueHub retiré');
      if (dto.managerId !== current.managerId) await this.history(tx, organizationId, id, actor.id, HrHistoryEventType.MANAGER_CHANGED, 'Changement de responsable');
      return updated;
    });
  }

  async archiveEmployee(organizationId: string, actor: Actor, id: string) {
    this.assertWrite(actor);
    const employee = await this.prisma.hrEmployee.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() }, include: includeEmployee });
    await this.prisma.hrEmployeeHistory.create({ data: { organizationId, employeeId: id, userId: actor.id, type: HrHistoryEventType.ARCHIVED, label: 'Archivage du collaborateur' } });
    return employee;
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
    const [department, position] = await Promise.all([this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId } }), this.prisma.hrPosition.findFirst({ where: { id: dto.positionId, organizationId } })]);
    if (!department) throw new NotFoundException('Service RH introuvable');
    if (!position) throw new NotFoundException('Poste RH introuvable');
    if (dto.mainSiteId && !(await this.prisma.site.findFirst({ where: { id: dto.mainSiteId, organizationId } }))) throw new NotFoundException('Site introuvable');
    if (dto.managerId) {
      if (dto.managerId === employeeId) throw new BadRequestException('Un collaborateur ne peut pas être son propre responsable');
      const manager = await this.prisma.hrEmployee.findFirst({ where: { id: dto.managerId, organizationId, isArchived: false } });
      if (!manager) throw new NotFoundException('Responsable introuvable');
      if (employeeId && (await this.wouldCreateCycle(organizationId, employeeId, dto.managerId))) throw new BadRequestException('Boucle hiérarchique détectée');
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
  private employeeData(organizationId: string, dto: UpsertHrEmployeeDto): Prisma.HrEmployeeUncheckedCreateInput { return { organizationId, firstName: dto.firstName, lastName: dto.lastName, photoDataUrl: dto.photoDataUrl || null, email: dto.email || null, phone: dto.phone || null, address: dto.address || null, birthDate: dto.birthDate ? new Date(dto.birthDate) : null, hireDate: new Date(dto.hireDate), departmentId: dto.departmentId, positionId: dto.positionId, mainSiteId: dto.mainSiteId || null, employeeNumber: dto.employeeNumber || null, notes: dto.notes || null, status: dto.status ?? HrEmployeeStatus.ACTIVE, userId: dto.userId || null, managerId: dto.managerId || null }; }
  private employeeUpdateData(dto: UpsertHrEmployeeDto): Prisma.HrEmployeeUncheckedUpdateInput { return { firstName: dto.firstName, lastName: dto.lastName, photoDataUrl: dto.photoDataUrl || null, email: dto.email || null, phone: dto.phone || null, address: dto.address || null, birthDate: dto.birthDate ? new Date(dto.birthDate) : null, hireDate: new Date(dto.hireDate), departmentId: dto.departmentId, positionId: dto.positionId, mainSiteId: dto.mainSiteId || null, employeeNumber: dto.employeeNumber || null, notes: dto.notes || null, status: dto.status ?? HrEmployeeStatus.ACTIVE, userId: dto.userId || null, managerId: dto.managerId || null }; }
  private history(tx: Tx, organizationId: string, employeeId: string, userId: string, type: HrHistoryEventType, label: string, details?: Prisma.InputJsonValue) { return tx.hrEmployeeHistory.create({ data: { organizationId, employeeId, userId, type, label, details } }); }
}
