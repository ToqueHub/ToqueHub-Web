import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HrEmployeeStatus,
  OperationalTaskStatus,
  PlanningAssignmentStatus,
  Prisma,
  ProductionBatchStatus,
  ProductionOrderStatus,
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
import { CatererEventLifecycleService } from './caterer-event-lifecycle.service';
import { OperationalTaskPresetsService } from './operational-task-presets.service';

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
  assignments: {
    include: {
      employee: { include: { department: true, position: true, mainSite: true } },
      planningAssignment: { include: { site: true, position: true } },
    },
    orderBy: [{ isLead: 'desc' as const }, { createdAt: 'asc' as const }],
  },
  planningAssignment: true,
  menu: { select: { id: true, name: true, date: true, service: true } },
  technicalSheet: {
    select: {
      id: true,
      name: true,
      referencePortions: true,
      steps: {
        orderBy: { order: 'asc' as const },
        select: {
          id: true,
          order: true,
          title: true,
          description: true,
          estimatedMinutes: true,
        },
      },
    },
  },
  technicalSheetStep: {
    select: { id: true, order: true, title: true, description: true, estimatedMinutes: true },
  },
  productionBatch: {
    include: {
      unit: true,
      order: { select: { id: true, number: true, name: true, status: true } },
      operations: { orderBy: { position: 'asc' } },
    },
  },
  productionOperation: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.OperationalTaskInclude;

const EXECUTABLE_BATCH_STATUSES: ProductionBatchStatus[] = [
  ProductionBatchStatus.TO_PREPARE,
  ProductionBatchStatus.PREPARING,
  ProductionBatchStatus.COOKING,
  ProductionBatchStatus.COOLING,
  ProductionBatchStatus.FREEZING,
];

const EXECUTABLE_ORDER_STATUSES: ProductionOrderStatus[] = [
  ProductionOrderStatus.VALIDATED,
  ProductionOrderStatus.IN_PROGRESS,
  ProductionOrderStatus.PARTIALLY_COMPLETED,
];

@Injectable()
export class OperationalTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catererLifecycle?: CatererEventLifecycleService,
    private readonly operationalPresets?: OperationalTaskPresetsService,
  ) {}

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
    const [positions, sheets, batches] = await Promise.all([
      this.prisma.hrPosition.findMany({
        where: {
          organizationId,
          isArchived: false,
          ...(query.departmentId
            ? { OR: [{ departmentId: query.departmentId }, { departmentId: null }] }
            : {}),
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
          steps: {
            orderBy: { order: 'asc' },
            select: {
              id: true,
              order: true,
              title: true,
              description: true,
              estimatedMinutes: true,
            },
          },
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
      query.technicalSheetId
        ? this.prisma.productionBatch.findMany({
            where: {
              organizationId,
              status: { in: EXECUTABLE_BATCH_STATUSES },
              order: {
                technicalSheetId: query.technicalSheetId,
                siteId: query.siteId,
                status: { in: EXECUTABLE_ORDER_STATUSES },
                productionDate:
                  query.startDate || query.endDate
                    ? {
                        gte: query.startDate
                          ? this.date(query.startDate, 'Date de début invalide')
                          : undefined,
                        lt: query.endDate
                          ? this.date(query.endDate, 'Date de fin invalide')
                          : undefined,
                      }
                    : undefined,
              },
            },
            include: {
              unit: true,
              destinationLocation: true,
              order: {
                select: {
                  id: true,
                  number: true,
                  name: true,
                  productionDate: true,
                  status: true,
                  technicalSheetId: true,
                  siteId: true,
                },
              },
              operations: { orderBy: { position: 'asc' } },
            },
            orderBy: [{ plannedStartAt: 'asc' }, { number: 'asc' }],
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    const eligiblePositions = positions.filter((position) =>
      positionSupportsTechnicalSheets(position.name, position.department?.name),
    );
    const presets = positions.flatMap((position) => {
      const supportsTechnicalSheets = positionSupportsTechnicalSheets(
        position.name,
        position.department?.name,
      );
      return this.positionTaskPresets(
        position.taskPresets,
        position.name,
        position.department?.name,
      )
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
          totalTimeMinutes: Math.max(
            5,
            sheet.totalTimeMinutes ||
              (sheet.preparationTimeMinutes ?? 0) + (sheet.cookingTimeMinutes ?? 0) ||
              sheet.steps.reduce((total, step) => total + (step.estimatedMinutes ?? 0), 0) ||
              30,
          ),
          isOnCurrentMenu: menuNames.length > 0,
          menuNames,
          steps: sheet.steps.map((step) => ({
            ...step,
            estimatedMinutes: Math.max(5, step.estimatedMinutes ?? 15),
          })),
        };
      })
      .sort(
        (a, b) =>
          Number(b.isOnCurrentMenu) - Number(a.isOnCurrentMenu) ||
          a.name.localeCompare(b.name, 'fr'),
      );
    return { presets, technicalSheets, productionBatches: batches };
  }

  async list(organizationId: string, actor: TaskActor, query: OperationalTaskQueryDto) {
    const scope = await this.scope(organizationId, actor);
    const start = this.date(query.startDate, 'Date de début invalide');
    const end = this.date(query.endDate, 'Date de fin invalide');
    if (start >= end) throw new BadRequestException('La période demandée est invalide.');
    if (end.getTime() - start.getTime() > 1000 * 60 * 60 * 24 * 93) {
      throw new BadRequestException('La période ne peut pas dépasser 93 jours.');
    }

    await this.operationalPresets?.materialize(organizationId, start, end);

    const visibility = this.visibilityWhere(scope, actor);
    const where: Prisma.OperationalTaskWhereInput = {
      organizationId,
      startsAt: { lt: end },
      endsAt: { gt: start },
      departmentId: query.departmentId,
      OR: query.siteId
        ? [
            { siteId: query.siteId },
            { siteId: null, assignedEmployee: { mainSiteId: query.siteId } },
            { siteId: null, planningAssignment: { siteId: query.siteId } },
          ]
        : undefined,
      status: query.status,
      AND: [
        visibility,
        ...(query.employeeId
          ? [
              {
                OR: [
                  { assignedEmployeeId: query.employeeId },
                  { assignments: { some: { employeeId: query.employeeId } } },
                ],
              },
            ]
          : []),
      ],
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
            OR: [
              { assignedEmployeeId: { in: employees.map((employee) => employee.id) } },
              {
                assignments: {
                  some: { employeeId: { in: employees.map((employee) => employee.id) } },
                },
              },
            ],
            status: { in: ['TODO', 'IN_PROGRESS'] },
            isTimeScheduled: true,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            ...(query.taskId ? { id: { not: query.taskId } } : {}),
          },
          select: {
            id: true,
            title: true,
            assignedEmployeeId: true,
            startsAt: true,
            endsAt: true,
            assignments: { select: { employeeId: true } },
          },
        })
      : [];
    const shiftByEmployee = new Map(shifts.map((shift) => [shift.employeeId, shift]));
    const conflictByEmployee = new Map<string, (typeof conflicts)[number]>();
    conflicts.forEach((task) => {
      if (task.assignedEmployeeId) conflictByEmployee.set(task.assignedEmployeeId, task);
      (task.assignments ?? []).forEach((assignment) =>
        conflictByEmployee.set(assignment.employeeId, task),
      );
    });
    return employees.map((employee) => {
      const planningAssignment = shiftByEmployee.get(employee.id) ?? null;
      const operationalConflict = conflictByEmployee.get(employee.id) ?? null;
      const available = Boolean(planningAssignment);
      return {
        ...employee,
        available,
        planningAssignment,
        operationalConflict,
        availabilityLabel: !planningAssignment
          ? 'Hors planning'
          : operationalConflict
            ? `Déjà affecté en parallèle · ${operationalConflict.title}`
            : 'Disponible sur son planning',
      };
    });
  }

  async create(organizationId: string, actor: TaskActor, dto: UpsertOperationalTaskDto) {
    const scope = await this.scope(organizationId, actor);
    const startsAt = this.date(dto.startsAt, 'Heure de début invalide');
    const endsAt = this.date(dto.endsAt, 'Heure de fin invalide');
    this.assertPeriod(startsAt, endsAt);
    const employeeIds = this.assigneeIds(dto.assignedEmployeeIds, dto.assignedEmployeeId);
    const leadEmployeeId = dto.assignedEmployeeId ?? employeeIds[0] ?? null;
    const isTimeScheduled = dto.isTimeScheduled ?? true;
    await this.validateReferences(organizationId, {
      ...dto,
      assignedEmployeeId: leadEmployeeId ?? undefined,
    });
    await this.validateAssigneeSet(organizationId, dto.departmentId, employeeIds);
    await Promise.all(
      (employeeIds.length ? employeeIds : [undefined]).map((employeeId) =>
        this.assertCanCreate(scope, actor, dto.departmentId, employeeId),
      ),
    );
    const planningAssignmentId =
      isTimeScheduled && leadEmployeeId
        ? await this.matchingPlanningAssignment(organizationId, leadEmployeeId, startsAt, endsAt)
        : null;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.operationalTask.create({
        data: {
          organizationId,
          sourceKey: dto.sourceKey?.trim() || null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          category: dto.category,
          source: dto.source ?? 'MANUAL',
          departmentId: dto.departmentId,
          positionId: dto.positionId ?? null,
          siteId: dto.siteId ?? null,
          assignedEmployeeId: leadEmployeeId,
          planningAssignmentId,
          menuId: dto.menuId ?? null,
          technicalSheetId: dto.technicalSheetId ?? null,
          technicalSheetStepId: dto.technicalSheetStepId ?? null,
          productionBatchId: dto.productionBatchId ?? null,
          productionOperationId: dto.productionOperationId ?? null,
          positionTaskPresetId: dto.positionTaskPresetId ?? null,
          startsAt,
          endsAt,
          isTimeScheduled,
          quantity: dto.quantity == null ? null : new Prisma.Decimal(dto.quantity),
          unitLabel: dto.unitLabel?.trim() || null,
          createdById: actor.id,
        },
      });
      await this.syncAssignmentsTx(
        tx,
        organizationId,
        task.id,
        employeeIds,
        leadEmployeeId,
        startsAt,
        endsAt,
        isTimeScheduled,
      );
      return tx.operationalTask.findUniqueOrThrow({
        where: { id: task.id },
        include: TASK_INCLUDE,
      });
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
      throw new BadRequestException('Ce menu ne contient aucune fiche technique à planifier.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.serviceTime)) {
      throw new BadRequestException("L'heure de service est invalide.");
    }
    const day = dto.date.slice(0, 10);
    const serviceAt = this.date(`${day}T${dto.serviceTime}:00`, 'Date de service invalide');
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
    const startsAt = dto.startsAt
      ? this.date(dto.startsAt, 'Heure de début invalide')
      : existing.startsAt;
    const endsAt = dto.endsAt ? this.date(dto.endsAt, 'Heure de fin invalide') : existing.endsAt;
    this.assertPeriod(startsAt, endsAt);
    const isTimeScheduled = dto.isTimeScheduled ?? existing.isTimeScheduled;
    const departmentId = dto.departmentId ?? existing.departmentId;
    const currentEmployeeIds = existing.assignments?.length
      ? existing.assignments.map((assignment) => assignment.employeeId)
      : existing.assignedEmployeeId
        ? [existing.assignedEmployeeId]
        : [];
    const employeeIds =
      dto.assignedEmployeeIds !== undefined
        ? this.assigneeIds(dto.assignedEmployeeIds, dto.assignedEmployeeId)
        : Object.hasOwn(dto, 'assignedEmployeeId')
          ? this.assigneeIds(undefined, dto.assignedEmployeeId ?? undefined)
          : currentEmployeeIds;
    const assignedEmployeeId = Object.hasOwn(dto, 'assignedEmployeeId')
      ? (dto.assignedEmployeeId ?? employeeIds[0] ?? null)
      : existing.assignedEmployeeId && employeeIds.includes(existing.assignedEmployeeId)
        ? existing.assignedEmployeeId
        : (employeeIds[0] ?? null);
    await this.validateReferences(organizationId, {
      departmentId,
      positionId:
        dto.positionId === undefined
          ? (existing.positionId ?? undefined)
          : (dto.positionId ?? undefined),
      siteId: dto.siteId === undefined ? (existing.siteId ?? undefined) : (dto.siteId ?? undefined),
      assignedEmployeeId: assignedEmployeeId ?? undefined,
      menuId: dto.menuId === undefined ? (existing.menuId ?? undefined) : (dto.menuId ?? undefined),
      technicalSheetId:
        dto.technicalSheetId === undefined
          ? (existing.technicalSheetId ?? undefined)
          : (dto.technicalSheetId ?? undefined),
      technicalSheetStepId:
        dto.technicalSheetStepId === undefined
          ? (existing.technicalSheetStepId ?? undefined)
          : (dto.technicalSheetStepId ?? undefined),
      productionBatchId:
        dto.productionBatchId === undefined
          ? (existing.productionBatchId ?? undefined)
          : (dto.productionBatchId ?? undefined),
      productionOperationId:
        dto.productionOperationId === undefined
          ? (existing.productionOperationId ?? undefined)
          : (dto.productionOperationId ?? undefined),
      positionTaskPresetId:
        dto.positionTaskPresetId === undefined
          ? (existing.positionTaskPresetId ?? undefined)
          : (dto.positionTaskPresetId ?? undefined),
    });
    await this.validateAssigneeSet(organizationId, departmentId, employeeIds);
    await Promise.all(
      (employeeIds.length ? employeeIds : [undefined]).map((employeeId) =>
        this.assertCanCreate(scope, actor, departmentId, employeeId),
      ),
    );
    const planningAssignmentId =
      isTimeScheduled && assignedEmployeeId
        ? await this.matchingPlanningAssignment(
            organizationId,
            assignedEmployeeId,
            startsAt,
            endsAt,
          )
        : null;
    if (
      isTimeScheduled &&
      employeeIds.length &&
      (dto.startsAt !== undefined ||
        dto.endsAt !== undefined ||
        dto.isTimeScheduled !== undefined ||
        dto.assignedEmployeeId !== undefined ||
        dto.assignedEmployeeIds !== undefined)
    ) {
      const scheduling = await Promise.all(
        employeeIds.map((employeeId) =>
          this.matchingPlanningAssignment(organizationId, employeeId, startsAt, endsAt),
        ),
      );
      if (scheduling.some((assignmentId) => !assignmentId)) {
        throw new BadRequestException(
          'Une personne affectée ne travaille pas sur le nouveau créneau. Modifiez l’équipe ou choisissez un créneau couvert par son planning.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.operationalTask.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          sourceKey: dto.sourceKey === undefined ? undefined : dto.sourceKey?.trim() || null,
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          category: dto.category,
          departmentId: dto.departmentId,
          positionId: dto.positionId === undefined ? undefined : dto.positionId,
          siteId: dto.siteId === undefined ? undefined : dto.siteId,
          assignedEmployeeId,
          planningAssignmentId,
          startsAt,
          endsAt,
          isTimeScheduled,
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
          technicalSheetStepId:
            dto.technicalSheetStepId === undefined ? undefined : dto.technicalSheetStepId,
          productionBatchId:
            dto.productionBatchId === undefined ? undefined : dto.productionBatchId,
          productionOperationId:
            dto.productionOperationId === undefined ? undefined : dto.productionOperationId,
          positionTaskPresetId:
            dto.positionTaskPresetId === undefined ? undefined : dto.positionTaskPresetId,
        },
      });
      const productionOperationId =
        dto.productionOperationId === undefined
          ? existing.productionOperationId
          : dto.productionOperationId;
      if (productionOperationId && (dto.startsAt !== undefined || dto.endsAt !== undefined)) {
        await tx.productionOperation.update({
          where: { id: productionOperationId },
          data: { plannedAt: startsAt },
        });
      }
      await this.syncAssignmentsTx(
        tx,
        organizationId,
        id,
        employeeIds,
        assignedEmployeeId,
        startsAt,
        endsAt,
        isTimeScheduled,
      );
      return tx.operationalTask.findUniqueOrThrow({
        where: { id },
        include: TASK_INCLUDE,
      });
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
    const task = await this.prisma.operationalTask.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: dto.status === OperationalTaskStatus.COMPLETED ? new Date() : null,
      },
      include: TASK_INCLUDE,
    });
    await this.catererLifecycle?.evaluateForTask(organizationId, task.id);
    return task;
  }

  async splitProductionRecipeTask(organizationId: string, actor: TaskActor, id: string) {
    const scope = await this.scope(organizationId, actor);
    const source = await this.getVisible(organizationId, actor, scope, id);
    if (
      source.source !== 'PRODUCTION' ||
      !source.productionBatchId ||
      source.productionOperationId
    ) {
      throw new BadRequestException(
        'Seule une tâche de recette complète issue d’une fabrication peut être découpée.',
      );
    }
    if (source.status === OperationalTaskStatus.CANCELLED) {
      const existingSteps = await this.prisma.operationalTask.findMany({
        where: {
          organizationId,
          productionBatchId: source.productionBatchId,
          productionOperationId: { not: null },
          status: { not: OperationalTaskStatus.CANCELLED },
        },
        include: TASK_INCLUDE,
        orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
      });
      if (existingSteps.length) return existingSteps;
    }
    if (
      source.status === OperationalTaskStatus.COMPLETED ||
      source.status === OperationalTaskStatus.CANCELLED
    ) {
      throw new ConflictException('Cette recette ne peut plus être découpée dans son état actuel.');
    }
    const operations = [...(source.productionBatch?.operations ?? [])].sort(
      (left, right) => left.position - right.position,
    );
    if (operations.length < 2) {
      throw new BadRequestException('Cette fiche ne comporte pas plusieurs étapes à planifier.');
    }
    const steps = source.technicalSheetId
      ? await this.prisma.technicalSheetStep.findMany({
          where: {
            organizationId,
            technicalSheetId: source.technicalSheetId,
          },
          orderBy: { order: 'asc' },
        })
      : [];
    const employeeIds = source.assignments?.length
      ? source.assignments.map((assignment) => assignment.employeeId)
      : source.assignedEmployeeId
        ? [source.assignedEmployeeId]
        : [];

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.operationalTask.findMany({
        where: {
          organizationId,
          productionBatchId: source.productionBatchId,
          productionOperationId: { not: null },
        },
        include: TASK_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
      });
      const byOperation = new Map<string, (typeof existing)[number]>();
      for (const task of existing) {
        if (task.productionOperationId && !byOperation.has(task.productionOperationId)) {
          byOperation.set(task.productionOperationId, task);
        }
      }
      let cursor = new Date(source.startsAt);

      for (const operation of operations) {
        const minutes = Math.max(5, operation.activeMinutes ?? 15);
        const startsAt = new Date(cursor);
        const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
        cursor = endsAt;
        await tx.productionOperation.update({
          where: { id: operation.id },
          data: { plannedAt: startsAt },
        });
        const step = steps[operation.position] ?? null;
        const reusable = byOperation.get(operation.id);
        if (reusable?.status !== OperationalTaskStatus.CANCELLED) {
          if (reusable) continue;
        } else {
          await tx.operationalTask.update({
            where: { id: reusable.id },
            data: {
              title: `${operation.title} · ${source.technicalSheet?.name ?? source.title}`.slice(
                0,
                180,
              ),
              description:
                operation.notes ??
                step?.description ??
                'Étape issue du découpage de la recette complète.',
              category: source.category,
              status: OperationalTaskStatus.TODO,
              departmentId: source.departmentId,
              positionId: source.positionId,
              siteId: source.siteId,
              assignedEmployeeId: source.assignedEmployeeId,
              planningAssignmentId: null,
              technicalSheetId: source.technicalSheetId,
              technicalSheetStepId: step?.id ?? null,
              startsAt,
              endsAt,
              isTimeScheduled: false,
              quantity: source.quantity,
              unitLabel: source.unitLabel,
              completedAt: null,
            },
          });
          await tx.operationalTaskAssignment.updateMany({
            where: { taskId: reusable.id },
            data: { planningAssignmentId: null },
          });
          await this.syncAssignmentsTx(
            tx,
            organizationId,
            reusable.id,
            employeeIds,
            source.assignedEmployeeId,
            startsAt,
            endsAt,
            false,
          );
          continue;
        }

        const task = await tx.operationalTask.create({
          data: {
            organizationId,
            title: `${operation.title} · ${source.technicalSheet?.name ?? source.title}`.slice(
              0,
              180,
            ),
            description:
              operation.notes ??
              step?.description ??
              'Étape issue du découpage de la recette complète.',
            category: source.category,
            status: 'TODO',
            source: 'PRODUCTION',
            departmentId: source.departmentId,
            positionId: source.positionId,
            siteId: source.siteId,
            assignedEmployeeId: source.assignedEmployeeId,
            planningAssignmentId: source.planningAssignmentId,
            technicalSheetId: source.technicalSheetId,
            technicalSheetStepId: step?.id ?? null,
            productionBatchId: source.productionBatchId,
            productionOperationId: operation.id,
            startsAt,
            endsAt,
            isTimeScheduled: false,
            quantity: source.quantity,
            unitLabel: source.unitLabel,
            createdById: actor.id,
          },
        });
        await this.syncAssignmentsTx(
          tx,
          organizationId,
          task.id,
          employeeIds,
          source.assignedEmployeeId,
          startsAt,
          endsAt,
          false,
        );
      }

      await tx.operationalTask.update({
        where: { id: source.id },
        data: {
          status: OperationalTaskStatus.CANCELLED,
          completedAt: null,
        },
      });
      return tx.operationalTask.findMany({
        where: {
          organizationId,
          productionBatchId: source.productionBatchId,
          productionOperationId: { not: null },
          status: { not: OperationalTaskStatus.CANCELLED },
        },
        include: TASK_INCLUDE,
        orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
      });
    });
  }

  async mergeProductionRecipeTask(organizationId: string, actor: TaskActor, id: string) {
    const scope = await this.scope(organizationId, actor);
    const source = await this.getVisible(organizationId, actor, scope, id);
    if (source.source !== 'PRODUCTION' || !source.productionBatchId) {
      throw new BadRequestException(
        'Seules les étapes issues d’une fabrication peuvent être recomposées.',
      );
    }
    const tasks = await this.prisma.operationalTask.findMany({
      where: {
        organizationId,
        productionBatchId: source.productionBatchId,
      },
      include: TASK_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    });
    const wholeTask = tasks.find(
      (task) => !task.productionOperationId && !task.technicalSheetStepId,
    );
    if (!wholeTask) {
      throw new BadRequestException('La tâche de recette entière est introuvable.');
    }
    const activeSteps = tasks.filter(
      (task) =>
        Boolean(task.productionOperationId || task.technicalSheetStepId) &&
        task.status !== OperationalTaskStatus.CANCELLED,
    );
    if (!activeSteps.length && wholeTask.status === OperationalTaskStatus.TODO) {
      return wholeTask;
    }
    if (
      wholeTask.status !== OperationalTaskStatus.CANCELLED ||
      activeSteps.some((task) => task.status !== OperationalTaskStatus.TODO || task.isTimeScheduled)
    ) {
      throw new ConflictException(
        'Recomposition impossible : toutes les étapes doivent être à placer et non démarrées.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const step of activeSteps) {
        await tx.operationalTask.update({
          where: { id: step.id },
          data: {
            status: OperationalTaskStatus.CANCELLED,
            completedAt: null,
          },
        });
      }
      await tx.operationalTask.update({
        where: { id: wholeTask.id },
        data: {
          status: OperationalTaskStatus.TODO,
          isTimeScheduled: false,
          planningAssignmentId: null,
          completedAt: null,
        },
      });
      await tx.operationalTaskAssignment.updateMany({
        where: { taskId: wholeTask.id },
        data: { planningAssignmentId: null },
      });
      return tx.operationalTask.findUniqueOrThrow({
        where: { id: wholeTask.id },
        include: TASK_INCLUDE,
      });
    });
  }

  async execution(organizationId: string, actor: TaskActor, id: string) {
    const scope = await this.scope(organizationId, actor);
    const visibleTask = await this.getVisible(organizationId, actor, scope, id);
    if (!visibleTask.productionBatchId) {
      throw new BadRequestException({ code: 'PRODUCTION_TASK_BATCH_REQUIRED' });
    }
    const task = await this.prisma.operationalTask.findFirst({
      where: { id, organizationId },
      include: {
        ...TASK_INCLUDE,
        productionBatch: {
          include: {
            unit: true,
            destinationLocation: true,
            recipeVersion: true,
            operations: { orderBy: { position: 'asc' } },
            order: {
              include: {
                site: true,
                outputProduct: { include: { unit: true } },
                outputVariant: true,
                technicalSheet: {
                  include: {
                    ingredients: {
                      include: { product: true, unit: true },
                      orderBy: { order: 'asc' },
                    },
                    steps: { orderBy: { order: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    const batch = task?.productionBatch;
    if (!task || !batch) throw new NotFoundException({ code: 'PRODUCTION_TASK_BATCH_NOT_FOUND' });

    const snapshot = (batch.recipeVersion?.snapshot ?? null) as Record<string, any> | null;
    const snapshotIngredients = Array.isArray(snapshot?.ingredients) ? snapshot.ingredients : null;
    const sourceIngredients =
      snapshotIngredients ??
      batch.order.technicalSheet.ingredients.map((ingredient) => ({
        id: ingredient.id,
        productId: ingredient.productId,
        unitId: ingredient.unitId,
        quantity: ingredient.quantity.toString(),
        comment: ingredient.comment,
        section: ingredient.section,
        order: ingredient.order,
        productName: ingredient.product.name,
        unitSymbol: ingredient.unit.symbol,
      }));
    const productIds = [
      ...new Set(sourceIngredients.map((ingredient: any) => ingredient.productId).filter(Boolean)),
    ] as string[];
    const unitIds = [
      ...new Set(sourceIngredients.map((ingredient: any) => ingredient.unitId).filter(Boolean)),
    ] as string[];
    const [products, units, locations, profile] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { organizationId, id: { in: productIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      unitIds.length
        ? this.prisma.unit.findMany({
            where: { organizationId, id: { in: unitIds } },
            select: { id: true, name: true, symbol: true },
          })
        : Promise.resolve([]),
      batch.order.siteId
        ? this.prisma.location.findMany({
            where: { organizationId, siteId: batch.order.siteId, isArchived: false },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      batch.order.siteId
        ? this.prisma.productionProfile.findFirst({
            where: {
              organizationId,
              siteId: batch.order.siteId,
              technicalSheetId: batch.order.technicalSheetId,
              outputProductId: batch.order.outputProductId ?? undefined,
              outputVariantId: batch.order.outputVariantId,
            },
          })
        : Promise.resolve(null),
    ]);
    const productNames = new Map(products.map((product) => [product.id, product.name]));
    const unitNames = new Map(units.map((unit) => [unit.id, unit]));
    const snapshotYieldMode = snapshot?.yieldMode ?? batch.order.technicalSheet.yieldMode;
    const referenceYield = new Prisma.Decimal(
      snapshotYieldMode === 'MASS'
        ? (snapshot?.totalMassGrams ??
            batch.order.technicalSheet.totalMassGrams ??
            batch.recipeVersion?.referenceYield ??
            1)
        : (batch.recipeVersion?.referenceYield ??
            snapshot?.referencePortions ??
            batch.order.technicalSheet.referencePortions ??
            1),
    );
    const factor = referenceYield.isZero()
      ? new Prisma.Decimal(1)
      : batch.plannedQuantity.div(referenceYield);
    const ingredients = sourceIngredients
      .sort((a: any, b: any) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map((ingredient: any) => {
        const unit = unitNames.get(ingredient.unitId);
        return {
          id: ingredient.id,
          productId: ingredient.productId,
          name:
            ingredient.productName ??
            ingredient.productNameSnapshot ??
            productNames.get(ingredient.productId) ??
            'Ingrédient',
          quantity: new Prisma.Decimal(ingredient.quantity ?? 0).mul(factor).toFixed(3),
          unitId: ingredient.unitId,
          unit:
            ingredient.unitSymbol ??
            ingredient.unitSymbolSnapshot ??
            unit?.symbol ??
            unit?.name ??
            '',
          comment: ingredient.comment ?? null,
          section: ingredient.section ?? null,
        };
      });
    const role = actor.role?.toUpperCase() ?? '';
    const canExecute = Boolean(
      actor.permissions?.includes('production.batch.execute') ||
      role.includes('ADMIN') ||
      role.includes('MANAGER') ||
      role.includes('CHEF') ||
      role.includes('SECOND'),
    );
    const traceabilityRecords = await this.prisma.haccpProductionIngredientTraceability.findMany({
      where: { organizationId, productionBatchId: batch.id },
      select: { ingredientKey: true, photos: true },
    });
    const completedTraceabilityKeys = new Set(
      traceabilityRecords
        .filter((record) => Array.isArray(record.photos) && record.photos.length > 0)
        .map((record) => record.ingredientKey),
    );
    return {
      task,
      batch: {
        id: batch.id,
        reference: batch.reference,
        status: batch.status,
        plannedQuantity: batch.plannedQuantity.toString(),
        actualQuantity: batch.actualQuantity?.toString() ?? null,
        unit: batch.unit,
        destinationLocation: batch.destinationLocation,
        plannedStartAt: batch.plannedStartAt,
        startedAt: batch.startedAt,
        completedAt: batch.completedAt,
        operations: batch.operations,
      },
      recipe: {
        id: batch.order.technicalSheetId,
        version: batch.recipeVersion?.version ?? null,
        name: snapshot?.name ?? batch.order.technicalSheet.name,
        description: snapshot?.description ?? batch.order.technicalSheet.description,
        referenceYield: referenceYield.toString(),
        ingredients,
      },
      completion: {
        locations,
        defaultLocationId: batch.destinationLocationId,
        defaultConservationState: 'CHILLED',
        allowedConservationStates: profile?.canFreeze
          ? ['AMBIENT', 'CHILLED', 'COOLING', 'FROZEN']
          : ['AMBIENT', 'CHILLED', 'COOLING'],
        shelfLifeHours: profile?.shelfLifeHours ?? null,
        frozenShelfLifeHours: profile?.frozenShelfLifeHours ?? null,
      },
      canExecute,
      focusedOperationId: task.productionOperationId,
      traceabilitySummary: {
        expected: ingredients.length,
        completed: ingredients.filter((ingredient) =>
          completedTraceabilityKeys.has(String(ingredient.id)),
        ).length,
        missing: ingredients.filter(
          (ingredient) => !completedTraceabilityKeys.has(String(ingredient.id)),
        ).length,
        isComplete: ingredients.every((ingredient) =>
          completedTraceabilityKeys.has(String(ingredient.id)),
        ),
      },
    };
  }

  private async getVisible(organizationId: string, actor: TaskActor, scope: TaskScope, id: string) {
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
      productionBatchId?: string;
      productionOperationId?: string;
      positionTaskPresetId?: string;
    },
  ) {
    const department = await this.department(organizationId, dto.departmentId);
    let selectedPosition: {
      id: string;
      name: string;
      departmentId: string | null;
      department?: { name: string } | null;
    } | null = null;
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
    let assignedEmployee: {
      departmentId: string;
      position?: { id: string; name: string; department?: { name: string } | null } | null;
    } | null = null;
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
        if (
          !positionSupportsTechnicalSheets(
            productionPosition.name,
            productionPosition.department?.name,
          )
        ) {
          throw new BadRequestException(
            'Les fiches techniques sont réservées aux métiers de production alimentaire et de boissons.',
          );
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
        if (
          !departmentPositions.some((position) =>
            positionSupportsTechnicalSheets(position.name, position.department?.name),
          )
        ) {
          throw new BadRequestException(
            'Ce service ne comporte aucun métier autorisé à réaliser une fiche technique.',
          );
        }
      }
      const technicalSheet = await this.prisma.technicalSheet.findFirst({
        where: { id: dto.technicalSheetId, organizationId, isArchived: false },
      });
      if (!technicalSheet)
        throw new BadRequestException('Fiche technique introuvable ou archivée.');
    }
    if (dto.technicalSheetStepId) {
      if (!dto.technicalSheetId)
        throw new BadRequestException('Une étape doit être reliée à sa fiche technique.');
      const step = await this.prisma.technicalSheetStep.findFirst({
        where: {
          id: dto.technicalSheetStepId,
          organizationId,
          technicalSheetId: dto.technicalSheetId,
        },
      });
      if (!step) throw new BadRequestException('Étape de fiche technique introuvable.');
    }
    let batch: {
      id: string;
      order: { technicalSheetId: string; siteId: string | null; status: ProductionOrderStatus };
      status: ProductionBatchStatus;
    } | null = null;
    if (dto.productionBatchId) {
      batch = await this.prisma.productionBatch.findFirst({
        where: { id: dto.productionBatchId, organizationId },
        include: { order: { select: { technicalSheetId: true, siteId: true, status: true } } },
      });
      if (!batch) throw new BadRequestException('Lot de production introuvable.');
      if (
        !EXECUTABLE_BATCH_STATUSES.includes(batch.status) ||
        !EXECUTABLE_ORDER_STATUSES.includes(batch.order.status)
      ) {
        throw new BadRequestException("Ce lot n'est pas exécutable.");
      }
      if (!dto.technicalSheetId || batch.order.technicalSheetId !== dto.technicalSheetId) {
        throw new BadRequestException(
          'Le lot ne correspond pas à la fiche technique sélectionnée.',
        );
      }
      if (dto.siteId && batch.order.siteId && batch.order.siteId !== dto.siteId) {
        throw new BadRequestException('Le lot ne correspond pas au site sélectionné.');
      }
    }
    if (dto.productionOperationId) {
      if (!dto.productionBatchId)
        throw new BadRequestException('Une opération doit être reliée à son lot de production.');
      const operation = await this.prisma.productionOperation.findFirst({
        where: { id: dto.productionOperationId, organizationId, batchId: dto.productionBatchId },
      });
      if (!operation)
        throw new BadRequestException("L'opération ne correspond pas au lot sélectionné.");
    }
    if (dto.technicalSheetStepId && dto.productionBatchId && !dto.productionOperationId) {
      throw new BadRequestException(
        "Une tâche d'étape exécutable doit être reliée à une opération du lot.",
      );
    }
    if (dto.positionTaskPresetId) {
      if (!dto.positionId)
        throw new BadRequestException('La tâche type doit être reliée à un poste RH.');
      const position = await this.prisma.hrPosition.findFirst({
        where: { id: dto.positionId, organizationId, isArchived: false },
        include: { department: true },
      });
      const exists =
        position &&
        this.positionTaskPresets(
          position.taskPresets,
          position.name,
          position.department?.name,
        ).some((preset) => preset.id === dto.positionTaskPresetId);
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

  private assigneeIds(employeeIds?: string[], leadEmployeeId?: string | null) {
    return [...new Set([...(employeeIds ?? []), ...(leadEmployeeId ? [leadEmployeeId] : [])])];
  }

  private async validateAssigneeSet(
    organizationId: string,
    departmentId: string,
    employeeIds: string[],
  ) {
    if (!employeeIds.length) return;
    const employees = await this.prisma.hrEmployee.findMany({
      where: {
        organizationId,
        id: { in: employeeIds },
        departmentId,
        status: HrEmployeeStatus.ACTIVE,
        isArchived: false,
      },
      select: { id: true },
    });
    if (employees.length !== employeeIds.length) {
      throw new BadRequestException(
        'Tous les collaborateurs doivent être actifs et dépendre du service sélectionné.',
      );
    }
  }

  private async syncAssignmentsTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    taskId: string,
    employeeIds: string[],
    leadEmployeeId: string | null,
    startsAt: Date,
    endsAt: Date,
    isTimeScheduled = true,
  ) {
    await tx.operationalTaskAssignment.deleteMany({
      where: { taskId, employeeId: { notIn: employeeIds } },
    });
    for (const employeeId of employeeIds) {
      const planningAssignmentId = isTimeScheduled
        ? await this.matchingPlanningAssignmentTx(tx, organizationId, employeeId, startsAt, endsAt)
        : null;
      await tx.operationalTaskAssignment.upsert({
        where: { taskId_employeeId: { taskId, employeeId } },
        create: {
          organizationId,
          taskId,
          employeeId,
          planningAssignmentId,
          isLead: employeeId === leadEmployeeId,
          plannedMinutes: Math.max(5, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000)),
        },
        update: {
          planningAssignmentId,
          isLead: employeeId === leadEmployeeId,
        },
      });
    }
  }

  private async matchingPlanningAssignmentTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    employeeId: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    const shift = await tx.planningAssignment.findFirst({
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
      return {
        OR: [
          { assignedEmployeeId: own },
          { assignments: { some: { employeeId: own } } },
          { createdById: actor.id },
        ],
      };
    }
    return {
      OR: [
        { assignedEmployeeId: { in: [...scope.employeeIds] } },
        {
          assignedEmployeeId: null,
          assignments: { none: {} },
          departmentId: { in: [...scope.departmentIds] },
        },
        { assignments: { some: { employeeId: { in: [...scope.employeeIds] } } } },
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
        if (
          employee.managerId &&
          employeeIds.has(employee.managerId) &&
          !employeeIds.has(employee.id)
        ) {
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

  private positionTaskPresets(
    value: Prisma.JsonValue | null,
    positionName: string,
    departmentName?: string | null,
  ) {
    return (Array.isArray(value)
      ? value
      : defaultTaskPresets(positionName, departmentName)) as unknown as HrPositionTaskPreset[];
  }
}
