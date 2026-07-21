import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HrEmployeeStatus,
  OperationalTaskStatus,
  PlanningAssignmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  OperationalTaskAssigneeQueryDto,
  GenerateOperationalTasksFromMenuDto,
  OperationalTaskQueryDto,
  OperationalTaskOptionsQueryDto,
  UpdateOperationalTaskDto,
  UpdateOperationalTaskStatusDto,
  UpsertOperationalTaskDto,
} from './dto/operational-task.dto';
import {
  defaultTaskPresets,
  positionSupportsTechnicalSheets,
  type HrPositionTaskPreset,
} from '../hr/hr-task-presets';

type TaskActor = {
  id: string;
  role?: string;
  permissions?: string[];
  employeeId?: string | null;
};

type TaskScope = {
  global: boolean;
  employeeIds: Set<string>;
  departmentIds: Set<string>;
  actorEmployeeId?: string;
  managesPeople: boolean;
};

const TASK_INCLUDE = {
  department: true,
  position: true,
  site: true,
  assignedEmployee: {
    include: { department: true, position: true, mainSite: true },
  },
  planningAssignment: true,
  menu: { select: { id: true, name: true, date: true, service: true } },
  technicalSheet: { select: { id: true, name: true, referencePortions: true } },
  technicalSheetStep: { select: { id: true, order: true, title: true, description: true, estimatedMinutes: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.OperationalTaskInclude;

@Injectable()
export class OperationalTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async context(organizationId: string, actor: TaskActor) {
    const scope = await this.scope(organizationId, actor);
    const departments = await this.prisma.hrDepartment.findMany({
      where: {
        organizationId,
        isArchived: false,
        ...(scope.global ? {} : { id: { in: [...scope.departmentIds] } }),
      },
      orderBy: { name: 'asc' },
    });
    return {
      departments,
      ownEmployeeId: scope.actorEmployeeId ?? null,
      managesPeople: scope.managesPeople,
      canCreateUnassigned: scope.global || scope.managesPeople,
    };
  }

  async options(organizationId: string, actor: TaskActor, query: OperationalTaskOptionsQueryDto) {
    const scope = await this.scope(organizationId, actor);
    if (query.departmentId) {
      await this.department(organizationId, query.departmentId);
      if (!scope.global && !scope.departmentIds.has(query.departmentId)) {
        throw new ForbiddenException('Ce service ne fait pas partie de votre périmètre RH.');
      }
    }
    const now = new Date();
    const [positions, sheets] = await Promise.all([
      this.prisma.hrPosition.findMany({
        where: {
          organizationId,
          isArchived: false,
          ...(query.departmentId ? { OR: [{ departmentId: query.departmentId }, { departmentId: null }] } : {}),
        },
        include: { department: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.technicalSheet.findMany({
        where: { organizationId, isArchived: false, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          referencePortions: true,
          totalTimeMinutes: true,
          preparationTimeMinutes: true,
          cookingTimeMinutes: true,
          steps: { orderBy: { order: 'asc' }, select: { id: true, order: true, title: true, description: true, estimatedMinutes: true } },
          menuItems: {
            where: {
              menu: {
                status: { in: ['VALIDATED', 'PUBLISHED'] },
                AND: [
                  { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
                  { OR: [{ activeUntil: null }, { activeUntil: { gte: now } }] },
                ],
              },
            },
            select: { menu: { select: { id: true, name: true } } },
          },
        },
        orderBy: { name: 'asc' },
        take: 400,
      }),
    ]);
    const eligiblePositions = positions.filter((position) =>
      positionSupportsTechnicalSheets(position.name, position.department?.name),
    );
    const presets = positions.flatMap((position) => {
      const supportsTechnicalSheets = positionSupportsTechnicalSheets(position.name, position.department?.name);
      return this.positionTaskPresets(position.taskPresets, position.name, position.department?.name)
        .filter((task) => !task.requiresTechnicalSheet || supportsTechnicalSheets)
        .map((task) => ({
          ...task,
          positionId: position.id,
          positionName: position.name,
        }));
    });
    const technicalSheets = (eligiblePositions.length ? sheets : [])
      .map((sheet) => {
        const menuNames = [...new Set(sheet.menuItems.map((item) => item.menu.name))];
        return {
          id: sheet.id,
          name: sheet.name,
          referencePortions: sheet.referencePortions,
          totalTimeMinutes: Math.max(5, sheet.totalTimeMinutes || (sheet.preparationTimeMinutes ?? 0) + (sheet.cookingTimeMinutes ?? 0) || sheet.steps.reduce((total, step) => total + (step.estimatedMinutes ?? 0), 0) || 30),
          isOnCurrentMenu: menuNames.length > 0,
          menuNames,
          steps: sheet.steps.map((step) => ({ ...step, estimatedMinutes: Math.max(5, step.estimatedMinutes ?? 15) })),
        };
      })
      .sort((a, b) => Number(b.isOnCurrentMenu) - Number(a.isOnCurrentMenu) || a.name.localeCompare(b.name, 'fr'));
    return { presets, technicalSheets };
  }

  async list(organizationId: string, actor: TaskActor, query: OperationalTaskQueryDto) {
    const scope = await this.scope(organizationId, actor);
    const start = this.date(query.startDate, 'Date de début invalide');
    const end = this.date(query.endDate, 'Date de fin invalide');
    if (start >= end) throw new BadRequestException('La période demandée est invalide.');
    if (end.getTime() - start.getTime() > 1000 * 60 * 60 * 24 * 93) {
      throw new BadRequestException('La période ne peut pas dépasser 93 jours.');
    }

    const visibility = this.visibilityWhere(scope, actor);
    const where: Prisma.OperationalTaskWhereInput = {
      organizationId,
      startsAt: { lt: end },
      endsAt: { gt: start },
      departmentId: query.departmentId,
      assignedEmployeeId: query.employeeId,
      status: query.status,
      AND: [visibility],
    };
    return this.prisma.operationalTask.findMany({
      where,
      include: TASK_INCLUDE,
      orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
      take: 2500,
    });
  }

  async assignees(
    organizationId: string,
    actor: TaskActor,
    query: OperationalTaskAssigneeQueryDto,
  ) {
    const scope = await this.scope(organizationId, actor);
    const startsAt = this.date(query.startsAt, 'Heure de début invalide');
    const endsAt = this.date(query.endsAt, 'Heure de fin invalide');
    this.assertPeriod(startsAt, endsAt);
    await this.department(organizationId, query.departmentId);
    if (!scope.global && !scope.departmentIds.has(query.departmentId)) {
      throw new ForbiddenException('Ce service ne fait pas partie de votre périmètre RH.');
    }

    const employees = await this.prisma.hrEmployee.findMany({
      where: {
        organizationId,
        departmentId: query.departmentId,
        status: HrEmployeeStatus.ACTIVE,
        isArchived: false,
        ...(scope.global ? {} : { id: { in: [...scope.employeeIds] } }),
      },
      include: { department: true, position: true, mainSite: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const shifts = await this.prisma.planningAssignment.findMany({
      where: {
        organizationId,
        employeeId: { in: employees.map((employee) => employee.id) },
        status: { not: PlanningAssignmentStatus.CANCELLED },
        startTime: { lte: startsAt },
        endTime: { gte: endsAt },
      },
      include: { site: true, position: true },
    });
    const conflicts = employees.length
      ? await this.prisma.operationalTask.findMany({
          where: {
            organizationId,
            assignedEmployeeId: { in: employees.map((employee) => employee.id) },
            status: { in: ['TODO', 'IN_PROGRESS'] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            ...(query.taskId ? { id: { not: query.taskId } } : {}),
          },
          select: { id: true, title: true, assignedEmployeeId: true, startsAt: true, endsAt: true },
        })
      : [];
    const shiftByEmployee = new Map(shifts.map((shift) => [shift.employeeId, shift]));
    const conflictByEmployee = new Map(
      conflicts.map((task) => [task.assignedEmployeeId, task]),
    );
    return employees.map((employee) => {
      const planningAssignment = shiftByEmployee.get(employee.id) ?? null;
      const operationalConflict = conflictByEmployee.get(employee.id) ?? null;
      const available = Boolean(planningAssignment) && !operationalConflict;
      return {
        ...employee,
        available,
        planningAssignment,
        operationalConflict,
        availabilityLabel: !planningAssignment
          ? 'Hors planning'
          : operationalConflict
            ? `Déjà occupé · ${operationalConflict.title}`
            : 'Disponible sur son planning',
      };
    });
  }

  async create(organizationId: string, actor: TaskActor, dto: UpsertOperationalTaskDto) {
    const scope = await this.scope(organizationId, actor);
    const startsAt = this.date(dto.startsAt, 'Heure de début invalide');
    const endsAt = this.date(dto.endsAt, 'Heure de fin invalide');
    this.assertPeriod(startsAt, endsAt);
    await this.validateReferences(organizationId, dto);
    await this.assertCanCreate(scope, actor, dto.departmentId, dto.assignedEmployeeId);
    const planningAssignmentId = dto.assignedEmployeeId
      ? await this.matchingPlanningAssignment(
          organizationId,
          dto.assignedEmployeeId,
          startsAt,
          endsAt,
        )
      : null;

    return this.prisma.operationalTask.create({
      data: {
        organizationId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        category: dto.category,
        source: dto.source ?? 'MANUAL',
        departmentId: dto.departmentId,
        positionId: dto.positionId ?? null,
        siteId: dto.siteId ?? null,
        assignedEmployeeId: dto.assignedEmployeeId ?? null,
        planningAssignmentId,
        menuId: dto.menuId ?? null,
        technicalSheetId: dto.technicalSheetId ?? null,
        technicalSheetStepId: dto.technicalSheetStepId ?? null,
        positionTaskPresetId: dto.positionTaskPresetId ?? null,
        startsAt,
        endsAt,
        quantity: dto.quantity == null ? null : new Prisma.Decimal(dto.quantity),
        unitLabel: dto.unitLabel?.trim() || null,
        createdById: actor.id,
      },
      include: TASK_INCLUDE,
    });
  }

  async generateFromMenu(
    organizationId: string,
    actor: TaskActor,
    dto: GenerateOperationalTasksFromMenuDto,
  ) {
    const scope = await this.scope(organizationId, actor);
    await this.department(organizationId, dto.departmentId);
    await this.assertCanCreate(scope, actor, dto.departmentId);
    const menu = await this.prisma.menu.findFirst({
      where: { id: dto.menuId, organizationId },
      include: {
        items: {
          where: { technicalSheetId: { not: null } },
          include: { technicalSheet: true },
          orderBy: [{ position: 'asc' }],
        },
      },
    });
    if (!menu) throw new NotFoundException('Menu introuvable.');
    const items = menu.items.filter(
      (item) => item.technicalSheet && !item.technicalSheet.isArchived,
    );
    if (!items.length) {
      throw new BadRequestException(
        'Ce menu ne contient aucune fiche technique à planifier.',
      );
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.serviceTime)) {
      throw new BadRequestException("L'heure de service est invalide.");
    }
    const day = dto.date.slice(0, 10);
    const serviceAt = this.date(
      `${day}T${dto.serviceTime}:00`,
      'Date de service invalide',
    );
    const created = [];
    const skipped: Array<{ technicalSheetId: string; name: string; reason: string }> = [];

    for (const item of items) {
      const sheet = item.technicalSheet!;
      const duration = Math.max(
        15,
        sheet.totalTimeMinutes ||
          (sheet.preparationTimeMinutes ?? 0) + (sheet.cookingTimeMinutes ?? 0) ||
          60,
      );
      const startsAt = new Date(serviceAt.getTime() - duration * 60_000);
      const existing = await this.prisma.operationalTask.findFirst({
        where: {
          organizationId,
          menuId: menu.id,
          technicalSheetId: sheet.id,
          startsAt,
          status: { not: 'CANCELLED' },
        },
      });
      if (existing) {
        skipped.push({
          technicalSheetId: sheet.id,
          name: sheet.name,
          reason: 'Déjà planifiée pour ce service',
        });
        continue;
      }
      const quantity =
        item.targetReadyQuantity ??
        item.portionsOverride ??
        (menu.expectedGuests > 0
          ? new Prisma.Decimal(menu.expectedGuests).mul(item.servingQuantity)
          : sheet.referencePortions);
      const task = await this.prisma.operationalTask.create({
        data: {
          organizationId,
          title: `Préparer · ${sheet.name}`,
          description: `Préparation pour « ${menu.name} » · service à ${dto.serviceTime}.`,
          category: 'KITCHEN',
          source: 'MENU',
          departmentId: dto.departmentId,
          siteId: dto.siteId ?? menu.siteId,
          menuId: menu.id,
          technicalSheetId: sheet.id,
          startsAt,
          endsAt: serviceAt,
          quantity,
          unitLabel: 'portions',
          createdById: actor.id,
        },
        include: TASK_INCLUDE,
      });
      created.push(task);
    }
    return { menu: { id: menu.id, name: menu.name }, created, skipped };
  }

  async update(
    organizationId: string,
    actor: TaskActor,
    id: string,
    dto: UpdateOperationalTaskDto,
  ) {
    const scope = await this.scope(organizationId, actor);
    const existing = await this.getVisible(organizationId, actor, scope, id);
    const startsAt = dto.startsAt ? this.date(dto.startsAt, 'Heure de début invalide') : existing.startsAt;
    const endsAt = dto.endsAt ? this.date(dto.endsAt, 'Heure de fin invalide') : existing.endsAt;
    this.assertPeriod(startsAt, endsAt);
    const departmentId = dto.departmentId ?? existing.departmentId;
    const assignedEmployeeId = Object.hasOwn(dto, 'assignedEmployeeId')
      ? dto.assignedEmployeeId ?? null
      : existing.assignedEmployeeId;
    await this.validateReferences(organizationId, {
      departmentId,
      positionId: dto.positionId === undefined ? existing.positionId ?? undefined : dto.positionId ?? undefined,
      siteId: dto.siteId === undefined ? existing.siteId ?? undefined : dto.siteId ?? undefined,
      assignedEmployeeId: assignedEmployeeId ?? undefined,
      menuId: dto.menuId === undefined ? existing.menuId ?? undefined : dto.menuId ?? undefined,
      technicalSheetId: dto.technicalSheetId === undefined ? existing.technicalSheetId ?? undefined : dto.technicalSheetId ?? undefined,
      technicalSheetStepId: dto.technicalSheetStepId === undefined ? existing.technicalSheetStepId ?? undefined : dto.technicalSheetStepId ?? undefined,
      positionTaskPresetId: dto.positionTaskPresetId === undefined ? existing.positionTaskPresetId ?? undefined : dto.positionTaskPresetId ?? undefined,
    });
    await this.assertCanCreate(scope, actor, departmentId, assignedEmployeeId ?? undefined);
    const planningAssignmentId = assignedEmployeeId
      ? await this.matchingPlanningAssignment(
          organizationId,
          assignedEmployeeId,
          startsAt,
          endsAt,
        )
      : null;

    return this.prisma.operationalTask.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
        category: dto.category,
        departmentId: dto.departmentId,
        positionId: dto.positionId === undefined ? undefined : dto.positionId,
        siteId: dto.siteId === undefined ? undefined : dto.siteId,
        assignedEmployeeId,
        planningAssignmentId,
        startsAt,
        endsAt,
        quantity:
          dto.quantity === undefined
            ? undefined
            : dto.quantity === null
              ? null
              : new Prisma.Decimal(dto.quantity),
        unitLabel: dto.unitLabel === undefined ? undefined : dto.unitLabel?.trim() || null,
        source: dto.source,
        menuId: dto.menuId === undefined ? undefined : dto.menuId,
        technicalSheetId: dto.technicalSheetId === undefined ? undefined : dto.technicalSheetId,
        technicalSheetStepId: dto.technicalSheetStepId === undefined ? undefined : dto.technicalSheetStepId,
        positionTaskPresetId: dto.positionTaskPresetId === undefined ? undefined : dto.positionTaskPresetId,
      },
      include: TASK_INCLUDE,
    });
  }

  async updateStatus(
    organizationId: string,
    actor: TaskActor,
    id: string,
    dto: UpdateOperationalTaskStatusDto,
  ) {
    const scope = await this.scope(organizationId, actor);
    await this.getVisible(organizationId, actor, scope, id);
    return this.prisma.operationalTask.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: dto.status === OperationalTaskStatus.COMPLETED ? new Date() : null,
      },
      include: TASK_INCLUDE,
    });
  }

  private async getVisible(
    organizationId: string,
    actor: TaskActor,
    scope: TaskScope,
    id: string,
  ) {
    const task = await this.prisma.operationalTask.findFirst({
      where: { id, organizationId, AND: [this.visibilityWhere(scope, actor)] },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Tâche introuvable dans votre périmètre.');
    return task;
  }

  private async validateReferences(
    organizationId: string,
    dto: {
      departmentId: string;
      positionId?: string;
      siteId?: string;
      assignedEmployeeId?: string;
      menuId?: string;
      technicalSheetId?: string;
      technicalSheetStepId?: string;
      positionTaskPresetId?: string;
    },
  ) {
    const department = await this.department(organizationId, dto.departmentId);
    let selectedPosition: { id: string; name: string; departmentId: string | null; department?: { name: string } | null } | null = null;
    if (dto.positionId) {
      selectedPosition = await this.prisma.hrPosition.findFirst({
        where: { id: dto.positionId, organizationId, isArchived: false },
        include: { department: { select: { name: true } } },
      });
      if (!selectedPosition) throw new BadRequestException('Poste RH introuvable.');
      if (selectedPosition.departmentId && selectedPosition.departmentId !== department.id) {
        throw new BadRequestException('Le poste ne dépend pas du service sélectionné.');
      }
    }
    if (dto.siteId) {
      const site = await this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, isArchived: false },
      });
      if (!site) throw new BadRequestException('Site introuvable.');
    }
    let assignedEmployee: { departmentId: string; position?: { id: string; name: string; department?: { name: string } | null } | null } | null = null;
    if (dto.assignedEmployeeId) {
      assignedEmployee = await this.prisma.hrEmployee.findFirst({
        where: {
          id: dto.assignedEmployeeId,
          organizationId,
          status: HrEmployeeStatus.ACTIVE,
          isArchived: false,
        },
        include: { position: { include: { department: { select: { name: true } } } } },
      });
      if (!assignedEmployee) throw new BadRequestException('Collaborateur RH introuvable.');
      if (assignedEmployee.departmentId !== department.id) {
        throw new BadRequestException('Le collaborateur ne dépend pas du service sélectionné.');
      }
    }
    if (dto.menuId) {
      const menu = await this.prisma.menu.findFirst({ where: { id: dto.menuId, organizationId } });
      if (!menu) throw new BadRequestException('Menu introuvable.');
    }
    if (dto.technicalSheetId) {
      const productionPosition = assignedEmployee?.position ?? selectedPosition;
      if (productionPosition) {
        if (!positionSupportsTechnicalSheets(productionPosition.name, productionPosition.department?.name)) {
          throw new BadRequestException('Les fiches techniques sont réservées aux métiers de production alimentaire et de boissons.');
        }
      } else {
        const departmentPositions = await this.prisma.hrPosition.findMany({
          where: {
            organizationId,
            isArchived: false,
            OR: [{ departmentId: department.id }, { departmentId: null }],
          },
          include: { department: { select: { name: true } } },
        });
        if (!departmentPositions.some((position) => positionSupportsTechnicalSheets(position.name, position.department?.name))) {
          throw new BadRequestException('Ce service ne comporte aucun métier autorisé à réaliser une fiche technique.');
        }
      }
      const technicalSheet = await this.prisma.technicalSheet.findFirst({ where: { id: dto.technicalSheetId, organizationId, isArchived: false } });
      if (!technicalSheet) throw new BadRequestException('Fiche technique introuvable ou archivée.');
    }
    if (dto.technicalSheetStepId) {
      if (!dto.technicalSheetId) throw new BadRequestException('Une étape doit être reliée à sa fiche technique.');
      const step = await this.prisma.technicalSheetStep.findFirst({ where: { id: dto.technicalSheetStepId, organizationId, technicalSheetId: dto.technicalSheetId } });
      if (!step) throw new BadRequestException('Étape de fiche technique introuvable.');
    }
    if (dto.positionTaskPresetId) {
      if (!dto.positionId) throw new BadRequestException('La tâche type doit être reliée à un poste RH.');
      const position = await this.prisma.hrPosition.findFirst({ where: { id: dto.positionId, organizationId, isArchived: false }, include: { department: true } });
      const exists = position && this.positionTaskPresets(position.taskPresets, position.name, position.department?.name).some((preset) => preset.id === dto.positionTaskPresetId);
      if (!exists) throw new BadRequestException('Tâche type introuvable pour ce poste RH.');
    }
  }

  private async department(organizationId: string, id: string) {
    const department = await this.prisma.hrDepartment.findFirst({
      where: { id, organizationId, isArchived: false },
    });
    if (!department) throw new BadRequestException('Service RH introuvable.');
    return department;
  }

  private async matchingPlanningAssignment(
    organizationId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const shift = await this.prisma.planningAssignment.findFirst({
      where: {
        organizationId,
        employeeId,
        status: { not: PlanningAssignmentStatus.CANCELLED },
        startTime: { lte: startsAt },
        endTime: { gte: endsAt },
      },
      orderBy: { startTime: 'asc' },
    });
    return shift?.id ?? null;
  }

  private async assertCanCreate(
    scope: TaskScope,
    actor: TaskActor,
    departmentId: string,
    assignedEmployeeId?: string,
  ) {
    if (scope.global) return;
    if (!scope.actorEmployeeId) {
      throw new ForbiddenException('Votre compte doit être relié à un collaborateur RH.');
    }
    if (!scope.departmentIds.has(departmentId)) {
      throw new ForbiddenException('Ce service ne fait pas partie de votre périmètre RH.');
    }
    if (!assignedEmployeeId) {
      if (!scope.managesPeople) {
        throw new ForbiddenException('Seul un responsable peut créer une tâche non assignée.');
      }
      return;
    }
    if (!scope.employeeIds.has(assignedEmployeeId)) {
      throw new ForbiddenException('Vous ne pouvez pas assigner cette personne.');
    }
    if (!scope.managesPeople && assignedEmployeeId !== actor.employeeId) {
      throw new ForbiddenException('Vous pouvez uniquement créer une tâche pour vous-même.');
    }
  }

  private visibilityWhere(scope: TaskScope, actor: TaskActor): Prisma.OperationalTaskWhereInput {
    if (scope.global) return {};
    const own = scope.actorEmployeeId;
    if (!own) return { createdById: actor.id };
    if (!scope.managesPeople) {
      return { OR: [{ assignedEmployeeId: own }, { createdById: actor.id }] };
    }
    return {
      OR: [
        { assignedEmployeeId: { in: [...scope.employeeIds] } },
        { assignedEmployeeId: null, departmentId: { in: [...scope.departmentIds] } },
        { createdById: actor.id },
      ],
    };
  }

  private async scope(organizationId: string, actor: TaskActor): Promise<TaskScope> {
    const role = actor.role?.toUpperCase() ?? '';
    const global =
      role.includes('ADMIN') ||
      role.includes('SUPER') ||
      Boolean(actor.permissions?.includes('users.manage'));
    const employees = await this.prisma.hrEmployee.findMany({
      where: { organizationId, status: HrEmployeeStatus.ACTIVE, isArchived: false },
      select: { id: true, managerId: true, departmentId: true },
    });
    if (global) {
      return {
        global: true,
        employeeIds: new Set(employees.map((employee) => employee.id)),
        departmentIds: new Set(employees.map((employee) => employee.departmentId)),
        actorEmployeeId: actor.employeeId ?? undefined,
        managesPeople: true,
      };
    }

    const actorEmployeeId = actor.employeeId ?? undefined;
    if (!actorEmployeeId) {
      return {
        global: false,
        employeeIds: new Set(),
        departmentIds: new Set(),
        managesPeople: false,
      };
    }
    const employeeIds = new Set<string>([actorEmployeeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const employee of employees) {
        if (employee.managerId && employeeIds.has(employee.managerId) && !employeeIds.has(employee.id)) {
          employeeIds.add(employee.id);
          changed = true;
        }
      }
    }
    const departmentIds = new Set(
      employees
        .filter((employee) => employeeIds.has(employee.id))
        .map((employee) => employee.departmentId),
    );
    return {
      global: false,
      employeeIds,
      departmentIds,
      actorEmployeeId,
      managesPeople: employeeIds.size > 1,
    };
  }

  private date(value: string, message: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
    return date;
  }

  private assertPeriod(startsAt: Date, endsAt: Date) {
    if (startsAt >= endsAt) {
      throw new BadRequestException('L’heure de fin doit être postérieure à l’heure de début.');
    }
    if (endsAt.getTime() - startsAt.getTime() > 1000 * 60 * 60 * 24) {
      throw new BadRequestException('Une tâche ne peut pas dépasser 24 heures.');
    }
  }

  private positionTaskPresets(value: Prisma.JsonValue | null, positionName: string, departmentName?: string | null) {
    return (Array.isArray(value) ? value : defaultTaskPresets(positionName, departmentName)) as unknown as HrPositionTaskPreset[];
  }
}
