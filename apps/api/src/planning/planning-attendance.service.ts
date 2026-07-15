import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanningAssignmentStatus, PlanningAttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanningAttendanceQueryDto, UpsertPlanningAttendanceDto, ValidatePlanningAttendanceDto } from './dto/planning.dto';
import { calculatePlanningAssignmentMinutes } from './planning-time';

type Actor = { id: string; role: string };
type Period = { start: Date; end: Date };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];

@Injectable()
export class PlanningAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Planning write access is restricted to managers and administrators');
  }

  async list(organizationId: string, q: PlanningAttendanceQueryDto = {}) {
    const period = this.period(q);
    const [assignments, entries] = await Promise.all([
      this.prisma.planningAssignment.findMany({
        where: {
          organizationId,
          employeeId: q.employeeId,
          siteId: q.siteId,
          departmentId: q.departmentId,
          date: { gte: period.start, lte: period.end },
          status: { not: PlanningAssignmentStatus.CANCELLED },
        },
        include: { employee: { include: { department: true, position: true } }, department: true, position: true, site: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: Math.min(q.pageSize ?? 500, 1000),
      }),
      this.prisma.planningAttendanceEntry.findMany({
        where: {
          organizationId,
          employeeId: q.employeeId,
          status: q.status,
          date: { gte: period.start, lte: period.end },
        },
        include: { employee: { include: { department: true, position: true } }, assignment: { include: { department: true, position: true, site: true } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        take: Math.min(q.pageSize ?? 500, 1000),
      }),
    ]);
    const byAssignment = new Map(entries.filter(entry => entry.assignmentId).map(entry => [entry.assignmentId, entry]));
    const assignmentIds = new Set(assignments.map(assignment => assignment.id));
    const rows = [
      ...assignments.map(assignment => this.rowFromAssignment(assignment, byAssignment.get(assignment.id))),
      ...entries.filter(entry => !entry.assignmentId || !assignmentIds.has(entry.assignmentId)).map(entry => this.rowFromEntry(entry)),
    ].filter(row => !q.status || row.status === q.status);
    return {
      persistence: true,
      period: { startDate: this.iso(period.start), endDate: this.iso(period.end) },
      rows,
      employees: this.employeeSummaries(rows),
      totals: this.totals(rows),
    };
  }

  async employee(organizationId: string, employeeId: string, q: PlanningAttendanceQueryDto = {}) {
    await this.ensureEmployee(organizationId, employeeId);
    return this.list(organizationId, { ...q, employeeId });
  }

  async create(organizationId: string, actor: Actor, dto: UpsertPlanningAttendanceDto) {
    this.assertWrite(actor);
    const data = await this.payload(organizationId, actor, dto);
    const result = dto.assignmentId
      ? await this.prisma.planningAttendanceEntry.upsert({
        where: { organizationId_assignmentId: { organizationId, assignmentId: dto.assignmentId } },
        create: data,
        update: { ...data, createdAt: undefined },
      })
      : await this.prisma.planningAttendanceEntry.create({ data });
    return result;
  }

  async update(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningAttendanceDto) {
    this.assertWrite(actor);
    const existing = await this.prisma.planningAttendanceEntry.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Ligne d’émargement introuvable');
    const data = await this.payload(organizationId, actor, dto, existing);
    return this.prisma.planningAttendanceEntry.update({ where: { id, organizationId }, data });
  }

  async validate(organizationId: string, actor: Actor, id: string, dto: ValidatePlanningAttendanceDto) {
    this.assertWrite(actor);
    const existing = await this.prisma.planningAttendanceEntry.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Ligne d’émargement introuvable');
    const validatedStartTime = dto.validatedStartTime ? this.parseTime(this.iso(existing.date), dto.validatedStartTime) : existing.declaredStartTime;
    const validatedEndTime = dto.validatedEndTime ? this.parseTime(this.iso(existing.date), dto.validatedEndTime) : existing.declaredEndTime;
    const validatedMinutes = dto.validatedMinutes ?? this.minutesBetween(validatedStartTime, validatedEndTime) ?? existing.declaredMinutes ?? existing.plannedMinutes;
    return this.prisma.planningAttendanceEntry.update({
      where: { id, organizationId },
      data: {
        validatedStartTime,
        validatedEndTime,
        validatedMinutes,
        varianceMinutes: validatedMinutes - existing.plannedMinutes,
        status: dto.status ?? PlanningAttendanceStatus.VALIDATED,
        validatedAt: new Date(),
        validatedById: actor.id,
        metadata: this.mergeMetadata(existing.metadata, dto.metadata),
      },
    });
  }

  private async payload(organizationId: string, actor: Actor, dto: UpsertPlanningAttendanceDto, existing?: any): Promise<Prisma.PlanningAttendanceEntryUncheckedCreateInput> {
    await this.ensureEmployee(organizationId, dto.employeeId);
    const assignment = dto.assignmentId
      ? await this.prisma.planningAssignment.findFirst({ where: { id: dto.assignmentId, organizationId }, select: { id: true, employeeId: true, date: true, startTime: true, endTime: true, breakMinutes: true, status: true } })
      : null;
    if (dto.assignmentId && !assignment) throw new NotFoundException('Affectation Planning introuvable');
    if (assignment && assignment.employeeId !== dto.employeeId) throw new BadRequestException('La ligne d’émargement ne correspond pas au collaborateur de l’affectation');
    const attendanceDate = assignment?.date ?? this.parseDate(dto.date);
    const attendanceIsoDate = this.iso(attendanceDate);
    const date = this.day(attendanceDate);
    const plannedStartTime = dto.plannedStartTime ? this.parseTime(attendanceIsoDate, dto.plannedStartTime) : assignment?.startTime ?? existing?.plannedStartTime ?? null;
    const plannedEndTime = dto.plannedEndTime ? this.parseTime(attendanceIsoDate, dto.plannedEndTime) : assignment?.endTime ?? existing?.plannedEndTime ?? null;
    const plannedMinutes = dto.plannedMinutes ?? (assignment ? calculatePlanningAssignmentMinutes(assignment).plannedMinutes : existing?.plannedMinutes ?? 0);
    const declaredStartTime = dto.declaredStartTime ? this.parseTime(attendanceIsoDate, dto.declaredStartTime) : existing?.declaredStartTime ?? null;
    const declaredEndTime = dto.declaredEndTime ? this.parseTime(attendanceIsoDate, dto.declaredEndTime) : existing?.declaredEndTime ?? null;
    const declaredMinutes = dto.declaredMinutes ?? this.minutesBetween(declaredStartTime, declaredEndTime) ?? existing?.declaredMinutes ?? null;
    const status = dto.status ?? (declaredMinutes != null ? PlanningAttendanceStatus.SUBMITTED : existing?.status ?? PlanningAttendanceStatus.DRAFT);
    return {
      organizationId,
      assignmentId: dto.assignmentId ?? existing?.assignmentId ?? null,
      employeeId: dto.employeeId,
      date,
      plannedStartTime,
      plannedEndTime,
      plannedMinutes,
      declaredStartTime,
      declaredEndTime,
      declaredMinutes,
      varianceMinutes: declaredMinutes == null ? existing?.varianceMinutes ?? null : declaredMinutes - plannedMinutes,
      status,
      signedAt: status === PlanningAttendanceStatus.SIGNED ? existing?.signedAt ?? new Date() : existing?.signedAt ?? null,
      signedById: status === PlanningAttendanceStatus.SIGNED ? actor.id : existing?.signedById ?? null,
      source: dto.source ?? existing?.source ?? 'PLANNING',
      metadata: this.mergeMetadata(existing?.metadata, dto.metadata),
    };
  }

  private rowFromAssignment(assignment: any, entry?: any) {
    const plannedMinutes = entry?.plannedMinutes ?? calculatePlanningAssignmentMinutes(assignment).plannedMinutes;
    return {
      id: entry?.id ?? null,
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      employeeName: this.employeeName(assignment.employee),
      date: this.iso(assignment.date),
      plannedStartTime: entry?.plannedStartTime ?? assignment.startTime,
      plannedEndTime: entry?.plannedEndTime ?? assignment.endTime,
      plannedMinutes,
      declaredStartTime: entry?.declaredStartTime ?? null,
      declaredEndTime: entry?.declaredEndTime ?? null,
      declaredMinutes: entry?.declaredMinutes ?? null,
      validatedMinutes: entry?.validatedMinutes ?? null,
      varianceMinutes: entry?.varianceMinutes ?? null,
      status: entry?.status ?? PlanningAttendanceStatus.DRAFT,
      statusLabel: this.statusLabel(entry?.status ?? PlanningAttendanceStatus.DRAFT),
      departmentName: assignment.department?.name ?? assignment.employee?.department?.name ?? null,
      positionName: assignment.position?.name ?? assignment.employee?.position?.name ?? null,
      siteName: assignment.site?.name ?? null,
      persistence: Boolean(entry),
    };
  }

  private rowFromEntry(entry: any) {
    return {
      id: entry.id,
      assignmentId: entry.assignmentId,
      employeeId: entry.employeeId,
      employeeName: this.employeeName(entry.employee),
      date: this.iso(entry.date),
      plannedStartTime: entry.plannedStartTime,
      plannedEndTime: entry.plannedEndTime,
      plannedMinutes: entry.plannedMinutes,
      declaredStartTime: entry.declaredStartTime,
      declaredEndTime: entry.declaredEndTime,
      declaredMinutes: entry.declaredMinutes,
      validatedMinutes: entry.validatedMinutes,
      varianceMinutes: entry.varianceMinutes,
      status: entry.status,
      statusLabel: this.statusLabel(entry.status),
      departmentName: entry.assignment?.department?.name ?? entry.employee?.department?.name ?? null,
      positionName: entry.assignment?.position?.name ?? entry.employee?.position?.name ?? null,
      siteName: entry.assignment?.site?.name ?? null,
      persistence: true,
    };
  }

  private employeeSummaries(rows: Array<Record<string, any>>) {
    const groups = new Map<string, Array<Record<string, any>>>();
    rows.forEach(row => groups.set(row.employeeId, [...(groups.get(row.employeeId) ?? []), row]));
    return [...groups.entries()].map(([employeeId, employeeRows]) => {
      const plannedMinutes = employeeRows.reduce((sum, row) => sum + Number(row.plannedMinutes ?? 0), 0);
      const declaredMinutes = employeeRows.reduce((sum, row) => sum + Number(row.declaredMinutes ?? 0), 0);
      const validatedMinutes = employeeRows.reduce((sum, row) => sum + Number(row.validatedMinutes ?? 0), 0);
      const signedRows = employeeRows.filter(row => row.declaredMinutes != null || row.status === PlanningAttendanceStatus.SIGNED || row.status === PlanningAttendanceStatus.SUBMITTED || row.status === PlanningAttendanceStatus.VALIDATED);
      const signedCount = signedRows.length;
      const validatedCount = employeeRows.filter(row => row.status === PlanningAttendanceStatus.VALIDATED).length;
      const signedPlannedMinutes = signedRows.reduce((sum, row) => sum + Number(row.plannedMinutes ?? 0), 0);
      return {
        employeeId,
        employeeName: String(employeeRows[0]?.employeeName ?? 'Collaborateur'),
        plannedMinutes,
        declaredMinutes: signedCount ? declaredMinutes : null,
        validatedMinutes: validatedCount ? validatedMinutes : null,
        varianceMinutes: signedCount ? declaredMinutes - signedPlannedMinutes : null,
        rowCount: employeeRows.length,
        signedCount,
        validatedCount,
        status: validatedCount === employeeRows.length && employeeRows.length ? 'VALIDATED' : signedCount ? 'TO_VALIDATE' : 'NOT_SIGNED',
      };
    }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }

  private totals(rows: Array<Record<string, any>>) {
    return {
      plannedMinutes: rows.reduce((sum, row) => sum + Number(row.plannedMinutes ?? 0), 0),
      declaredMinutes: rows.reduce((sum, row) => sum + Number(row.declaredMinutes ?? 0), 0),
      validatedMinutes: rows.reduce((sum, row) => sum + Number(row.validatedMinutes ?? 0), 0),
      rows: rows.length,
    };
  }

  private period(q: PlanningAttendanceQueryDto): Period {
    if (q.startDate && q.endDate) return { start: this.day(this.parseDate(q.startDate)), end: this.endDay(this.parseDate(q.endDate)) };
    const year = q.year ?? new Date().getFullYear();
    const month = (q.month ?? new Date().getMonth() + 1) - 1;
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0, 23, 59, 59, 999) };
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id: employeeId, organizationId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Collaborateur RH introuvable');
  }

  private day(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  private endDay(d = new Date()) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
  private parseDate(v: string) { const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10))) : new Date(v); if (Number.isNaN(+d)) throw new BadRequestException('Date invalide'); return d; }
  private parseTime(date: string, time: string) { if (/^\d{4}-\d{2}-\d{2}T/.test(time)) return this.parseDate(time); const [h, m] = time.split(':').map(Number); const d = this.day(this.parseDate(date)); if (Number.isNaN(h) || Number.isNaN(m)) throw new BadRequestException('Heure invalide'); d.setHours(h, m, 0, 0); return d; }
  private minutesBetween(start?: Date | null, end?: Date | null) { if (!start || !end) return null; let endMs = +end; if (endMs <= +start) endMs += 24 * 60 * 60 * 1000; return Math.max(0, Math.round((endMs - +start) / 60000)); }
  private iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  private employeeName(employee?: { firstName?: string | null; lastName?: string | null } | null) { return [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || 'Collaborateur'; }
  private statusLabel(status: PlanningAttendanceStatus | string) {
    const labels: Record<string, string> = { DRAFT: 'Non signé', SIGNED: 'Signé', SUBMITTED: 'À valider', VALIDATED: 'Validé', REJECTED: 'À reprendre' };
    return labels[String(status)] ?? 'Non signé';
  }
  private mergeMetadata(existing?: unknown, next?: unknown): Prisma.InputJsonValue {
    return { ...(this.asObject(existing)), ...(this.asObject(next)) } as Prisma.InputJsonObject;
  }
  private asObject(value?: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
}
