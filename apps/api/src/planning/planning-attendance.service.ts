import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanningAssignmentStatus, PlanningAttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanningAttendanceQueryDto, SubmitMyPlanningAttendanceDto, UpsertPlanningAttendanceDto, ValidatePlanningAttendanceDto } from './dto/planning.dto';
import { calculatePlanningAssignmentMinutes } from './planning-time';
import { assertPlanningRead, assertPlanningWrite, type PlanningActor as Actor } from './planning-access';

type Period = { start: Date; end: Date };

@Injectable()
export class PlanningAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  private assertWrite(actor: Actor) {
    assertPlanningWrite(actor);
  }

  async mySchedule(organizationId: string, actor: Actor, q: PlanningAttendanceQueryDto = {}) {
    const employeeId = this.requireEmployee(actor);
    const period = this.period(q);
    const [employee, assignments, entries, publicationEvents] = await Promise.all([
      this.prisma.hrEmployee.findFirst({
        where: { id: employeeId, organizationId, isArchived: false },
        include: { department: true, position: true, mainSite: true },
      }),
      this.prisma.planningAssignment.findMany({
        where: {
          organizationId,
          employeeId,
          date: { gte: period.start, lte: period.end },
          status: { notIn: [PlanningAssignmentStatus.CANCELLED, PlanningAssignmentStatus.REPLACED] },
        },
        include: { department: true, position: true, site: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: Math.min(q.pageSize ?? 200, 200),
      }),
      this.prisma.planningAttendanceEntry.findMany({
        where: { organizationId, employeeId, date: { gte: period.start, lte: period.end } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        take: Math.min(q.pageSize ?? 200, 200),
      }),
      this.publicationEvents(organizationId),
    ]);
    if (!employee) throw new ForbiddenException('Le compte connecté doit être lié à un collaborateur RH actif');

    const entriesByAssignment = new Map(entries.filter(entry => entry.assignmentId).map(entry => [entry.assignmentId!, entry]));
    const serverNow = new Date();
    const rows = assignments.flatMap(assignment => {
      const attendance = entriesByAssignment.get(assignment.id);
      const publicationStatus = this.publicationStatus(publicationEvents, assignment);
      const persistedHistory = Boolean(attendance && (attendance.declaredStartTime || attendance.status !== PlanningAttendanceStatus.DRAFT));
      if (!this.isPublished(publicationStatus) && !persistedHistory) return [];
      return [this.selfRow(assignment, attendance, publicationStatus, serverNow)];
    });

    return {
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        departmentName: employee.department?.name ?? null,
        positionName: employee.position?.name ?? null,
        siteName: employee.mainSite?.name ?? null,
      },
      serverNow,
      period: { startDate: this.iso(period.start), endDate: this.iso(period.end) },
      rows,
    };
  }

  async checkIn(organizationId: string, actor: Actor, assignmentId: string) {
    const assignment = await this.selfAssignment(organizationId, actor, assignmentId);
    const existing = await this.findAssignmentEntry(organizationId, assignmentId);
    if (existing?.declaredStartTime || existing && this.isEmployeeLocked(existing.status)) {
      return this.selfResultRow(organizationId, actor, assignment);
    }
    await this.assertPublishedAssignment(organizationId, assignment);
    const now = new Date();
    if (this.iso(assignment.date) !== this.iso(now)) throw new BadRequestException("Le pointage d'arrivée est autorisé uniquement le jour du créneau");
    const planned = calculatePlanningAssignmentMinutes(assignment);
    const metadata = this.mobileMetadata(existing?.metadata, { rawCheckInAt: now.toISOString() });
    await this.prisma.planningAttendanceEntry.upsert({
      where: { organizationId_assignmentId: { organizationId, assignmentId } },
      create: {
        organizationId,
        assignmentId,
        employeeId: assignment.employeeId,
        date: this.day(assignment.date),
        plannedStartTime: assignment.startTime,
        plannedEndTime: assignment.endTime,
        plannedMinutes: planned.plannedMinutes,
        declaredStartTime: now,
        status: PlanningAttendanceStatus.DRAFT,
        source: 'MOBILE',
        metadata,
      },
      update: { declaredStartTime: now, metadata },
    });
    return this.selfResultRow(organizationId, actor, assignment);
  }

  async checkOut(organizationId: string, actor: Actor, assignmentId: string) {
    const assignment = await this.selfAssignment(organizationId, actor, assignmentId);
    const existing = await this.findAssignmentEntry(organizationId, assignmentId);
    if (!existing?.declaredStartTime) throw new BadRequestException("Pointez d'abord votre arrivée");
    if (existing.declaredEndTime || this.isEmployeeLocked(existing.status)) return this.selfResultRow(organizationId, actor, assignment);
    await this.assertPublishedAssignment(organizationId, assignment);
    const now = new Date();
    const isShiftDay = this.iso(assignment.date) === this.iso(now);
    const isOvernightEndDay = this.iso(assignment.endTime) === this.iso(now) && this.iso(assignment.endTime) !== this.iso(assignment.date);
    if (!isShiftDay && !isOvernightEndDay) throw new BadRequestException('Le pointage de départ est hors de la période autorisée');
    const declaredMinutes = this.netMinutes(existing.declaredStartTime, now, assignment.breakMinutes);
    const metadata = this.mobileMetadata(existing.metadata, { rawCheckOutAt: now.toISOString() });
    await this.prisma.planningAttendanceEntry.update({
      where: { id: existing.id, organizationId },
      data: { declaredEndTime: now, declaredMinutes, varianceMinutes: declaredMinutes - existing.plannedMinutes, metadata },
    });
    return this.selfResultRow(organizationId, actor, assignment);
  }

  async submitMine(organizationId: string, actor: Actor, assignmentId: string, dto: SubmitMyPlanningAttendanceDto) {
    const assignment = await this.selfAssignment(organizationId, actor, assignmentId);
    const existing = await this.findAssignmentEntry(organizationId, assignmentId);
    if (existing && this.isEmployeeLocked(existing.status)) throw new ForbiddenException("Cet émargement est verrouillé et doit être corrigé par un manager");
    await this.assertPublishedAssignment(organizationId, assignment);
    const age = this.calendarDayDifference(assignment.date, new Date());
    if (age < 0) throw new BadRequestException("Un créneau futur ne peut pas être émargé");
    if (age > 7) throw new BadRequestException("Le délai de rattrapage de 7 jours est dépassé");
    const { start, end } = this.declaredPair(assignment.date, dto.declaredStartTime, dto.declaredEndTime);
    const declaredMinutes = this.netMinutes(start, end, assignment.breakMinutes);
    const planned = calculatePlanningAssignmentMinutes(assignment);
    const now = new Date();
    const metadata = this.mobileMetadata(existing?.metadata, {
      submittedAt: now.toISOString(),
      submittedStartTime: start.toISOString(),
      submittedEndTime: end.toISOString(),
      correctedStart: Boolean(existing?.declaredStartTime && +existing.declaredStartTime !== +start),
      correctedEnd: Boolean(existing?.declaredEndTime && +existing.declaredEndTime !== +end),
    });
    await this.prisma.planningAttendanceEntry.upsert({
      where: { organizationId_assignmentId: { organizationId, assignmentId } },
      create: {
        organizationId,
        assignmentId,
        employeeId: assignment.employeeId,
        date: this.day(assignment.date),
        plannedStartTime: assignment.startTime,
        plannedEndTime: assignment.endTime,
        plannedMinutes: planned.plannedMinutes,
        declaredStartTime: start,
        declaredEndTime: end,
        declaredMinutes,
        varianceMinutes: declaredMinutes - planned.plannedMinutes,
        status: PlanningAttendanceStatus.SIGNED,
        signedAt: now,
        signedById: actor.id,
        source: 'MOBILE',
        metadata,
      },
      update: {
        plannedStartTime: assignment.startTime,
        plannedEndTime: assignment.endTime,
        plannedMinutes: planned.plannedMinutes,
        declaredStartTime: start,
        declaredEndTime: end,
        declaredMinutes,
        varianceMinutes: declaredMinutes - planned.plannedMinutes,
        status: PlanningAttendanceStatus.SIGNED,
        signedAt: now,
        signedById: actor.id,
        source: 'MOBILE',
        metadata,
      },
    });
    return this.selfResultRow(organizationId, actor, assignment);
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
        take: Math.min(q.pageSize ?? 500, 5000),
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
        take: Math.min(q.pageSize ?? 500, 5000),
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

  private requireEmployee(actor: Actor) {
    assertPlanningRead(actor);
    if (!actor.employeeId) throw new ForbiddenException('Le compte connecté doit être lié à un collaborateur RH');
    return actor.employeeId;
  }

  private async selfAssignment(organizationId: string, actor: Actor, assignmentId: string) {
    const employeeId = this.requireEmployee(actor);
    const assignment = await this.prisma.planningAssignment.findFirst({
      where: {
        id: assignmentId,
        organizationId,
        employeeId,
        status: { notIn: [PlanningAssignmentStatus.CANCELLED, PlanningAssignmentStatus.REPLACED] },
      },
      include: { department: true, position: true, site: true },
    });
    if (!assignment) throw new NotFoundException('Créneau personnel introuvable');
    return assignment;
  }

  private findAssignmentEntry(organizationId: string, assignmentId: string) {
    return this.prisma.planningAttendanceEntry.findFirst({ where: { organizationId, assignmentId } });
  }

  private async publicationEvents(organizationId: string) {
    return this.prisma.planningHistory.findMany({
      where: { organizationId, entityType: 'PlanningPeriod', isArchived: false },
      select: { createdAt: true, newValue: true },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });
  }

  private publicationStatus(events: Array<{ createdAt: Date; newValue: unknown }>, assignment: { date: Date; siteId?: string | null }) {
    let status = 'DRAFT';
    for (const event of events) {
      const value = this.asObject(event.newValue);
      const period = this.asObject(value.period);
      if (!period.startDate || !period.endDate) continue;
      const start = this.day(this.parseDate(String(period.startDate)));
      const end = this.endDay(this.parseDate(String(period.endDate)));
      const periodSiteId = period.siteId ? String(period.siteId) : null;
      if (assignment.date < start || assignment.date > end) continue;
      if (periodSiteId && periodSiteId !== assignment.siteId) continue;
      status = String(value.eventType ?? value.status ?? 'DRAFT').toUpperCase();
    }
    return status;
  }

  private isPublished(status: string) {
    return status === 'PUBLISHED' || status === 'LOCKED';
  }

  private async assertPublishedAssignment(organizationId: string, assignment: { date: Date; siteId?: string | null }) {
    const status = this.publicationStatus(await this.publicationEvents(organizationId), assignment);
    if (!this.isPublished(status)) throw new ForbiddenException("Ce créneau n'appartient pas à un planning actuellement publié");
    return status;
  }

  private async selfResultRow(organizationId: string, actor: Actor, assignment: { id: string; date: Date }) {
    const result = await this.mySchedule(organizationId, actor, { startDate: this.iso(assignment.date), endDate: this.iso(assignment.date) });
    const row = result.rows.find(item => item.assignmentId === assignment.id);
    if (!row) throw new NotFoundException('Créneau personnel introuvable');
    return row;
  }

  private selfRow(assignment: any, attendance: any | undefined, publicationStatus: string, serverNow: Date) {
    const calculated = calculatePlanningAssignmentMinutes(assignment);
    const status = attendance?.status ?? PlanningAttendanceStatus.DRAFT;
    const employeeLocked = this.isEmployeeLocked(status);
    const isPublished = this.isPublished(publicationStatus);
    const ageDays = this.calendarDayDifference(assignment.date, serverNow);
    const isToday = ageDays === 0;
    const isOvernightEndDay = this.iso(assignment.endTime) === this.iso(serverNow) && this.iso(assignment.endTime) !== this.iso(assignment.date);
    const hasStart = Boolean(attendance?.declaredStartTime);
    const hasEnd = Boolean(attendance?.declaredEndTime);
    const withinCatchup = ageDays >= 0 && ageDays <= 7;
    const manualWindowOpen = ageDays > 0 || (isToday && serverNow >= assignment.endTime);
    return {
      assignmentId: assignment.id,
      date: this.iso(assignment.date),
      startTime: assignment.startTime,
      endTime: assignment.endTime,
      breakMinutes: assignment.breakMinutes,
      plannedMinutes: attendance?.plannedMinutes ?? calculated.plannedMinutes,
      departmentName: assignment.department?.name ?? null,
      positionName: assignment.position?.name ?? null,
      siteName: assignment.site?.name ?? null,
      assignmentStatus: assignment.status,
      publicationStatus,
      attendance: {
        id: attendance?.id ?? null,
        status,
        statusLabel: this.statusLabel(status),
        declaredStartTime: attendance?.declaredStartTime ?? null,
        declaredEndTime: attendance?.declaredEndTime ?? null,
        declaredMinutes: attendance?.declaredMinutes ?? null,
        validatedStartTime: attendance?.validatedStartTime ?? null,
        validatedEndTime: attendance?.validatedEndTime ?? null,
        validatedMinutes: attendance?.validatedMinutes ?? null,
        varianceMinutes: attendance?.varianceMinutes ?? null,
        signedAt: attendance?.signedAt ?? null,
        validatedAt: attendance?.validatedAt ?? null,
      },
      actions: {
        canCheckIn: isPublished && isToday && !employeeLocked && !hasStart,
        canCheckOut: isPublished && (isToday || isOvernightEndDay) && !employeeLocked && hasStart && !hasEnd,
        canSubmit: isPublished && withinCatchup && !employeeLocked && hasStart && hasEnd,
        canManualCatchUp: isPublished && withinCatchup && manualWindowOpen && !employeeLocked,
      },
    };
  }

  private isEmployeeLocked(status: PlanningAttendanceStatus | string) {
    return new Set<string>([
      PlanningAttendanceStatus.SIGNED,
      PlanningAttendanceStatus.SUBMITTED,
      PlanningAttendanceStatus.VALIDATED,
      PlanningAttendanceStatus.REJECTED,
    ]).has(String(status));
  }

  private declaredPair(assignmentDate: Date, startValue: string, endValue: string) {
    const start = this.parseTime(this.iso(assignmentDate), startValue);
    const end = this.parseTime(this.iso(assignmentDate), endValue);
    if (this.iso(start) !== this.iso(assignmentDate)) throw new BadRequestException("L'heure d'arrivée doit correspondre au jour du créneau");
    if (end <= start) end.setDate(end.getDate() + 1);
    const grossMinutes = Math.round((+end - +start) / 60000);
    if (grossMinutes <= 0 || grossMinutes > 24 * 60) throw new BadRequestException("La durée déclarée doit être comprise entre 1 minute et 24 heures");
    if (end > new Date()) throw new BadRequestException("Une heure de départ future ne peut pas être déclarée");
    return { start, end };
  }

  private netMinutes(start: Date, end: Date, breakMinutes = 0) {
    const gross = this.minutesBetween(start, end);
    if (gross == null) return 0;
    return Math.max(0, gross - Math.max(0, breakMinutes));
  }

  private calendarDayDifference(from: Date, to: Date) {
    const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((toUtc - fromUtc) / 86400000);
  }

  private mobileMetadata(existing: unknown, next: Record<string, unknown>): Prisma.InputJsonValue {
    const root = this.asObject(existing);
    const mobileAttendance = { ...this.asObject(root.mobileAttendance), ...next };
    return { ...root, mobileAttendance } as Prisma.InputJsonObject;
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
