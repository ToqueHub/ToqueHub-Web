import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HrAbsenceStatus, PlanningAssignmentStatus, PlanningDayStatusSourceType, PlanningVisibilityLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanningDayStatusQueryDto, UpsertPlanningDayStatusDto } from './dto/planning.dto';

type Actor = { id: string; role: string };
type Period = { start: Date; end: Date };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];
const BUSINESS_STATUS_LABELS: Record<string, string> = {
  work: 'Travail',
  rest: 'Repos',
  vacation: 'Congé',
  sick: 'Maladie',
  recovery: 'Récupération',
  vv: 'Heures vertes',
  leave: 'Congé',
  other: 'À vérifier',
};

@Injectable()
export class PlanningDayStatusService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Planning write access is restricted to managers and administrators');
  }

  async list(organizationId: string, q: PlanningDayStatusQueryDto = {}) {
    const period = this.period(q);
    return this.prisma.planningDayStatus.findMany({
      where: {
        organizationId,
        employeeId: q.employeeId,
        statusCode: q.statusCode,
        sourceType: q.sourceType,
        date: { gte: period.start, lte: period.end },
      },
      include: { employee: { include: { department: true, position: true } }, createdBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      take: Math.min(q.pageSize ?? 200, 500),
    });
  }

  async upsert(organizationId: string, actor: Actor, dto: UpsertPlanningDayStatusDto) {
    this.assertWrite(actor);
    await this.ensureEmployee(organizationId, dto.employeeId);
    const date = this.day(this.parseDate(dto.date));
    const sourceType = dto.sourceType ?? PlanningDayStatusSourceType.MANUAL;
    const statusCode = this.normalizeCode(dto.statusCode);
    const sourceId = this.cleanSourceId(dto.sourceId);
    const dedupeKey = this.dedupeKey(dto.employeeId, date, statusCode, sourceType, sourceId);
    const existing = await this.prisma.planningDayStatus.findFirst({
      where: { organizationId, dedupeKey },
    });
    const data = this.payload(organizationId, actor.id, dto, date, statusCode, sourceType, sourceId, dedupeKey);
    if (existing) {
      return this.prisma.planningDayStatus.update({
        where: { id: existing.id, organizationId },
        data: { ...data, createdById: existing.createdById, updatedById: actor.id },
      });
    }
    return this.prisma.planningDayStatus.create({ data });
  }

  async update(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningDayStatusDto) {
    this.assertWrite(actor);
    await this.ensureEmployee(organizationId, dto.employeeId);
    const existing = await this.prisma.planningDayStatus.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Statut de jour Planning introuvable');
    const date = this.day(this.parseDate(dto.date));
    const sourceType = dto.sourceType ?? existing.sourceType;
    const statusCode = this.normalizeCode(dto.statusCode);
    const sourceId = this.cleanSourceId(dto.sourceId);
    const dedupeKey = this.dedupeKey(dto.employeeId, date, statusCode, sourceType, sourceId);
    const duplicate = await this.prisma.planningDayStatus.findFirst({ where: { organizationId, dedupeKey, id: { not: id } }, select: { id: true } });
    if (duplicate) throw new BadRequestException('Un statut identique existe déjà pour ce collaborateur et cette date');
    return this.prisma.planningDayStatus.update({
      where: { id, organizationId },
      data: {
        ...this.payload(organizationId, actor.id, dto, date, statusCode, sourceType, sourceId, dedupeKey),
        createdById: existing.createdById,
        updatedById: actor.id,
      },
    });
  }

  async periodSummary(organizationId: string, q: PlanningDayStatusQueryDto = {}) {
    const period = this.period(q);
    const [persisted, assignments, absences] = await Promise.all([
      this.prisma.planningDayStatus.findMany({ where: { organizationId, employeeId: q.employeeId, date: { gte: period.start, lte: period.end } }, take: 1000 }),
      this.prisma.planningAssignment.findMany({
        where: { organizationId, employeeId: q.employeeId, date: { gte: period.start, lte: period.end }, status: { not: PlanningAssignmentStatus.CANCELLED } },
        select: { id: true, employeeId: true, date: true, comment: true },
        take: 1000,
      }),
      this.prisma.hrAbsence.findMany({
        where: { organizationId, employeeId: q.employeeId, status: HrAbsenceStatus.APPROVED, startDate: { lte: period.end }, endDate: { gte: period.start } },
        select: { id: true, employeeId: true, type: true, startDate: true, endDate: true },
        take: 500,
      }),
    ]);
    const legacy = assignments.flatMap(assignment => {
      const statusCode = this.assignmentBusinessStatus(assignment.comment);
      if (!statusCode || statusCode === 'work') return [];
      return [{
        source: 'assignment_comment',
        sourceId: assignment.id,
        employeeId: assignment.employeeId,
        date: this.iso(assignment.date),
        statusCode,
        label: BUSINESS_STATUS_LABELS[statusCode] ?? statusCode,
      }];
    });
    const hr = absences.map(absence => ({
      source: 'hr_absence',
      sourceId: absence.id,
      employeeId: absence.employeeId,
      startDate: this.iso(absence.startDate),
      endDate: this.iso(absence.endDate),
      statusCode: `hr_${String(absence.type).toLowerCase()}`,
      label: this.hrAbsenceLabel(String(absence.type)),
    }));
    const codes = new Map<string, number>();
    [...persisted.map(item => ({ statusCode: item.statusCode })), ...legacy, ...hr].forEach(item => codes.set(item.statusCode, (codes.get(item.statusCode) ?? 0) + 1));
    return {
      period: { startDate: this.iso(period.start), endDate: this.iso(period.end) },
      persistedCount: persisted.length,
      legacyAssignmentCommentCount: legacy.length,
      hrAbsenceCount: hr.length,
      codes: [...codes.entries()].map(([code, count]) => ({ code, count })),
      fallbackSources: ['planning_day_statuses', 'planning_assignments.comment', 'hr_absences'],
    };
  }

  private payload(organizationId: string, actorId: string, dto: UpsertPlanningDayStatusDto, date: Date, statusCode: string, sourceType: PlanningDayStatusSourceType, sourceId: string | null, dedupeKey: string): Prisma.PlanningDayStatusUncheckedCreateInput {
    return {
      organizationId,
      employeeId: dto.employeeId,
      date,
      statusCode,
      label: dto.label.trim(),
      sourceType,
      sourceId,
      dedupeKey,
      affectsPlanning: dto.affectsPlanning ?? true,
      affectsCounters: dto.affectsCounters ?? false,
      visibilityLevel: dto.visibilityLevel ?? PlanningVisibilityLevel.MANAGER,
      metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      createdById: actorId,
      updatedById: actorId,
    };
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id: employeeId, organizationId, isArchived: false }, select: { id: true } });
    if (!employee) throw new NotFoundException('Collaborateur RH introuvable');
  }

  private assignmentBusinessStatus(comment?: string | null) {
    if (!comment) return 'work';
    try {
      const parsed = JSON.parse(comment);
      const meta = parsed?.planningAssignmentMeta ?? parsed ?? {};
      return this.normalizeCode(String(meta.businessStatus ?? 'work'));
    } catch {
      return 'work';
    }
  }

  private hrAbsenceLabel(type: string) {
    return type === 'CONGE' ? 'Congé' : type === 'RTT' ? 'RTT' : type === 'MALADIE' ? 'Maladie' : type === 'FORMATION' ? 'Formation' : type === 'REPOS' ? 'Repos' : type === 'ACCIDENT' ? 'Accident' : type === 'EXCEPTIONNELLE' ? 'Congé exceptionnel' : 'Absence';
  }

  private normalizeCode(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80) || 'other';
  }

  private cleanSourceId(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, 160) : null;
  }

  private dedupeKey(employeeId: string, date: Date, statusCode: string, sourceType: PlanningDayStatusSourceType, sourceId: string | null) {
    const day = this.iso(date);
    if (sourceType === PlanningDayStatusSourceType.HR_ABSENCE && sourceId) return `hr-absence:${sourceId}:${day}`;
    if (sourceType === PlanningDayStatusSourceType.ASSIGNMENT_COMMENT && sourceId) return `assignment-meta:${sourceId}:${day}:${statusCode}`;
    if (sourceType === PlanningDayStatusSourceType.IMPORT && sourceId) return `import:${sourceId}:${employeeId}:${day}:${statusCode}`;
    if (sourceId) return `${String(sourceType).toLowerCase()}:${sourceId}:${employeeId}:${day}:${statusCode}`;
    if (sourceType === PlanningDayStatusSourceType.IMPORT) return `import:${employeeId}:${day}:${statusCode}`;
    return `manual:${employeeId}:${day}:${statusCode}`;
  }

  private period(q: PlanningDayStatusQueryDto = {}): Period {
    const now = new Date();
    const year = q.year ?? (q.startDate ? this.parseDate(q.startDate).getFullYear() : now.getFullYear());
    const month = q.month ?? (q.startDate ? this.parseDate(q.startDate).getMonth() + 1 : now.getMonth() + 1);
    const start = q.startDate ? this.day(this.parseDate(q.startDate)) : new Date(year, month - 1, 1);
    const end = q.endDate ? this.endDay(this.parseDate(q.endDate)) : this.endDay(new Date(year, month, 0));
    return { start, end };
  }

  private parseDate(value: string) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : new Date(value);
    if (Number.isNaN(+d)) throw new BadRequestException('Date invalide');
    return d;
  }

  private day(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private endDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  private iso(value: Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
}
