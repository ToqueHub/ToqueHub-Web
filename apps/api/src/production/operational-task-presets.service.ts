import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  HrEmployeeStatus,
  OperationalTaskStatus,
  PlanningAssignmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  defaultTaskPresets,
  positionSupportsTechnicalSheets,
  type HrPositionTaskPreset,
} from '../hr/hr-task-presets';
import {
  OperationalTaskPresetQueryDto,
  UpsertOperationalTaskPresetDto,
} from './dto/operational-task-preset.dto';

type PresetActor = {
  id: string;
  role?: string;
  permissions?: string[];
  employeeId?: string | null;
};

const PRESET_INCLUDE = {
  department: true,
  position: true,
  site: true,
  assignedEmployee: { include: { department: true, position: true, mainSite: true } },
  assignments: {
    include: {
      employee: { include: { department: true, position: true, mainSite: true } },
    },
    orderBy: [{ isLead: 'desc' as const }, { createdAt: 'asc' as const }],
  },
  technicalSheet: { select: { id: true, name: true, referencePortions: true } },
  technicalSheetStep: { select: { id: true, order: true, title: true } },
} satisfies Prisma.OperationalTaskPresetInclude;

type MaterializedPreset = Prisma.OperationalTaskPresetGetPayload<{
  include: {
    assignedEmployee: { select: { id: true; positionId: true } };
    assignments: { include: { employee: { select: { id: true; positionId: true } } } };
  };
}>;

@Injectable()
export class OperationalTaskPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async options(organizationId: string, actor: PresetActor) {
    const canManage = this.canManage(actor);
    const [departments, sites, employees, technicalSheets] = await Promise.all([
      this.prisma.hrDepartment.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
      this.prisma.site.findMany({
        where: { organizationId, isArchived: false },
        orderBy: { name: 'asc' },
      }),
      this.prisma.hrEmployee.findMany({
        where: { organizationId, status: HrEmployeeStatus.ACTIVE, isArchived: false },
        include: {
          department: true,
          position: true,
          mainSite: true,
          secondarySites: { include: { site: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.technicalSheet.findMany({
        where: { organizationId, status: 'ACTIVE', isArchived: false },
        select: {
          id: true,
          name: true,
          referencePortions: true,
          totalTimeMinutes: true,
          steps: {
            select: { id: true, order: true, title: true, estimatedMinutes: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
        take: 500,
      }),
    ]);
    const positions = new Map<
      string,
      (typeof employees)[number]['position'] & { departmentName?: string | null }
    >();
    for (const employee of employees) {
      if (!positions.has(employee.position.id)) {
        positions.set(employee.position.id, {
          ...employee.position,
          departmentName: employee.department?.name,
        });
      }
    }
    const positionTaskPresets = [...positions.values()].flatMap((position) =>
      this.positionTaskPresets(position.taskPresets, position.name, position.departmentName)
        .filter(
          (task) =>
            !task.requiresTechnicalSheet ||
            positionSupportsTechnicalSheets(position.name, position.departmentName),
        )
        .map((task) => ({
          ...task,
          positionId: position.id,
          positionName: position.name,
        })),
    );
    return {
      canManage,
      departments,
      sites,
      employees,
      positionTaskPresets,
      technicalSheets,
    };
  }

  async list(organizationId: string, actor: PresetActor, query: OperationalTaskPresetQueryDto) {
    const canManage = this.canManage(actor);
    return this.prisma.operationalTaskPreset.findMany({
      where: {
        organizationId,
        isArchived: false,
        departmentId: query.departmentId,
        siteId: query.siteId,
        AND: [
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
          ...(!canManage && actor.employeeId
            ? [
                {
                  OR: [
                    { assignedEmployeeId: actor.employeeId },
                    { assignments: { some: { employeeId: actor.employeeId } } },
                  ],
                },
              ]
            : []),
        ],
        ...(!canManage && !actor.employeeId ? { createdById: actor.id } : {}),
      },
      include: PRESET_INCLUDE,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(organizationId: string, actor: PresetActor, dto: UpsertOperationalTaskPresetDto) {
    this.assertCanManage(actor);
    const { data, employeeIds } = await this.validatedData(organizationId, dto);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.operationalTaskPreset.create({
        data: { ...data, createdById: actor.id },
      });
      await this.syncPresetAssignmentsTx(
        tx,
        organizationId,
        created.id,
        data.assignedEmployeeId,
        employeeIds,
      );
      const preset = await tx.operationalTaskPreset.findUniqueOrThrow({
        where: { id: created.id },
        include: PRESET_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.OPERATIONAL_TASK_PRESET_CREATED,
          entityType: 'OperationalTaskPreset',
          entityId: preset.id,
          entityName: preset.name,
          details: {
            departmentId: preset.departmentId,
            assignedEmployeeId: preset.assignedEmployeeId,
            assignedEmployeeIds: employeeIds,
          },
        },
      });
      return preset;
    });
  }

  async update(
    organizationId: string,
    actor: PresetActor,
    id: string,
    dto: UpsertOperationalTaskPresetDto,
  ) {
    this.assertCanManage(actor);
    const current = await this.preset(organizationId, id);
    const { data, employeeIds } = await this.validatedData(organizationId, dto);
    return this.prisma.$transaction(async (tx) => {
      await tx.operationalTask.deleteMany({
        where: {
          organizationId,
          operationalTaskPresetId: id,
          status: OperationalTaskStatus.TODO,
          startsAt: { gt: new Date() },
        },
      });
      await tx.operationalTaskPreset.update({
        where: { id: current.id },
        data,
      });
      await this.syncPresetAssignmentsTx(
        tx,
        organizationId,
        current.id,
        data.assignedEmployeeId,
        employeeIds,
      );
      const preset = await tx.operationalTaskPreset.findUniqueOrThrow({
        where: { id: current.id },
        include: PRESET_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.OPERATIONAL_TASK_PRESET_UPDATED,
          entityType: 'OperationalTaskPreset',
          entityId: preset.id,
          entityName: preset.name,
          details: {
            departmentId: preset.departmentId,
            assignedEmployeeId: preset.assignedEmployeeId,
            assignedEmployeeIds: employeeIds,
          },
        },
      });
      return preset;
    });
  }

  async archive(organizationId: string, actor: PresetActor, id: string) {
    this.assertCanManage(actor);
    const current = await this.preset(organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.operationalTask.deleteMany({
        where: {
          organizationId,
          operationalTaskPresetId: current.id,
          status: OperationalTaskStatus.TODO,
          startsAt: { gt: new Date() },
        },
      });
      const preset = await tx.operationalTaskPreset.update({
        where: { id: current.id },
        data: { isActive: false, isArchived: true, archivedAt: new Date() },
        include: PRESET_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: actor.id,
          action: AuditAction.OPERATIONAL_TASK_PRESET_ARCHIVED,
          entityType: 'OperationalTaskPreset',
          entityId: preset.id,
          entityName: preset.name,
        },
      });
      return preset;
    });
  }

  async materialize(organizationId: string, start: Date, end: Date) {
    const presets = await this.prisma.operationalTaskPreset.findMany({
      where: { organizationId, isActive: true, isArchived: false },
      include: {
        assignedEmployee: { select: { id: true, positionId: true } },
        assignments: { include: { employee: { select: { id: true, positionId: true } } } },
      },
    });
    for (const preset of presets) {
      const firstDay = this.localDate(start, preset.timezone);
      const finalDay = this.localDate(new Date(end.getTime() - 1), preset.timezone);
      for (
        let preparationDay = firstDay;
        preparationDay <= finalDay;
        preparationDay = this.addDays(preparationDay, 1)
      ) {
        const serviceDay = this.addDays(preparationDay, preset.leadDays);
        if (!preset.serviceWeekdays.includes(this.weekday(serviceDay))) continue;
        if (preset.startsOn && serviceDay < this.dateKey(preset.startsOn)) continue;
        if (preset.endsOn && serviceDay > this.dateKey(preset.endsOn)) continue;
        await this.materializeOccurrence(organizationId, preset, preparationDay, serviceDay);
      }
    }
  }

  private async materializeOccurrence(
    organizationId: string,
    preset: MaterializedPreset,
    preparationDay: string,
    serviceDay: string,
  ) {
    const sourceKey = `OPERATIONAL_PRESET:${preset.id}:${serviceDay}`;
    const startsAt = this.zonedDateTime(preparationDay, preset.startTime, preset.timezone);
    const endsAt = this.zonedDateTime(preparationDay, preset.endTime, preset.timezone);
    if (endsAt <= startsAt) return;
    const existing = await this.prisma.operationalTask.findFirst({
      where: { organizationId, sourceKey },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== OperationalTaskStatus.TODO) return;
    const employees = preset.assignments?.length
      ? preset.assignments.map((assignment) => assignment.employee)
      : [preset.assignedEmployee];
    const employeeIds = [...new Set(employees.map((employee) => employee.id))];
    const planningAssignments = new Map<string, string | null>();
    for (const employeeId of employeeIds) {
      const planningAssignment = await this.prisma.planningAssignment.findFirst({
        where: {
          organizationId,
          employeeId,
          status: { not: PlanningAssignmentStatus.CANCELLED },
          startTime: { lte: startsAt },
          endTime: { gte: endsAt },
        },
        select: { id: true },
        orderBy: { startTime: 'asc' },
      });
      planningAssignments.set(employeeId, planningAssignment?.id ?? null);
    }
    const leadEmployee =
      employees.find((employee) => employee.id === preset.assignedEmployeeId) ?? employees[0];
    const data: Prisma.OperationalTaskUncheckedCreateInput = {
      organizationId,
      sourceKey,
      title: preset.name,
      description: preset.description,
      category: preset.category,
      source: preset.technicalSheetId ? 'TECHNICAL_SHEET' : 'MANUAL',
      departmentId: preset.departmentId,
      positionId:
        preset.positionId ?? leadEmployee?.positionId ?? preset.assignedEmployee.positionId,
      siteId: preset.siteId,
      assignedEmployeeId: preset.assignedEmployeeId,
      planningAssignmentId: planningAssignments.get(preset.assignedEmployeeId) ?? null,
      technicalSheetId: preset.technicalSheetId,
      technicalSheetStepId: preset.technicalSheetStepId,
      positionTaskPresetId: preset.positionTaskPresetId,
      operationalTaskPresetId: preset.id,
      startsAt,
      endsAt,
      isTimeScheduled: true,
      quantity: preset.quantity,
      unitLabel: preset.unitLabel,
      createdById: preset.createdById,
    };
    try {
      await this.prisma.$transaction(async (tx) => {
        const task = existing
          ? await tx.operationalTask.update({ where: { id: existing.id }, data })
          : await tx.operationalTask.create({ data });
        await tx.operationalTaskAssignment.deleteMany({ where: { taskId: task.id } });
        for (const employeeId of employeeIds) {
          await tx.operationalTaskAssignment.create({
            data: {
              organizationId,
              taskId: task.id,
              employeeId,
              planningAssignmentId: planningAssignments.get(employeeId) ?? null,
              isLead: employeeId === preset.assignedEmployeeId,
              plannedMinutes: Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
            },
          });
        }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }
  }

  private async validatedData(
    organizationId: string,
    dto: UpsertOperationalTaskPresetDto,
  ): Promise<{
    data: Prisma.OperationalTaskPresetUncheckedCreateInput;
    employeeIds: string[];
  }> {
    if (!dto.name.trim()) throw new BadRequestException('Le nom du preset est obligatoire.');
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException("L'heure de fin doit être postérieure à l'heure de début.");
    }
    const timezone = dto.timezone?.trim() || 'Europe/Helsinki';
    this.assertTimezone(timezone);
    const employeeIds = [
      ...new Set(
        dto.assignedEmployeeIds?.length
          ? [dto.assignedEmployeeId, ...dto.assignedEmployeeIds]
          : [dto.assignedEmployeeId],
      ),
    ];
    const [department, employees, site, technicalSheet, technicalSheetStep] = await Promise.all([
      this.prisma.hrDepartment.findFirst({
        where: { id: dto.departmentId, organizationId, isArchived: false },
      }),
      this.prisma.hrEmployee.findMany({
        where: {
          id: { in: employeeIds },
          organizationId,
          status: HrEmployeeStatus.ACTIVE,
          isArchived: false,
        },
        select: {
          id: true,
          departmentId: true,
          position: {
            select: {
              id: true,
              name: true,
              taskPresets: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      dto.siteId
        ? this.prisma.site.findFirst({
            where: { id: dto.siteId, organizationId, isArchived: false },
          })
        : null,
      dto.technicalSheetId
        ? this.prisma.technicalSheet.findFirst({
            where: {
              id: dto.technicalSheetId,
              organizationId,
              status: 'ACTIVE',
              isArchived: false,
            },
          })
        : null,
      dto.technicalSheetStepId
        ? this.prisma.technicalSheetStep.findFirst({
            where: {
              id: dto.technicalSheetStepId,
              organizationId,
              technicalSheetId: dto.technicalSheetId ?? undefined,
            },
          })
        : null,
    ]);
    if (!department) throw new BadRequestException('Service RH introuvable.');
    if (
      employees.length !== employeeIds.length ||
      employees.some((employee) => employee.departmentId !== department.id)
    ) {
      throw new BadRequestException(
        'Tous les collaborateurs doivent être actifs et appartenir au même service.',
      );
    }
    if (dto.siteId && !site) throw new BadRequestException('Site introuvable.');
    if (dto.technicalSheetId && !technicalSheet) {
      throw new BadRequestException('Fiche technique introuvable ou archivée.');
    }
    if (dto.technicalSheetStepId && !technicalSheetStep) {
      throw new BadRequestException("L'étape ne correspond pas à la fiche technique sélectionnée.");
    }
    if (dto.positionTaskPresetId) {
      if (!dto.positionId) {
        throw new BadRequestException('La tâche type doit être reliée à un poste RH.');
      }
      const matchingEmployee = employees.find(
        (employee) => employee.position.id === dto.positionId,
      );
      const positionTask = matchingEmployee
        ? this.positionTaskPresets(
            matchingEmployee.position.taskPresets,
            matchingEmployee.position.name,
            matchingEmployee.position.department?.name,
          ).find((task) => task.id === dto.positionTaskPresetId)
        : undefined;
      if (!positionTask) {
        throw new BadRequestException(
          'Cette tâche type ne correspond pas au poste des collaborateurs sélectionnés.',
        );
      }
      if (positionTask.requiresTechnicalSheet && !technicalSheet) {
        throw new BadRequestException('Cette tâche type nécessite une fiche technique.');
      }
    }
    const startsOn = dto.startsOn ? this.dateOnly(dto.startsOn) : null;
    const endsOn = dto.endsOn ? this.dateOnly(dto.endsOn) : null;
    if (startsOn && endsOn && startsOn > endsOn) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
    }
    return {
      data: {
        organizationId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        category: dto.category,
        departmentId: dto.departmentId,
        siteId: dto.siteId || null,
        assignedEmployeeId: dto.assignedEmployeeId,
        positionId: dto.positionId || null,
        positionTaskPresetId: dto.positionTaskPresetId || null,
        technicalSheetId: dto.technicalSheetId || null,
        technicalSheetStepId: dto.technicalSheetStepId || null,
        serviceWeekdays: [...dto.serviceWeekdays].sort((a, b) => a - b),
        leadDays: dto.leadDays,
        startTime: dto.startTime,
        endTime: dto.endTime,
        timezone,
        quantity: dto.quantity == null ? null : new Prisma.Decimal(dto.quantity),
        unitLabel: dto.unitLabel?.trim() || null,
        startsOn,
        endsOn,
        isActive: dto.isActive ?? true,
        isArchived: false,
        archivedAt: null,
      },
      employeeIds,
    };
  }

  private async syncPresetAssignmentsTx(
    tx: Prisma.TransactionClient,
    organizationId: string,
    presetId: string,
    leadEmployeeId: string,
    employeeIds: string[],
  ) {
    await tx.operationalTaskPresetAssignment.deleteMany({ where: { presetId } });
    await tx.operationalTaskPresetAssignment.createMany({
      data: employeeIds.map((employeeId) => ({
        organizationId,
        presetId,
        employeeId,
        isLead: employeeId === leadEmployeeId,
      })),
    });
  }

  private async preset(organizationId: string, id: string) {
    const preset = await this.prisma.operationalTaskPreset.findFirst({
      where: { id, organizationId, isArchived: false },
    });
    if (!preset) throw new NotFoundException('Preset opérationnel introuvable.');
    return preset;
  }

  private canManage(actor: PresetActor) {
    const role = actor.role?.toUpperCase() ?? '';
    return (
      role.includes('ADMIN') ||
      role.includes('SUPER') ||
      role.includes('MANAGER') ||
      Boolean(
        actor.permissions?.some((permission) =>
          ['production.write', 'planning.write', 'users.manage'].includes(permission),
        ),
      )
    );
  }

  private assertCanManage(actor: PresetActor) {
    if (!this.canManage(actor)) {
      throw new ForbiddenException('Vous ne pouvez pas gérer les presets opérationnels.');
    }
  }

  private assertTimezone(timezone: string) {
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('Fuseau horaire invalide.');
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

  private dateOnly(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Date invalide.');
    return date;
  }

  private dateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private localDate(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(value)
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private addDays(value: string, amount: number) {
    const date = new Date(`${value}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  private weekday(value: string) {
    return new Date(`${value}T12:00:00.000Z`).getUTCDay();
  }

  private zonedDateTime(day: string, time: string, timezone: string) {
    const [year, month, date] = day.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    let utc = Date.UTC(year, month - 1, date, hour, minute, 0, 0);
    for (let index = 0; index < 2; index += 1) {
      utc =
        Date.UTC(year, month - 1, date, hour, minute, 0, 0) -
        this.timezoneOffset(new Date(utc), timezone);
    }
    return new Date(utc);
  }

  private timezoneOffset(value: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .reduce<Record<string, number>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = Number(part.value);
        return acc;
      }, {});
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return asUtc - value.getTime();
  }
}
