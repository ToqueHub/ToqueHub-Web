import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { HrAbsenceStatus, HrEmployeeStatus, PlanningAssignmentOrigin, PlanningAssignmentStatus, PlanningConflictSeverity, PlanningHistoryAction, PlanningNotificationStatus, PlanningReplacementStatus, Prisma } from '@prisma/client';
import { HrTimeAccountService } from '../hr/time-accounts/hr-time-account.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptReplacementDto, ApplyPlanningRotationDto, ApplyPlanningTemplateDto, GeneratePlanningDto, MovePlanningAssignmentDto, PlanningContextQueryDto, PlanningPeriodActionDto, PlanningQueryDto, PlanningRotationPreviewDto, PrepareExportDto, SetEmployeePlanningTemplatesDto, UpsertDayPlanningAssignmentDto, UpsertDayPresetDto, UpsertHrAbsenceDto, UpsertHrSkillDto, UpsertPlanningAssignmentDto, UpsertPlanningNeedDto, UpsertPlanningTemplateDto, UpsertWeeklyRotationDto } from './dto/planning.dto';
import { PlanningCodeDictionaryService } from './planning-code-dictionary.service';
import { PlanningDayStatusService } from './planning-day-status.service';
import { PlanningAttendanceService } from './planning-attendance.service';
import { PlanningPolicyService } from './planning-policy.service';
import { plannedMinutes } from './planning-time';

type Actor = { id: string; role: string };
type Period = { start: Date; end: Date; month: number; year: number; days: string[] };
type AnyEmployee = Record<string, any>;
type AnyAssignment = Record<string, any>;
type OperationalNeedMetadata = { season: string; timeSlot: string; note?: string | null; daysOfWeek?: number[]; recurrence?: string | null };
type PlanningTemplateKind = 'DAY_PRESET' | 'WEEKLY_ROTATION';
type PlanningPeriodStatus = 'DRAFT' | 'CONTROLLED' | 'PUBLISHED' | 'MODIFIED_AFTER_PUBLICATION' | 'LOCKED';
type PlanningPeriodEventType = 'CONTROLLED' | 'PUBLISHED' | 'MODIFIED_AFTER_PUBLICATION' | 'LOCKED';

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];
const NEED_SEASONS: Record<string, string> = { basse: 'Basse', normale: 'Normale', haute: 'Haute', 'evenement-brunch': 'Événement / brunch' };
const NEED_TIME_SLOTS: Record<string, string> = { journee: 'Journée', matin: 'Matin', midi: 'Midi', soir: 'Soir', fermeture: 'Fermeture', personnalise: 'Personnalisé' };
const WEEK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const ASSIGNMENT_INCLUDE = {
  employee: { include: { department: true, position: true, secondaryPositions: { include: { position: true } }, mainSite: true, skills: { include: { skill: true } }, contracts: { orderBy: { startDate: 'desc' as const }, take: 1 }, compensations: { orderBy: { effectiveFrom: 'desc' as const }, take: 1 } } },
  department: true,
  position: true,
  site: true,
  absence: true,
  conflicts: true,
};

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly dayStatusService?: PlanningDayStatusService,
    @Optional() private readonly timeAccountService?: HrTimeAccountService,
    @Optional() private readonly codeDictionaryService?: PlanningCodeDictionaryService,
    @Optional() private readonly policyService?: PlanningPolicyService,
    @Optional() private readonly attendanceService?: PlanningAttendanceService,
  ) {}

  private assertWrite(actor: Actor) { if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('Planning write access is restricted to managers and administrators'); }
  private page(q?: PlanningQueryDto) { const take = Math.min(q?.pageSize ?? 100, 200); return { take, skip: ((q?.page ?? 1) - 1) * take }; }
  private day(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  private endDay(d = new Date()) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
  private parseDate(v: string) { const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10))) : new Date(v); if (Number.isNaN(+d)) throw new BadRequestException('Date invalide'); return d; }
  private parseTime(date: string, time: string) { if (/^\d{4}-\d{2}-\d{2}T/.test(time)) return this.parseDate(time); const [h, m] = time.split(':').map(Number); const d = this.day(this.parseDate(date)); if (Number.isNaN(h) || Number.isNaN(m)) throw new BadRequestException('Heure invalide'); d.setHours(h, m, 0, 0); return d; }

  bootstrap(organizationId: string, q: PlanningContextQueryDto = {}) {
    return this.context(organizationId, q);
  }

  async context(organizationId: string, q: PlanningContextQueryDto = {}) {
    const period = this.period(q);
    const assignmentWhere = this.assignmentWhere(organizationId, q, period, true);
    const needWhere = this.needWhere(organizationId, q, period, true);
    const templateWhere = { organizationId, isArchived: false, departmentId: q.departmentId, siteId: q.siteId, id: q.seasonalTemplateId, name: q.search ? { contains: q.search, mode: 'insensitive' as const } : undefined };

    const [org, employees, departments, positions, sites, skills, assignments, needs, templates, templateApplications, replacements, conflicts, notifications, history, absences] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: { hrInstalledAt: true, planningInstalledAt: true } }),
      this.prisma.hrEmployee.findMany({
        where: { organizationId, isArchived: false, status: HrEmployeeStatus.ACTIVE, id: q.employeeId },
        include: { department: true, position: { include: { department: true } }, secondaryPositions: { include: { position: true } }, mainSite: true, skills: { include: { skill: true } }, contracts: { orderBy: { startDate: 'desc' }, take: 1 }, compensations: { orderBy: { effectiveFrom: 'desc' }, take: 1 } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.hrDepartment.findMany({ where: { organizationId, isArchived: false, id: q.departmentId }, orderBy: { name: 'asc' } }),
      this.prisma.hrPosition.findMany({ where: { organizationId, isArchived: false, id: q.positionId, departmentId: q.departmentId }, include: { department: true }, orderBy: { name: 'asc' } }),
      this.prisma.site.findMany({ where: { organizationId, isArchived: false, id: q.siteId }, orderBy: { name: 'asc' } }),
      this.prisma.hrSkill.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' } }),
      this.prisma.planningAssignment.findMany({ where: assignmentWhere, include: ASSIGNMENT_INCLUDE, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], take: 1000 }),
      this.prisma.planningOperationalNeed.findMany({ where: needWhere, include: { department: true, site: true, position: true, requiredSkill: true }, orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }], take: 500 }),
      this.prisma.planningTemplate.findMany({ where: templateWhere, include: { department: true, site: true }, orderBy: { name: 'asc' }, take: 200 }),
      this.prisma.planningTemplateApplication.findMany({ where: { organizationId, templateId: q.seasonalTemplateId, siteId: q.siteId, startDate: { lte: period.end }, endDate: { gte: period.start } }, include: { template: true, site: true, appliedBy: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.planningReplacement.findMany({ where: { organizationId, status: q.replacementStatus }, include: { assignment: { include: ASSIGNMENT_INCLUDE }, absence: true, absentEmployee: { include: { department: true, position: true } }, replacementEmployee: { include: { department: true, position: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.planningConflict.findMany({ where: { organizationId, resolvedAt: null, assignment: q.employeeId || q.departmentId || q.siteId ? { employeeId: q.employeeId, departmentId: q.departmentId, siteId: q.siteId } : undefined }, include: { assignment: { include: ASSIGNMENT_INCLUDE }, resolvedBy: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 200 }),
      this.prisma.planningNotification.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.planningHistory.findMany({ where: { organizationId, createdAt: { gte: period.start, lte: period.end } }, include: { actorUser: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.hrAbsence.findMany({ where: { organizationId, employeeId: q.employeeId, status: q.absenceStatus, startDate: { lte: period.end }, endDate: { gte: period.start } }, include: { employee: { include: { department: true, position: true } }, validator: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { startDate: 'asc' }, take: 300 }),
    ]);

    const normalizedNeeds = needs.map(need => this.normalizeOperationalNeed(need));
    const normalizedTemplates = templates.map(template => this.normalizePlanningTemplate(template));
    const dayPresets = normalizedTemplates.filter(template => template.templateType === 'DAY_PRESET');
    const weeklyRotations = normalizedTemplates.filter(template => template.templateType === 'WEEKLY_ROTATION');
    const employeeTemplateAssignments = this.employeeTemplateAssignments(normalizedTemplates, employees);
    const hrReady = !!org?.hrInstalledAt && employees.length > 0 && departments.length > 0 && positions.length > 0;
    const coverage = await this.coverage(organizationId, period.start, period.end);
    const alerts = this.alerts(conflicts, absences, coverage, weeklyRotations, employees);
    const dashboard = this.dashboardFrom(assignments, departments, conflicts, alerts, coverage, replacements, period);
    const month = this.monthView(period, assignments, normalizedNeeds);
    const attendance = this.attendanceService ? await this.attendanceService.list(organizationId, { month: q.month, year: q.year, startDate: q.startDate, endDate: q.endDate, employeeId: q.employeeId, departmentId: q.departmentId, siteId: q.siteId, pageSize: q.pageSize }) : this.attendancePlaceholder(assignments);
    const periodStatus = await this.periodStatus(organizationId, period.start, period.end, q.siteId);
    const historyHuman = history.map(item => this.humanHistoryItem(item));
    const [dayStatusSummary, countersSummary, codeDictionarySummary, policySummary] = await Promise.all([
      this.dayStatusService?.periodSummary(organizationId, q) ?? Promise.resolve(null),
      this.timeAccountService?.contextSummary(organizationId, q) ?? Promise.resolve(null),
      this.codeDictionaryService?.summary(organizationId) ?? Promise.resolve(null),
      this.policyService?.summary(organizationId) ?? Promise.resolve(null),
    ]);
    (dashboard as any).periodStatus = periodStatus;
    (dashboard as any).actions = [...(dashboard.actions ?? []), ...this.periodActions(periodStatus)];

    return {
      meta: { source: 'planning.context', version: 2, period: { month: period.month, year: period.year, startDate: this.iso(period.start), endDate: this.iso(period.end) }, filters: { siteId: q.siteId ?? null, departmentId: q.departmentId ?? null, employeeId: q.employeeId ?? null, seasonalTemplateId: q.seasonalTemplateId ?? null }, temporary: { rotationsSource: 'planning_templates', employeeTemplateAssignmentsPersistence: 'planning_templates.content', attendancePersistence: Boolean(this.attendanceService), periodStatusPersistence: 'planning_history', dayStatusFallback: 'planning_assignments.comment' } },
      hrReady,
      prerequisites: { hrInstalled: !!org?.hrInstalledAt, planningInstalled: !!org?.planningInstalledAt, employees: employees.length, departments: departments.length, positions: positions.length, rotations: weeklyRotations.length },
      collaborators: employees,
      employees,
      departments,
      services: departments,
      positions,
      sites,
      skills,
      rotations: weeklyRotations,
      assignments,
      needs: normalizedNeeds,
      requirements: normalizedNeeds,
      templates: normalizedTemplates,
      templateApplications,
      replacements,
      replacementProposals: replacements,
      conflicts,
      alerts,
      notifications,
      history,
      historyHuman,
      absences,
      dashboard,
      summary: dashboard.summary,
      planning: { month, assignmentsByDate: month.days.reduce((acc, day) => ({ ...acc, [day.date]: day.assignments }), {}), periodStatus },
      settings: { needs: normalizedNeeds, templates: normalizedTemplates, dayPresets, weeklyRotations, employeeTemplateAssignments, templateApplications, rotations: weeklyRotations, rules: this.planningRulesCatalog(), payrollRuleProfiles: this.payrollRuleProfilesPlaceholder(), codeDictionary: codeDictionarySummary, policyProfiles: policySummary, notes: ['Les roulements Planning vivent uniquement dans planning_templates.', 'Les attributions collaborateur sont stockees provisoirement dans planning_templates.content faute de table dediee existante.'] },
      attendance,
      periodStatus,
      dayStatusSummary,
      countersSummary,
      emptyState: hrReady ? null : { title: 'Configurer RH pour planifier', message: 'Le Planning consomme les collaborateurs, services, postes, roulements, absences et compétences RH sans les dupliquer.' },
    };
  }

  async dashboard(organizationId: string, q: PlanningContextQueryDto = {}) {
    const ctx = await this.context(organizationId, q);
    return { stats: ctx.summary, dashboard: ctx.dashboard, alerts: ctx.alerts, coverage: ctx.dashboard.coverage };
  }

  async controlPeriod(organizationId: string, actor: Actor, dto: PlanningPeriodActionDto) {
    this.assertWrite(actor);
    const start = this.day(this.parseDate(dto.startDate));
    const end = this.endDay(this.parseDate(dto.endDate));
    await this.recalculateBaseAlerts(organizationId, start, end);
    const summary = await this.periodControlSummary(organizationId, start, end, dto.siteId);
    const event = await this.recordPeriodEvent(organizationId, actor.id, 'CONTROLLED', start, end, dto.siteId, {
      ...summary,
      note: dto.note ?? null,
      publishable: summary.blockingAlerts === 0,
    });
    return { periodStatus: await this.periodStatus(organizationId, start, end, dto.siteId), control: summary, publishable: summary.blockingAlerts === 0, event };
  }

  async publishPeriod(organizationId: string, actor: Actor, dto: PlanningPeriodActionDto) {
    this.assertWrite(actor);
    const start = this.day(this.parseDate(dto.startDate));
    const end = this.endDay(this.parseDate(dto.endDate));
    const current = await this.periodStatus(organizationId, start, end, dto.siteId);
    const summary = await this.periodControlSummary(organizationId, start, end, dto.siteId);
    if (summary.blockingAlerts > 0 && !dto.force) throw new BadRequestException({ message: 'Publication impossible sans confirmation spéciale: alertes bloquantes présentes.', control: summary, requiresForce: true });
    if (!['CONTROLLED', 'PUBLISHED', 'MODIFIED_AFTER_PUBLICATION', 'LOCKED'].includes(current.status) && !dto.force) throw new BadRequestException({ message: 'Planning non contrôlé. Relancez le contrôle ou confirmez la publication forcée.', control: summary, requiresForce: true });
    const event = await this.recordPeriodEvent(organizationId, actor.id, 'PUBLISHED', start, end, dto.siteId, {
      previousStatus: current.status,
      forced: !!dto.force,
      note: dto.note ?? null,
      control: summary,
      notificationsPrepared: true,
      mobileDelivery: false,
    });
    await this.prisma.planningNotification.create({ data: { organizationId, title: 'Planning publié', message: `Le planning ${this.iso(start)} - ${this.iso(end)} est publié. Notifications salariés préparées pour un canal futur.`, eventType: 'PLANNING_PERIOD_PUBLISHED', entityType: 'PlanningPeriod', entityId: this.periodKey(start, end, dto.siteId) } });
    return { periodStatus: await this.periodStatus(organizationId, start, end, dto.siteId), control: summary, event };
  }

  async lockPeriod(organizationId: string, actor: Actor, dto: PlanningPeriodActionDto) {
    this.assertWrite(actor);
    const start = this.day(this.parseDate(dto.startDate));
    const end = this.endDay(this.parseDate(dto.endDate));
    const current = await this.periodStatus(organizationId, start, end, dto.siteId);
    const event = await this.recordPeriodEvent(organizationId, actor.id, 'LOCKED', start, end, dto.siteId, {
      previousStatus: current.status,
      note: dto.note ?? null,
      payrollExportReady: false,
      placeholder: true,
    });
    return { periodStatus: await this.periodStatus(organizationId, start, end, dto.siteId), event, placeholder: true };
  }

  async listAssignments(organizationId: string, q: PlanningQueryDto = {}) {
    const period = this.period(q);
    return this.prisma.planningAssignment.findMany({ where: this.assignmentWhere(organizationId, q, period), include: ASSIGNMENT_INCLUDE, orderBy: [{ date: 'asc' }, { startTime: 'asc' }], ...this.page(q) });
  }

  async createAssignment(organizationId: string, actor: Actor, dto: UpsertPlanningAssignmentDto) {
    this.assertWrite(actor); await this.validateRefs(organizationId, dto);
    const data = this.assignmentData(organizationId, dto);
    const conflicts = await this.detectConflicts(organizationId, data);
    if (conflicts.some(c => c.severity === 'BLOCKING') && !dto.allowCriticalOverride) throw new BadRequestException({ message: 'Conflits bloquants détectés', conflicts });
    const assignment = await this.prisma.$transaction(async tx => {
      const assignment = await tx.planningAssignment.create({ data: { ...data, absenceId: conflicts.find(c => c.code === 'APPROVED_ABSENCE')?.absenceId, createdById: actor.id }, include: ASSIGNMENT_INCLUDE });
      await this.persistConflicts(tx, organizationId, assignment.id, conflicts);
      await this.history(tx, organizationId, actor.id, PlanningHistoryAction.ASSIGNMENT_ADDED, 'PlanningAssignment', assignment.id, 'Affectation ajoutée', null, assignment);
      await this.notify(tx, organizationId, 'Nouvelle affectation', 'Votre planning a été mis à jour.', 'ASSIGNMENT_CREATED', 'PlanningAssignment', assignment.id, assignment.employee.userId, assignment.employeeId);
      return assignment;
    });
    await this.recordAssignmentPeriodMutation(organizationId, actor.id, assignment, 'Affectation ajoutée après publication');
    await this.recalculateBaseAlerts(organizationId, this.weekStart(assignment.date), this.endDay(this.addDays(assignment.date, 6)));
    return assignment;
  }

  async upsertDayAssignment(organizationId: string, actor: Actor, dto: UpsertDayPlanningAssignmentDto) {
    this.assertWrite(actor);
    const date = this.day(this.parseDate(dto.date));
    const existing = await this.prisma.planningAssignment.findFirst({
      where: { organizationId, employeeId: dto.employeeId, date, status: { not: PlanningAssignmentStatus.CANCELLED } },
      orderBy: { startTime: 'asc' },
    });
    const payload: UpsertPlanningAssignmentDto = { ...dto, origin: dto.origin ?? (dto.templateId ? PlanningAssignmentOrigin.TEMPLATE : PlanningAssignmentOrigin.MANUAL), status: dto.status ?? PlanningAssignmentStatus.PLANNED };
    if (existing) return this.updateAssignment(organizationId, actor, existing.id, payload);
    return this.createAssignment(organizationId, actor, payload);
  }

  async updateAssignment(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningAssignmentDto) {
    this.assertWrite(actor); const old = await this.getAssignment(organizationId, id); await this.validateRefs(organizationId, dto);
    const data = this.assignmentData(organizationId, dto); const conflicts = await this.detectConflicts(organizationId, data, id);
    if (conflicts.some(c => c.severity === 'BLOCKING') && !dto.allowCriticalOverride) throw new BadRequestException({ message: 'Conflits bloquants détectés', conflicts });
    const assignment = await this.prisma.$transaction(async tx => {
      await tx.planningConflict.deleteMany({ where: { assignmentId: id, resolvedAt: null } });
      const assignment = await tx.planningAssignment.update({ where: { id, organizationId }, data: { ...data, absenceId: conflicts.find(c => c.code === 'APPROVED_ABSENCE')?.absenceId, updatedById: actor.id, allowCriticalOverride: !!dto.allowCriticalOverride, overrideReason: dto.overrideReason }, include: ASSIGNMENT_INCLUDE });
      await this.persistConflicts(tx, organizationId, id, conflicts);
      await this.history(tx, organizationId, actor.id, PlanningHistoryAction.ASSIGNMENT_UPDATED, 'PlanningAssignment', id, 'Affectation modifiée', old, assignment);
      return assignment;
    });
    await this.recordAssignmentPeriodMutation(organizationId, actor.id, assignment, 'Affectation modifiée après publication');
    await this.recalculateBaseAlerts(organizationId, this.weekStart(assignment.date), this.endDay(this.addDays(assignment.date, 6)));
    return assignment;
  }

  async moveAssignment(organizationId: string, actor: Actor, id: string, dto: MovePlanningAssignmentDto) {
    const current = await this.getAssignment(organizationId, id);
    return this.updateAssignment(organizationId, actor, id, { employeeId: dto.employeeId ?? current.employeeId, departmentId: dto.departmentId ?? current.departmentId, positionId: dto.positionId ?? current.positionId, siteId: dto.siteId ?? current.siteId ?? undefined, date: (dto.date ?? current.date.toISOString()).slice(0, 10), startTime: dto.startTime ?? current.startTime.toISOString(), endTime: dto.endTime ?? current.endTime.toISOString(), breakMinutes: current.breakMinutes, status: PlanningAssignmentStatus.MODIFIED, origin: PlanningAssignmentOrigin.DRAG_DROP, comment: dto.comment ?? current.comment ?? undefined, allowCriticalOverride: dto.allowCriticalOverride, overrideReason: dto.overrideReason });
  }
  async deleteAssignment(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); const old = await this.getAssignment(organizationId, id); const updated = await this.prisma.planningAssignment.update({ where: { id, organizationId }, data: { status: PlanningAssignmentStatus.CANCELLED, updatedById: actor.id }, include: ASSIGNMENT_INCLUDE }); await this.prisma.planningConflict.deleteMany({ where: { assignmentId: id, resolvedAt: null } }); await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.ASSIGNMENT_DELETED, entityType: 'PlanningAssignment', entityId: id, label: 'Affectation supprimée', oldValue: old as Prisma.InputJsonValue, newValue: updated as Prisma.InputJsonValue } }); await this.recordAssignmentPeriodMutation(organizationId, actor.id, updated, 'Affectation supprimée après publication'); await this.recalculateBaseAlerts(organizationId, this.weekStart(updated.date), this.endDay(this.addDays(updated.date, 6))); return updated; }
  async getAssignment(organizationId: string, id: string) { const a = await this.prisma.planningAssignment.findFirst({ where: { id, organizationId }, include: ASSIGNMENT_INCLUDE }); if (!a) throw new NotFoundException('Affectation introuvable'); return a; }

  async listNeeds(organizationId: string, q: PlanningQueryDto = {}) { const needs = await this.prisma.planningOperationalNeed.findMany({ where: this.needWhere(organizationId, q, this.period(q)), include: { department: true, site: true, position: true, requiredSkill: true }, orderBy: [{ startDate: 'asc' }, { startTime: 'asc' }], ...this.page(q) }); return needs.map(need => this.normalizeOperationalNeed(need)); }
  async createNeed(organizationId: string, actor: Actor, dto: UpsertPlanningNeedDto) { this.assertWrite(actor); await this.validateNeedRefs(organizationId, dto); const payload = this.buildOperationalNeedPayload(organizationId, dto); const need = await this.prisma.planningOperationalNeed.create({ data: { ...payload, createdById: actor.id }, include: { department: true, site: true, position: true, requiredSkill: true } }); await this.recalculateBaseAlerts(organizationId, this.day(need.startDate), this.endDay(need.endDate ?? need.startDate)); return this.normalizeOperationalNeed(need); }
  async updateNeed(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningNeedDto) { this.assertWrite(actor); await this.validateNeedRefs(organizationId, dto); const payload = this.buildOperationalNeedPayload(organizationId, dto); const need = await this.prisma.planningOperationalNeed.update({ where: { id, organizationId }, data: payload, include: { department: true, site: true, position: true, requiredSkill: true } }); await this.recalculateBaseAlerts(organizationId, this.day(need.startDate), this.endDay(need.endDate ?? need.startDate)); return this.normalizeOperationalNeed(need); }
  async deleteNeed(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); const need = await this.prisma.planningOperationalNeed.findFirst({ where: { id, organizationId } }); const deleted = await this.prisma.planningOperationalNeed.delete({ where: { id, organizationId } }); await this.recalculateBaseAlerts(organizationId, this.day(need?.startDate ?? new Date()), this.endDay(need?.endDate ?? need?.startDate ?? new Date())); return deleted; }

  async listAbsences(organizationId: string, q: PlanningQueryDto = {}) { const period = this.period(q); const filtered = this.hasPeriodFilter(q); return this.prisma.hrAbsence.findMany({ where: { organizationId, employeeId: q.employeeId, status: q.absenceStatus, startDate: filtered ? { lte: period.end } : undefined, endDate: filtered ? { gte: period.start } : undefined }, include: { employee: { include: { department: true, position: true } }, validator: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { startDate: 'asc' }, ...this.page(q) }); }
  createAbsence(_organizationId: string, _actor: Actor, _dto: UpsertHrAbsenceDto) { return this.deprecatedRhMutation('POST /planning/absences', 'POST /hr/... lorsque les routes RH absences seront exposees'); }
  updateAbsence(_organizationId: string, _actor: Actor, _id: string, _dto: UpsertHrAbsenceDto) { return this.deprecatedRhMutation('PATCH /planning/absences/:id', 'PATCH /hr/... lorsque les routes RH absences seront exposees'); }

  async listTemplates(organizationId: string, q: PlanningQueryDto = {}) {
    const templates = await this.prisma.planningTemplate.findMany({ where: this.templateWhere(organizationId, q), include: { department: true, site: true }, orderBy: { name: 'asc' }, ...this.page(q) });
    return templates.map(template => this.normalizePlanningTemplate(template));
  }
  async createTemplate(organizationId: string, actor: Actor, dto: UpsertPlanningTemplateDto) {
    this.assertWrite(actor);
    await this.validateTemplateRefs(organizationId, dto.departmentId, dto.siteId);
    const template = await this.prisma.planningTemplate.create({ data: { organizationId, name: dto.name, description: dto.description, periodType: dto.periodType ?? 'CUSTOM', departmentId: dto.departmentId, siteId: dto.siteId, content: this.normalizeTemplateContent(dto.periodType ?? 'CUSTOM', dto.content) as Prisma.InputJsonValue, createdById: actor.id }, include: { department: true, site: true } });
    return this.normalizePlanningTemplate(template);
  }
  async updateTemplate(organizationId: string, actor: Actor, id: string, dto: UpsertPlanningTemplateDto) {
    this.assertWrite(actor);
    const existing = await this.getPlanningTemplate(organizationId, id);
    await this.validateTemplateRefs(organizationId, dto.departmentId, dto.siteId);
    const template = await this.prisma.planningTemplate.update({ where: { id, organizationId }, data: { name: dto.name, description: dto.description, periodType: dto.periodType ?? existing.periodType, departmentId: dto.departmentId ?? null, siteId: dto.siteId ?? null, content: this.normalizeTemplateContent(dto.periodType ?? existing.periodType, dto.content ?? existing.content) as Prisma.InputJsonValue }, include: { department: true, site: true } });
    await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.TEMPLATE_APPLIED, entityType: 'PlanningTemplate', entityId: id, label: 'Modèle Planning modifié', oldValue: existing as Prisma.InputJsonValue, newValue: template as Prisma.InputJsonValue } });
    return this.normalizePlanningTemplate(template);
  }
  async archiveTemplate(organizationId: string, actor: Actor, id: string, expectedKind?: PlanningTemplateKind) {
    this.assertWrite(actor);
    const existing = await this.getPlanningTemplate(organizationId, id);
    if (expectedKind && this.templateKind(existing) !== expectedKind) throw new BadRequestException('Type de modèle Planning incompatible avec cette route');
    const template = await this.prisma.planningTemplate.update({ where: { id, organizationId }, data: { isArchived: true, archivedAt: new Date() }, include: { department: true, site: true } });
    await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.TEMPLATE_APPLIED, entityType: 'PlanningTemplate', entityId: id, label: 'Modèle Planning archivé', oldValue: existing as Prisma.InputJsonValue, newValue: template as Prisma.InputJsonValue } });
    return this.normalizePlanningTemplate(template);
  }
  listDayPresets(organizationId: string, q: PlanningQueryDto = {}) {
    return this.listTemplates(organizationId, q).then(templates => templates.filter(template => template.templateType === 'DAY_PRESET'));
  }
  async createDayPreset(organizationId: string, actor: Actor, dto: UpsertDayPresetDto) {
    this.assertWrite(actor);
    await this.validateTemplateRefs(organizationId, dto.departmentId, dto.siteId, dto.positionId);
    const content = this.dayPresetContent(dto);
    const template = await this.prisma.planningTemplate.create({ data: { organizationId, name: dto.name, description: dto.description, periodType: 'DAY_PRESET', departmentId: dto.departmentId, siteId: dto.siteId, content: content as Prisma.InputJsonValue, createdById: actor.id }, include: { department: true, site: true } });
    return this.normalizePlanningTemplate(template);
  }
  async updateDayPreset(organizationId: string, actor: Actor, id: string, dto: UpsertDayPresetDto) {
    this.assertWrite(actor);
    const existing = await this.getPlanningTemplate(organizationId, id);
    if (this.templateKind(existing) !== 'DAY_PRESET') throw new BadRequestException('Ce modèle Planning n’est pas un preset jour');
    await this.validateTemplateRefs(organizationId, dto.departmentId, dto.siteId, dto.positionId);
    const previous = this.contentObject(existing.content);
    const template = await this.prisma.planningTemplate.update({ where: { id, organizationId }, data: { name: dto.name, description: dto.description, periodType: 'DAY_PRESET', departmentId: dto.departmentId ?? null, siteId: dto.siteId ?? null, content: { ...this.dayPresetContent(dto), employeeIds: this.stringArray(previous.employeeIds) } as Prisma.InputJsonValue }, include: { department: true, site: true } });
    await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.TEMPLATE_APPLIED, entityType: 'PlanningTemplate', entityId: id, label: 'Preset jour modifié', oldValue: existing as Prisma.InputJsonValue, newValue: template as Prisma.InputJsonValue } });
    return this.normalizePlanningTemplate(template);
  }
  listWeeklyRotationTemplates(organizationId: string, q: PlanningQueryDto = {}) {
    return this.listTemplates(organizationId, q).then(templates => templates.filter(template => template.templateType === 'WEEKLY_ROTATION'));
  }
  async createWeeklyRotationTemplate(organizationId: string, actor: Actor, dto: UpsertWeeklyRotationDto) {
    this.assertWrite(actor);
    await this.validateTemplateRefs(organizationId, dto.departmentId, dto.siteId);
    const content = this.weeklyRotationContent(dto);
    const template = await this.prisma.planningTemplate.create({ data: { organizationId, name: dto.name, description: dto.description, periodType: 'WEEKLY_ROTATION', departmentId: dto.departmentId, siteId: dto.siteId, content: content as Prisma.InputJsonValue, createdById: actor.id }, include: { department: true, site: true } });
    return this.normalizePlanningTemplate(template);
  }
  async updateWeeklyRotationTemplate(organizationId: string, actor: Actor, id: string, dto: UpsertWeeklyRotationDto) {
    this.assertWrite(actor);
    const existing = await this.getPlanningTemplate(organizationId, id);
    if (this.templateKind(existing) !== 'WEEKLY_ROTATION') throw new BadRequestException('Ce modèle Planning n’est pas un roulement semaine');
    await this.validateTemplateRefs(organizationId, dto.departmentId, dto.siteId);
    const previous = this.contentObject(existing.content);
    const template = await this.prisma.planningTemplate.update({ where: { id, organizationId }, data: { name: dto.name, description: dto.description, periodType: 'WEEKLY_ROTATION', departmentId: dto.departmentId ?? null, siteId: dto.siteId ?? null, content: { ...this.weeklyRotationContent(dto), employeeIds: this.stringArray(previous.employeeIds), defaultEmployeeIds: this.stringArray(previous.defaultEmployeeIds) } as Prisma.InputJsonValue }, include: { department: true, site: true } });
    await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.TEMPLATE_APPLIED, entityType: 'PlanningTemplate', entityId: id, label: 'Roulement Planning modifié', oldValue: existing as Prisma.InputJsonValue, newValue: template as Prisma.InputJsonValue } });
    return this.normalizePlanningTemplate(template);
  }
  async setEmployeeTemplateAssignments(organizationId: string, actor: Actor, dto: SetEmployeePlanningTemplatesDto) {
    this.assertWrite(actor);
    await this.ensureEmployee(organizationId, dto.employeeId);
    const requestedDayIds = new Set(dto.dayPresetIds ?? []);
    const requestedRotationIds = new Set(dto.weeklyRotationIds ?? []);
    if (dto.defaultWeeklyRotationId) requestedRotationIds.add(dto.defaultWeeklyRotationId);
    const templates = await this.prisma.planningTemplate.findMany({ where: { organizationId, isArchived: false, OR: [{ periodType: 'DAY_PRESET' }, { periodType: 'WEEKLY_ROTATION' }, { content: { path: ['type'], in: ['DAY_PRESET', 'WEEKLY_ROTATION'] } as any }] }, include: { department: true, site: true }, orderBy: { name: 'asc' } });
    const normalized = templates.map(template => this.normalizePlanningTemplate(template));
    const existingIds = new Set(normalized.map(template => template.id));
    [...requestedDayIds, ...requestedRotationIds].forEach(id => { if (!existingIds.has(id)) throw new NotFoundException('Modèle Planning introuvable'); });
    for (const template of templates) {
      const kind = this.templateKind(template);
      if (!kind) continue;
      const content = this.contentObject(template.content);
      const employeeIds = new Set(this.stringArray(content.employeeIds));
      const defaultEmployeeIds = new Set(this.stringArray(content.defaultEmployeeIds));
      if (kind === 'DAY_PRESET') requestedDayIds.has(template.id) ? employeeIds.add(dto.employeeId) : employeeIds.delete(dto.employeeId);
      if (kind === 'WEEKLY_ROTATION') {
        requestedRotationIds.has(template.id) ? employeeIds.add(dto.employeeId) : employeeIds.delete(dto.employeeId);
        dto.defaultWeeklyRotationId === template.id ? defaultEmployeeIds.add(dto.employeeId) : defaultEmployeeIds.delete(dto.employeeId);
      }
      await this.prisma.planningTemplate.update({ where: { id: template.id }, data: { content: { ...content, employeeIds: [...employeeIds], defaultEmployeeIds: [...defaultEmployeeIds] } as Prisma.InputJsonValue } });
    }
    const refreshed = await this.prisma.planningTemplate.findMany({ where: { organizationId, isArchived: false }, include: { department: true, site: true }, orderBy: { name: 'asc' } });
    await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.TEMPLATE_APPLIED, entityType: 'PlanningTemplate', label: 'Attribution modèles collaborateur', newValue: { employeeId: dto.employeeId, dayPresetIds: [...requestedDayIds], weeklyRotationIds: [...requestedRotationIds], defaultWeeklyRotationId: dto.defaultWeeklyRotationId ?? null } as Prisma.InputJsonValue } });
    return this.employeeTemplateAssignments(refreshed.map(template => this.normalizePlanningTemplate(template))).find(item => item.employeeId === dto.employeeId) ?? { employeeId: dto.employeeId, dayPresetIds: [], weeklyRotationIds: [], defaultWeeklyRotationId: null };
  }
  async applyTemplate(organizationId: string, actor: Actor, id: string, dto: ApplyPlanningTemplateDto) { this.assertWrite(actor); const tpl = await this.prisma.planningTemplate.findFirst({ where: { id, organizationId } }); if (!tpl) throw new NotFoundException('Modèle introuvable'); const preview = { templateId: id, created: [], conflicts: [], message: 'Application préparée: les modèles définissent besoins et créneaux sans écraser les affectations existantes.' }; const app = await this.prisma.planningTemplateApplication.create({ data: { organizationId, templateId: id, siteId: dto.siteId, startDate: this.parseDate(dto.startDate), endDate: this.parseDate(dto.endDate), preview, applied: !!dto.apply, appliedById: dto.apply ? actor.id : undefined, appliedAt: dto.apply ? new Date() : undefined } }); if (dto.apply) await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.TEMPLATE_APPLIED, entityType: 'PlanningTemplate', entityId: id, label: 'Modèle appliqué', newValue: preview } }); return app; }

  async generate(organizationId: string, actor: Actor, dto: GeneratePlanningDto) { this.assertWrite(actor); const start = this.day(this.parseDate(dto.startDate)), end = this.endDay(this.parseDate(dto.endDate)); const preview = await this.buildGenerationPreview(organizationId, start, end, dto.siteId); const gen = await this.prisma.planningGeneration.create({ data: { organizationId, siteId: dto.siteId, startDate: start, endDate: end, preview: preview as Prisma.InputJsonValue, parameters: dto as unknown as Prisma.InputJsonValue, launchedById: actor.id } }); await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.GENERATION_STARTED, entityType: 'PlanningGeneration', entityId: gen.id, label: 'Génération lancée', newValue: preview as Prisma.InputJsonValue } }); if (dto.apply) return this.applyGeneration(organizationId, actor, gen.id); return gen; }
  async applyGeneration(organizationId: string, actor: Actor, id: string) { this.assertWrite(actor); const gen = await this.prisma.planningGeneration.findFirst({ where: { id, organizationId } }); if (!gen) throw new NotFoundException('Génération introuvable'); const proposed = ((gen.preview as any)?.assignments ?? []) as any[]; return this.prisma.$transaction(async tx => { const created = []; for (const p of proposed) { const conflicts = await this.detectConflicts(organizationId, this.assignmentData(organizationId, p)); if (conflicts.some(c => c.severity === 'BLOCKING')) continue; created.push(await tx.planningAssignment.create({ data: { ...this.assignmentData(organizationId, p), origin: PlanningAssignmentOrigin.AUTO_GENERATION, createdById: actor.id } })); } const updated = await tx.planningGeneration.update({ where: { id, organizationId }, data: { applied: true, appliedById: actor.id, appliedAt: new Date() } }); await this.history(tx, organizationId, actor.id, PlanningHistoryAction.GENERATION_APPLIED, 'PlanningGeneration', id, 'Génération appliquée', null, { created: created.length }); return { ...updated, createdAssignments: created }; }); }

  async listReplacements(organizationId: string, q: PlanningQueryDto = {}) { return this.prisma.planningReplacement.findMany({ where: { organizationId, status: q.replacementStatus }, include: { assignment: { include: ASSIGNMENT_INCLUDE }, absence: true, absentEmployee: { include: { department: true, position: true } }, replacementEmployee: { include: { department: true, position: true } } }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }
  async proposeReplacements(organizationId: string, actor: Actor) { this.assertWrite(actor); const absences = await this.prisma.hrAbsence.findMany({ where: { organizationId, status: HrAbsenceStatus.APPROVED }, include: { employee: true } }); for (const a of absences) await this.detectAbsenceImpact(organizationId, actor, a.id); return this.listReplacements(organizationId); }
  async acceptReplacement(organizationId: string, actor: Actor, id: string, dto: AcceptReplacementDto) { this.assertWrite(actor); const repl = await this.prisma.planningReplacement.findFirst({ where: { id, organizationId }, include: { assignment: true } }); if (!repl) throw new NotFoundException('Remplacement introuvable'); const updated = await this.prisma.planningReplacement.update({ where: { id, organizationId }, data: { replacementEmployeeId: dto.replacementEmployeeId, status: PlanningReplacementStatus.ACCEPTED, acceptedById: actor.id, acceptedAt: new Date(), comment: dto.comment } }); if (repl.assignment) await this.prisma.planningAssignment.update({ where: { id: repl.assignment.id }, data: { employeeId: dto.replacementEmployeeId, origin: PlanningAssignmentOrigin.REPLACEMENT, status: PlanningAssignmentStatus.MODIFIED, updatedById: actor.id } }); return updated; }

  listHistory(organizationId: string, q: PlanningQueryDto = {}) { const period = this.period(q); return this.prisma.planningHistory.findMany({ where: { organizationId, createdAt: this.hasPeriodFilter(q) ? { gte: period.start, lte: period.end } : undefined }, include: { actorUser: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, ...this.page(q) }); }
  archiveHistory(organizationId: string, actor: Actor, startDate: string, endDate: string) { this.assertWrite(actor); const start = this.parseDate(startDate), end = this.parseDate(endDate); const period = `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`; return this.prisma.planningHistory.updateMany({ where: { organizationId, createdAt: { gte: start, lte: end } }, data: { isArchived: true, archivedPeriod: period } }); }
  listNotifications(organizationId: string, userId: string) { return this.prisma.planningNotification.findMany({ where: { organizationId, OR: [{ recipientUserId: userId }, { recipientUserId: null }] }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  markNotificationRead(organizationId: string, id: string) { return this.prisma.planningNotification.update({ where: { id, organizationId }, data: { status: PlanningNotificationStatus.READ, readAt: new Date() } }); }
  async prepareExport(organizationId: string, actor: Actor, dto: PrepareExportDto) { this.assertWrite(actor); const exp = await this.prisma.planningExport.create({ data: { organizationId, requestedById: actor.id, ...dto, startDate: this.parseDate(dto.startDate), endDate: this.parseDate(dto.endDate), filters: (dto.filters ?? {}) as Prisma.InputJsonValue } }); await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.EXPORT_GENERATED, entityType: 'PlanningExport', entityId: exp.id, label: 'Export préparé', newValue: exp as Prisma.InputJsonValue } }); return { ...exp, prepared: true, message: 'Export préparé pour génération PDF/Excel/impression.' }; }

  async listPlanningRotations(organizationId: string, q: PlanningQueryDto = {}) {
    return this.listWeeklyRotationTemplates(organizationId, q);
  }
  async getEmployeePlanningRotations(organizationId: string, employeeId: string) {
    await this.ensureEmployee(organizationId, employeeId);
    const rotations = await this.listWeeklyRotationTemplates(organizationId);
    return rotations.filter((rotation: any) => this.stringArray(rotation.employeeIds ?? rotation.content?.employeeIds).includes(employeeId));
  }
  async applyWeeklyRotationPreview(organizationId: string, rotationId: string, dto: PlanningRotationPreviewDto) {
    const planningTemplate = await this.prisma.planningTemplate.findFirst({ where: { id: rotationId, organizationId, isArchived: false }, include: { department: true, site: true } });
    if (!planningTemplate || this.templateKind(planningTemplate) !== 'WEEKLY_ROTATION') throw new NotFoundException('Roulement Planning introuvable');
    const template = this.normalizePlanningTemplate(planningTemplate);
    const start = this.day(this.parseDate(dto.startDate));
    const end = this.endDay(this.parseDate(dto.endDate));
    const employeeIds = dto.employeeId ? [dto.employeeId] : this.stringArray(template.employeeIds);
    const employees = employeeIds.length
      ? await this.prisma.hrEmployee.findMany({ where: { organizationId, id: { in: employeeIds }, isArchived: false, status: HrEmployeeStatus.ACTIVE }, include: { department: true, position: true, mainSite: true } })
      : [];
    const assignments = this.planningRotationAssignmentsPreview(template, employees, start, end, dto.siteId);
    return { rotation: template, assignments, temporarySource: 'planning_templates', applied: false };
  }

  async applyWeeklyRotation(organizationId: string, actor: Actor, rotationId: string, dto: ApplyPlanningRotationDto) {
    this.assertWrite(actor);
    const preview = await this.applyWeeklyRotationPreview(organizationId, rotationId, dto);
    const start = this.day(this.parseDate(dto.startDate));
    const end = this.endDay(this.parseDate(dto.endDate));
    const proposed = (preview.assignments ?? []) as UpsertPlanningAssignmentDto[];
    const applied: any[] = [];
    const skipped: any[] = [];

    if (dto.replaceExisting !== false && dto.employeeId && preview.temporarySource === 'planning_templates') {
      await this.prisma.planningAssignment.updateMany({
        where: { organizationId, employeeId: dto.employeeId, date: { gte: start, lte: end }, origin: PlanningAssignmentOrigin.AUTO_GENERATION, comment: { contains: `Roulement Planning ${preview.rotation?.name ?? ''}` }, status: { not: PlanningAssignmentStatus.CANCELLED } },
        data: { status: PlanningAssignmentStatus.CANCELLED, updatedById: actor.id },
      });
    }

    for (const item of proposed) {
      try {
        const existing = await this.prisma.planningAssignment.findFirst({
          where: { organizationId, employeeId: item.employeeId, date: this.day(this.parseDate(item.date)), status: { not: PlanningAssignmentStatus.CANCELLED } },
          orderBy: { startTime: 'asc' },
        });
        const saved = existing
          ? await this.saveAssignmentAllowingConflicts(organizationId, actor, existing.id, { ...item, origin: PlanningAssignmentOrigin.AUTO_GENERATION, allowCriticalOverride: true, overrideReason: 'Application roulement semaine' })
          : await this.saveAssignmentAllowingConflicts(organizationId, actor, undefined, { ...item, origin: PlanningAssignmentOrigin.AUTO_GENERATION, allowCriticalOverride: true, overrideReason: 'Application roulement semaine' });
        applied.push(saved);
      } catch (error) {
        skipped.push({ item, message: error instanceof Error ? error.message : 'Application impossible' });
      }
    }

    await this.prisma.planningHistory.create({ data: { organizationId, actorUserId: actor.id, action: PlanningHistoryAction.GENERATION_APPLIED, entityType: 'PlanningTemplate', entityId: rotationId, label: 'Roulement semaine appliqué', newValue: { startDate: dto.startDate, endDate: dto.endDate, employeeId: dto.employeeId, source: preview.temporarySource, applied: applied.length, skipped: skipped.length } as Prisma.InputJsonValue } });
    await this.recalculateBaseAlerts(organizationId, start, end);
    return { rotation: preview.rotation, appliedAssignments: applied, skipped, applied: true, temporarySource: preview.temporarySource };
  }

  async listSkills(organizationId: string) { return this.prisma.hrSkill.findMany({ where: { organizationId, isArchived: false }, orderBy: { name: 'asc' } }); }
  createSkill(_organizationId: string, _actor: Actor, _dto: UpsertHrSkillDto) { return this.deprecatedRhMutation('POST /planning/skills', 'POST /hr/... lorsque les routes RH competences seront exposees'); }
  setEmployeeSkills(_organizationId: string, _actor: Actor, _employeeId: string, _skillIds: string[]) { return this.deprecatedRhMutation('POST /planning/employees/:id/skills', 'PATCH /hr/employees/:id/skills lorsque les routes RH competences seront exposees'); }

  private deprecatedRhMutation(route: string, replacement: string): never {
    throw new GoneException({ message: `${route} est obsolete: Planning lit les donnees RH mais ne les modifie plus.`, replacement, owner: 'RH', temporaryCompatibility: 'Route conservee pour signaler la migration sans mutation RH.' });
  }
  private periodKey(start: Date, end: Date, siteId?: string | null) {
    return `${this.iso(start)}_${this.iso(end)}_${siteId ?? 'all-sites'}`;
  }
  private periodPayload(start: Date, end: Date, siteId?: string | null) {
    return { startDate: this.iso(start), endDate: this.iso(end), siteId: siteId ?? null, key: this.periodKey(start, end, siteId) };
  }
  private async recordPeriodEvent(organizationId: string, actorUserId: string | undefined, eventType: PlanningPeriodEventType, start: Date, end: Date, siteId: string | undefined | null, details: Record<string, any> = {}) {
    const labels: Record<PlanningPeriodEventType, string> = {
      CONTROLLED: 'Planning contrôlé',
      PUBLISHED: 'Planning publié',
      MODIFIED_AFTER_PUBLICATION: 'Planning modifié après publication',
      LOCKED: 'Période verrouillée',
    };
    const period = this.periodPayload(start, end, siteId);
    return this.prisma.planningHistory.create({
      data: {
        organizationId,
        actorUserId,
        action: PlanningHistoryAction.PLANNING_CREATED,
        entityType: 'PlanningPeriod',
        entityId: period.key,
        label: labels[eventType],
        archivedPeriod: `${period.startDate}_${period.endDate}`,
        newValue: { period, eventType, status: eventType, ...details } as Prisma.InputJsonValue,
      },
    });
  }
  private async periodEvents(organizationId: string, start: Date, end: Date, siteId?: string | null) {
    const exact = this.periodKey(start, end, siteId);
    const allSites = this.periodKey(start, end, null);
    return this.prisma.planningHistory.findMany({
      where: { organizationId, entityType: 'PlanningPeriod', entityId: { in: [...new Set([exact, allSites])] }, isArchived: false },
      include: { actorUser: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }
  private async periodStatus(organizationId: string, start: Date, end: Date, siteId?: string | null) {
    const events = await this.periodEvents(organizationId, start, end, siteId);
    let status: PlanningPeriodStatus = 'DRAFT';
    let lastControlledAt: Date | null = null;
    let publishedAt: Date | null = null;
    let lockedAt: Date | null = null;
    let modifiedAfterPublicationAt: Date | null = null;
    let blockingAlerts = 0;
    let warningAlerts = 0;
    for (const event of events) {
      const value = this.contentObject(event.newValue);
      const eventType = String(value.eventType ?? value.status ?? '').toUpperCase();
      if (eventType === 'CONTROLLED') {
        status = 'CONTROLLED';
        lastControlledAt = event.createdAt;
        blockingAlerts = Number(value.blockingAlerts ?? blockingAlerts) || 0;
        warningAlerts = Number(value.warningAlerts ?? warningAlerts) || 0;
      }
      if (eventType === 'PUBLISHED') {
        status = 'PUBLISHED';
        publishedAt = event.createdAt;
      }
      if (eventType === 'MODIFIED_AFTER_PUBLICATION') {
        status = 'MODIFIED_AFTER_PUBLICATION';
        modifiedAfterPublicationAt = event.createdAt;
      }
      if (eventType === 'LOCKED') {
        status = 'LOCKED';
        lockedAt = event.createdAt;
      }
    }
    const latest = events.at(-1);
    return {
      status,
      label: this.periodStatusLabel(status),
      period: this.periodPayload(start, end, siteId),
      lastControlledAt,
      publishedAt,
      lockedAt,
      modifiedAfterPublicationAt,
      blockingAlerts,
      warningAlerts,
      publishable: blockingAlerts === 0,
      locked: status === 'LOCKED',
      modifiedAfterLock: !!(lockedAt && modifiedAfterPublicationAt && modifiedAfterPublicationAt > lockedAt),
      storage: 'planning_history',
      temporary: true,
      latestEvent: latest ? this.humanHistoryItem(latest) : null,
    };
  }
  private periodStatusLabel(status: PlanningPeriodStatus) {
    return status === 'CONTROLLED' ? 'Contrôlé' : status === 'PUBLISHED' ? 'Publié' : status === 'MODIFIED_AFTER_PUBLICATION' ? 'Modifié après publication' : status === 'LOCKED' ? 'Verrouillé' : 'Brouillon';
  }
  private periodActions(periodStatus: any) {
    if (!periodStatus || periodStatus.status === 'DRAFT') return [{ type: 'PERIOD_CONTROL', priority: 'NORMAL', label: 'Planning non contrôlé', entityId: periodStatus?.period?.key ?? 'current-period' }];
    if (periodStatus.blockingAlerts > 0) return [{ type: 'PERIOD_BLOCKING_ALERTS', priority: 'HIGH', label: 'Alertes bloquantes avant publication', entityId: periodStatus.period.key }];
    if (periodStatus.status === 'MODIFIED_AFTER_PUBLICATION') return [{ type: 'PERIOD_MODIFIED_AFTER_PUBLICATION', priority: 'HIGH', label: 'Planning publié modifié', entityId: periodStatus.period.key }];
    return [];
  }
  private async periodControlSummary(organizationId: string, start: Date, end: Date, siteId?: string | null) {
    const conflicts = await this.prisma.planningConflict.findMany({
      where: {
        organizationId,
        resolvedAt: null,
        OR: [
          { assignmentId: null },
          { assignment: { date: { gte: start, lte: end }, siteId: siteId ?? undefined } },
        ],
      },
      take: 500,
    });
    const blockingAlerts = conflicts.filter(conflict => conflict.severity === PlanningConflictSeverity.BLOCKING).length;
    const warningAlerts = conflicts.filter(conflict => conflict.severity === PlanningConflictSeverity.STRONG_WARNING).length;
    const infoAlerts = conflicts.filter(conflict => conflict.severity === PlanningConflictSeverity.INFO).length;
    return { period: this.periodPayload(start, end, siteId), totalAlerts: conflicts.length, blockingAlerts, warningAlerts, infoAlerts, publishable: blockingAlerts === 0 };
  }
  private async recordAssignmentPeriodMutation(organizationId: string, actorUserId: string | undefined, assignment: any, label: string) {
    if (!assignment?.date) return;
    const date = this.day(assignment.date);
    const events = await this.prisma.planningHistory.findMany({
      where: { organizationId, entityType: 'PlanningPeriod', isArchived: false },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const matching = events.find(event => {
      const period = this.contentObject(this.contentObject(event.newValue).period);
      if (!period.startDate || !period.endDate) return false;
      const start = this.day(this.parseDate(String(period.startDate)));
      const end = this.endDay(this.parseDate(String(period.endDate)));
      const siteId = period.siteId as string | null | undefined;
      return date >= start && date <= end && (!siteId || !assignment.siteId || siteId === assignment.siteId);
    });
    if (!matching) return;
    const current = this.contentObject(matching.newValue);
    if (!['PUBLISHED', 'MODIFIED_AFTER_PUBLICATION', 'LOCKED'].includes(String(current.eventType ?? current.status))) return;
    const period = this.contentObject(current.period);
    await this.recordPeriodEvent(organizationId, actorUserId, 'MODIFIED_AFTER_PUBLICATION', this.parseDate(String(period.startDate)), this.parseDate(String(period.endDate)), period.siteId ?? null, {
      assignmentId: assignment.id,
      label,
      previousPeriodEvent: current.eventType ?? current.status,
      lockedWarning: String(current.eventType ?? current.status) === 'LOCKED',
    });
  }
  private humanHistoryItem(item: any) {
    const value = this.contentObject(item.newValue);
    const period = this.contentObject(value.period);
    return {
      id: item.id,
      date: item.createdAt,
      action: item.action,
      label: item.label,
      entityType: item.entityType,
      entityId: item.entityId,
      actor: item.actorUser ? `${item.actorUser.firstName ?? ''} ${item.actorUser.lastName ?? ''}`.trim() || item.actorUser.email : null,
      period: period.startDate ? `${period.startDate} - ${period.endDate}` : item.archivedPeriod ?? null,
      detail: value.eventType ? `${value.eventType}${value.blockingAlerts != null ? `, ${value.blockingAlerts} bloquante(s)` : ''}` : null,
    };
  }
  private templateWhere(organizationId: string, q: PlanningQueryDto = {}): Prisma.PlanningTemplateWhereInput {
    return { organizationId, isArchived: false, departmentId: q.departmentId, siteId: q.siteId, id: q.seasonalTemplateId, name: q.search ? { contains: q.search, mode: 'insensitive' } : undefined };
  }
  private async getPlanningTemplate(organizationId: string, id: string) {
    const template = await this.prisma.planningTemplate.findFirst({ where: { id, organizationId }, include: { department: true, site: true } });
    if (!template) throw new NotFoundException('Modèle Planning introuvable');
    return template;
  }
  private templateKind(template: any): PlanningTemplateKind | null {
    const content = this.contentObject(template.content);
    const value = String(content.type ?? content.templateType ?? template.periodType ?? '').toUpperCase();
    if (value === 'DAY_PRESET' || value === 'DAILY_PRESET' || value === 'DAY') return 'DAY_PRESET';
    if (value === 'WEEKLY_ROTATION' || value === 'WEEK_ROTATION' || value === 'ROTATION') return 'WEEKLY_ROTATION';
    return null;
  }
  private contentObject(content: unknown): Record<string, any> {
    return content && typeof content === 'object' && !Array.isArray(content) ? content as Record<string, any> : {};
  }
  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : [];
  }
  private cleanTime(value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) throw new BadRequestException('Heure invalide');
    const [hours, minutes] = value.split(':').map(Number);
    if (hours > 23 || minutes > 59) throw new BadRequestException('Heure invalide');
    return value;
  }
  private normalizeTemplateContent(periodType: string, content: unknown) {
    const object = this.contentObject(content);
    const kind = this.templateKind({ periodType, content: object });
    if (kind === 'DAY_PRESET') {
      return {
        ...object,
        type: 'DAY_PRESET',
        startTime: this.cleanTime(String(object.startTime ?? object.start ?? '09:00')),
        endTime: this.cleanTime(String(object.endTime ?? object.end ?? '17:00')),
        breakMinutes: Number(object.breakMinutes ?? 0) || 0,
        paidBreak: object.paidBreak === true,
        employeeIds: this.stringArray(object.employeeIds),
      };
    }
    if (kind === 'WEEKLY_ROTATION') {
      return {
        ...object,
        type: 'WEEKLY_ROTATION',
        days: this.normalizeWeeklyRotationDays(object.days),
        employeeIds: this.stringArray(object.employeeIds),
        defaultEmployeeIds: this.stringArray(object.defaultEmployeeIds),
      };
    }
    return Object.keys(object).length ? object : { slots: [] };
  }
  private dayPresetContent(dto: UpsertDayPresetDto) {
    return {
      type: 'DAY_PRESET',
      startTime: this.cleanTime(dto.startTime),
      endTime: this.cleanTime(dto.endTime),
      departmentId: dto.departmentId ?? null,
      positionId: dto.positionId ?? null,
      siteId: dto.siteId ?? null,
      breakMinutes: dto.breakMinutes ?? 0,
      paidBreak: !!dto.paidBreak,
      businessStatus: this.cleanBusinessStatus(dto.businessStatus),
      employeeIds: [],
    };
  }
  private weeklyRotationContent(dto: UpsertWeeklyRotationDto) {
    return { type: 'WEEKLY_ROTATION', departmentId: dto.departmentId ?? null, siteId: dto.siteId ?? null, days: this.normalizeWeeklyRotationDays(dto.days), employeeIds: [], defaultEmployeeIds: [] };
  }
  private normalizeWeeklyRotationDays(days: unknown) {
    const source = this.contentObject(days);
    const arraySource = Array.isArray(days) ? days : null;
    return WEEK_DAYS.map((key, index) => {
      const raw = arraySource ? arraySource[index] : source[key] ?? source[String(index + 1)] ?? {};
      const day = this.contentObject(raw);
      const mode = String(day.mode ?? day.status ?? day.type ?? (day.startTime || day.start ? 'WORK' : 'REST')).toUpperCase();
      const isRest = mode === 'REST' || mode === 'OFF' || mode === 'REPOS' || day.isRest === true;
      return {
        key,
        dayOfWeek: index + 1,
        mode: isRest ? 'REST' : 'WORK',
        startTime: isRest ? null : this.cleanTime(String(day.startTime ?? day.start ?? '09:00')),
        endTime: isRest ? null : this.cleanTime(String(day.endTime ?? day.end ?? '17:00')),
        breakMinutes: Number(day.breakMinutes ?? 0) || 0,
        departmentId: typeof day.departmentId === 'string' ? day.departmentId : null,
        positionId: typeof day.positionId === 'string' ? day.positionId : null,
        siteId: typeof day.siteId === 'string' ? day.siteId : null,
      };
    });
  }
  private normalizePlanningTemplate(template: any) {
    const content = this.normalizeTemplateContent(template.periodType, template.content);
    const kind = this.templateKind({ ...template, content });
    const lines = kind === 'DAY_PRESET'
      ? [{ startTime: content.startTime, endTime: content.endTime, breakMinutes: content.breakMinutes ?? 0, departmentId: content.departmentId ?? template.departmentId ?? null, positionId: content.positionId ?? null, siteId: content.siteId ?? template.siteId ?? null, businessStatus: this.cleanBusinessStatus(content.businessStatus) }]
      : Array.isArray(content.days) ? content.days.filter((day: any) => day.mode === 'WORK').map((day: any) => ({ dayOfWeek: day.dayOfWeek, startTime: day.startTime, endTime: day.endTime, breakMinutes: day.breakMinutes ?? 0, departmentId: day.departmentId ?? template.departmentId ?? null, positionId: day.positionId ?? null, siteId: day.siteId ?? template.siteId ?? null })) : [];
    return { ...template, content, templateType: kind ?? template.periodType, type: kind ?? template.periodType, source: 'planning_templates', startTime: content.startTime, endTime: content.endTime, breakMinutes: content.breakMinutes, paidBreak: content.paidBreak, businessStatus: this.cleanBusinessStatus(content.businessStatus), positionId: content.positionId ?? null, employeeIds: this.stringArray(content.employeeIds), defaultEmployeeIds: this.stringArray(content.defaultEmployeeIds), days: content.days, lines };
  }
  private cleanBusinessStatus(value?: string | null) {
    const allowed = new Set(['work', 'rest', 'vacation', 'sick', 'vv', 'leave', 'other']);
    return value && allowed.has(value) ? value : 'work';
  }
  private employeeTemplateAssignments(templates: any[], employees: any[] = []) {
    const employeeIds = new Set<string>(employees.map(employee => employee.id).filter(Boolean));
    for (const template of templates) this.stringArray(template.employeeIds ?? template.content?.employeeIds).forEach(id => employeeIds.add(id));
    for (const template of templates) this.stringArray(template.defaultEmployeeIds ?? template.content?.defaultEmployeeIds).forEach(id => employeeIds.add(id));
    return [...employeeIds].map(employeeId => {
      const dayPresetIds = templates.filter(template => template.templateType === 'DAY_PRESET' && this.stringArray(template.employeeIds ?? template.content?.employeeIds).includes(employeeId)).map(template => template.id);
      const weeklyRotationIds = templates.filter(template => template.templateType === 'WEEKLY_ROTATION' && this.stringArray(template.employeeIds ?? template.content?.employeeIds).includes(employeeId)).map(template => template.id);
      const defaultWeeklyRotationId = templates.find(template => template.templateType === 'WEEKLY_ROTATION' && this.stringArray(template.defaultEmployeeIds ?? template.content?.defaultEmployeeIds).includes(employeeId))?.id ?? null;
      return { employeeId, dayPresetIds, weeklyRotationIds, defaultWeeklyRotationId, persistence: 'planning_templates.content' };
    });
  }
  private async validateTemplateRefs(organizationId: string, departmentId?: string | null, siteId?: string | null, positionId?: string | null) {
    if (departmentId && !(await this.prisma.hrDepartment.findFirst({ where: { id: departmentId, organizationId, isArchived: false } }))) throw new NotFoundException('Service RH introuvable');
    if (positionId && !(await this.prisma.hrPosition.findFirst({ where: { id: positionId, organizationId, isArchived: false } }))) throw new NotFoundException('Poste RH introuvable');
    if (siteId && !(await this.prisma.site.findFirst({ where: { id: siteId, organizationId, isArchived: false } }))) throw new NotFoundException('Site introuvable');
  }
  private period(q: PlanningQueryDto = {}): Period {
    const now = new Date();
    const year = q.year ?? (q.startDate ? this.parseDate(q.startDate).getFullYear() : now.getFullYear());
    const month = q.month ?? (q.startDate ? this.parseDate(q.startDate).getMonth() + 1 : now.getMonth() + 1);
    const start = q.startDate ? this.day(this.parseDate(q.startDate)) : new Date(year, month - 1, 1);
    const end = q.endDate ? this.endDay(this.parseDate(q.endDate)) : this.endDay(new Date(year, month, 0));
    const days: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(this.iso(d));
    return { start, end, month, year, days };
  }
  private hasPeriodFilter(q: PlanningQueryDto) { return Boolean(q.date || q.startDate || q.endDate || q.month || q.year); }
  private assignmentWhere(organizationId: string, q: PlanningQueryDto, period: Period, forcePeriod = false): Prisma.PlanningAssignmentWhereInput {
    const date = q.date ? { gte: this.day(this.parseDate(q.date)), lte: this.endDay(this.parseDate(q.date)) } : forcePeriod || this.hasPeriodFilter(q) ? { gte: period.start, lte: period.end } : undefined;
    return { organizationId, employeeId: q.employeeId, departmentId: q.departmentId, positionId: q.positionId, siteId: q.siteId, status: q.status, date };
  }
  private needWhere(organizationId: string, q: PlanningQueryDto, period: Period, forcePeriod = false): Prisma.PlanningOperationalNeedWhereInput {
    const dateFilter = forcePeriod || this.hasPeriodFilter(q);
    return { organizationId, departmentId: q.departmentId, siteId: q.siteId, positionId: q.positionId, startDate: dateFilter ? { lte: period.end } : undefined, OR: dateFilter ? [{ endDate: null }, { endDate: { gte: period.start } }] : undefined };
  }
  private assignmentMinutes(a: AnyAssignment) { return plannedMinutes(a); }
  private employeeRate(employee: AnyEmployee) { return Number(employee?.compensations?.[0]?.hourlyRate ?? employee?.hourlyRate ?? 0) || 0; }
  private employeeContractMinutes(employee: AnyEmployee) { return Number(employee?.contracts?.[0]?.weeklyHours ?? employee?.contractWeeklyMinutes ?? 0) || 0; }
  private iso(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
  private alertLevel(severity: string) { return severity === 'BLOCKING' ? 'critical' : severity === 'STRONG_WARNING' ? 'warning' : 'info'; }
  private alerts(conflicts: any[], absences: any[], coverage: any[], rotations: any[], employees: any[]) {
    const employeesWithRotation = new Set(rotations.flatMap((rotation: any) => this.stringArray(rotation.employeeIds ?? rotation.content?.employeeIds)));
    const missingRotations = employees.filter(employee => !employeesWithRotation.has(employee.id)).length;
    return [
      ...conflicts.map(conflict => ({ id: conflict.id, level: this.alertLevel(conflict.severity), title: conflict.label, message: conflict.label, code: conflict.code, entityType: 'PlanningConflict', entityId: conflict.id, details: conflict.details, createdAt: conflict.createdAt })),
      ...coverage.filter(item => ['UNDERSTAFFED', 'PARTIAL', 'UNPLANNED'].includes(item.status)).map(item => ({ id: `coverage-${item.need.id}`, level: item.status === 'UNPLANNED' ? 'warning' : 'info', title: 'Besoin a traiter', message: `${item.need.label}: ${item.plannedCount}/${item.requiredCount} couvert(s)`, code: item.status, entityType: 'PlanningOperationalNeed', entityId: item.need.id })),
      ...absences.map(absence => ({ id: `absence-${absence.id}`, level: 'info', title: 'Absence RH a prendre en compte', message: `${absence.employee?.firstName ?? ''} ${absence.employee?.lastName ?? ''}`.trim(), code: 'HR_ABSENCE_READONLY', entityType: 'HrAbsence', entityId: absence.id })),
      ...(missingRotations ? [{ id: 'employees-without-rotation', level: 'info', title: 'Roulements Planning incomplets', message: `${missingRotations} collaborateur(s) sans roulement Planning attribué`, code: 'EMPLOYEES_WITHOUT_PLANNING_ROTATION', entityType: 'PlanningTemplate' }] : []),
    ];
  }
  private dashboardFrom(assignments: any[], departments: any[], conflicts: any[], alerts: any[], coverage: any[], replacements: any[], period: Period) {
    const plannedMinutes = assignments.reduce((sum, assignment) => sum + this.assignmentMinutes(assignment), 0);
    const estimatedCost = assignments.reduce((sum, assignment) => sum + (this.assignmentMinutes(assignment) / 60) * this.employeeRate(assignment.employee), 0);
    const hoursByDepartment = departments.map(department => {
      const minutes = assignments.filter(assignment => assignment.departmentId === department.id).reduce((sum, assignment) => sum + this.assignmentMinutes(assignment), 0);
      return { departmentId: department.id, departmentName: department.name, plannedMinutes: Math.round(minutes), plannedHours: Math.round((minutes / 60) * 10) / 10 };
    });
    const priorityAlerts = alerts.filter(alert => ['critical', 'warning', 'critique', 'attention'].includes(String(alert.level)));
    const actions = [
      ...conflicts.filter(conflict => conflict.severity === 'BLOCKING').map(conflict => ({ type: 'CONFLICT', priority: 'HIGH', label: conflict.label, entityId: conflict.id })),
      ...coverage.filter(item => ['UNDERSTAFFED', 'UNPLANNED'].includes(item.status)).map(item => ({ type: 'NEED_COVERAGE', priority: item.status === 'UNPLANNED' ? 'HIGH' : 'NORMAL', label: item.need.label, entityId: item.need.id })),
      ...replacements.filter(replacement => ['TO_PROCESS', 'PROPOSED'].includes(replacement.status)).map(replacement => ({ type: 'REPLACEMENT', priority: 'NORMAL', label: 'Remplacement a traiter', entityId: replacement.id })),
    ];
    return { summary: { plannedMinutes: Math.round(plannedMinutes), plannedHours: Math.round((plannedMinutes / 60) * 10) / 10, estimatedCost: Math.round(estimatedCost * 100) / 100, activeAlerts: alerts.length, priorityAlerts: priorityAlerts.length, actionsToProcess: actions.length, weeklyPlannedHours: Math.round((plannedMinutes / 60) * 10) / 10 }, hoursByDepartment, alerts: priorityAlerts, actions, coverage };
  }
  private monthView(period: Period, assignments: any[], needs: any[]) {
    return { month: period.month, year: period.year, days: period.days.map(date => {
      const dayAssignments = assignments.filter(assignment => this.iso(assignment.date) === date);
      const dayNeeds = needs.filter(need => this.iso(need.startDate) <= date && (!need.endDate || this.iso(need.endDate) >= date));
      const conflicts = dayAssignments.flatMap(assignment => assignment.conflicts ?? []);
      const color = dayAssignments.length === 0 ? 'grey' : conflicts.some(conflict => conflict.severity === 'BLOCKING') ? 'red-light' : conflicts.length || dayNeeds.length ? 'orange' : 'green';
      return { date, assignments: dayAssignments, needs: dayNeeds, conflicts, plannedMinutes: Math.round(dayAssignments.reduce((sum, assignment) => sum + this.assignmentMinutes(assignment), 0)), color };
    }) };
  }
  private attendancePlaceholder(assignments: any[]) {
    const rows = assignments.map(assignment => ({ assignmentId: assignment.id, employeeId: assignment.employeeId, date: this.iso(assignment.date), plannedStartTime: assignment.startTime, plannedEndTime: assignment.endTime, plannedMinutes: Math.round(this.assignmentMinutes(assignment)), declaredStartTime: null, declaredEndTime: null, declaredMinutes: null, varianceMinutes: null, status: 'NON_SIGNE' }));
    return { persistence: false, mobileEnabled: false, statuses: ['NON_SIGNE', 'SIGNE', 'A_VALIDER', 'VALIDE', 'ANOMALIE'], rows };
  }
  private async saveAssignmentAllowingConflicts(organizationId: string, actor: Actor, id: string | undefined, dto: UpsertPlanningAssignmentDto) {
    await this.validateRefs(organizationId, dto);
    const data = this.assignmentData(organizationId, dto);
    const conflicts = await this.detectConflicts(organizationId, data, id);
    const assignment = await this.prisma.$transaction(async tx => {
      if (id) {
        const old = await tx.planningAssignment.findFirst({ where: { id, organizationId } });
        await tx.planningConflict.deleteMany({ where: { assignmentId: id, resolvedAt: null } });
        const assignment = await tx.planningAssignment.update({ where: { id, organizationId }, data: { ...data, absenceId: conflicts.find(c => c.code === 'APPROVED_ABSENCE')?.absenceId, updatedById: actor.id, allowCriticalOverride: true, overrideReason: dto.overrideReason ?? null }, include: ASSIGNMENT_INCLUDE });
        await this.persistConflicts(tx, organizationId, id, conflicts);
        await this.history(tx, organizationId, actor.id, PlanningHistoryAction.ASSIGNMENT_UPDATED, 'PlanningAssignment', id, 'Affectation modifiée', old, assignment);
        return assignment;
      }
      const assignment = await tx.planningAssignment.create({ data: { ...data, absenceId: conflicts.find(c => c.code === 'APPROVED_ABSENCE')?.absenceId, createdById: actor.id, allowCriticalOverride: true, overrideReason: dto.overrideReason ?? null }, include: ASSIGNMENT_INCLUDE });
      await this.persistConflicts(tx, organizationId, assignment.id, conflicts);
      await this.history(tx, organizationId, actor.id, PlanningHistoryAction.ASSIGNMENT_ADDED, 'PlanningAssignment', assignment.id, 'Affectation ajoutée', null, assignment);
      return assignment;
    });
    await this.recordAssignmentPeriodMutation(organizationId, actor.id, assignment, id ? 'Affectation modifiée après publication' : 'Affectation ajoutée après publication');
    return assignment;
  }
  private planningRotationAssignmentsPreview(template: any, employees: any[], start: Date, end: Date, siteId?: string) {
    const days: any[] = Array.isArray(template.days) ? template.days : this.normalizeWeeklyRotationDays(template.content?.days);
    const byWeekDay = new Map(days.map((day: any) => [Number(day.dayOfWeek), day]));
    const previews: any[] = [];
    for (const employee of employees) {
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const dayOfWeek = cursor.getDay() || 7;
        const day = byWeekDay.get(dayOfWeek);
        if (!day || this.rotationDayIsRest(day)) continue;
        const departmentId = day.departmentId ?? template.departmentId ?? employee.departmentId;
        const positionId = day.positionId ?? employee.positionId;
        if (!departmentId || !positionId || !day.startTime || !day.endTime) continue;
        previews.push({
          employeeId: employee.id,
          departmentId,
          positionId,
          siteId: siteId ?? day.siteId ?? template.siteId ?? employee.mainSiteId ?? null,
          date: this.iso(cursor),
          startTime: day.startTime,
          endTime: day.endTime,
          breakMinutes: day.breakMinutes ?? 0,
          status: PlanningAssignmentStatus.PLANNED,
          origin: PlanningAssignmentOrigin.AUTO_GENERATION,
          comment: `Roulement Planning ${template.name}`,
        });
      }
    }
    return previews;
  }
  private rotationDayIsRest(day: any) {
    const value = String(day.mode ?? day.type ?? day.status ?? '').toUpperCase();
    return value === 'REST' || value === 'OFF' || value === 'REPOS' || day.isRest === true;
  }
  private async recalculateBaseAlerts(organizationId: string, start: Date, end: Date) {
    const managedCodes = ['UNDERSTAFFED_NEED', 'UNCOVERED_NEED', 'CLOSING_UNCOVERED', 'REQUIRED_POSITION_MISSING', 'WEEKLY_QUOTA_EXCEEDED'];
    await this.prisma.planningConflict.deleteMany({ where: { organizationId, assignmentId: null, resolvedAt: null, code: { in: managedCodes } } });
    const [coverage, employees, assignments] = await Promise.all([
      this.coverage(organizationId, start, end),
      this.prisma.hrEmployee.findMany({ where: { organizationId, isArchived: false, status: HrEmployeeStatus.ACTIVE }, include: { contracts: { orderBy: { startDate: 'desc' }, take: 1 } } }),
      this.prisma.planningAssignment.findMany({ where: { organizationId, date: { gte: this.day(start), lte: this.endDay(end) }, status: { not: PlanningAssignmentStatus.CANCELLED } }, include: { employee: true, department: true, position: true } }),
    ]);
    const conflictData: Prisma.PlanningConflictCreateManyInput[] = [];
    for (const item of coverage.filter(row => ['UNDERSTAFFED', 'UNPLANNED'].includes(row.status))) {
      const timeSlot = this.getNeedTimeSlot(item.need);
      const isClosing = timeSlot === 'fermeture' && item.plannedCount === 0;
      const isRequiredPositionMissing = !!item.need.positionId && item.plannedCount < item.requiredCount;
      const code = isClosing ? 'CLOSING_UNCOVERED' : isRequiredPositionMissing ? 'REQUIRED_POSITION_MISSING' : item.status === 'UNPLANNED' ? 'UNCOVERED_NEED' : 'UNDERSTAFFED_NEED';
      const severity = isClosing || item.status === 'UNPLANNED' ? PlanningConflictSeverity.BLOCKING : PlanningConflictSeverity.STRONG_WARNING;
      const label = isClosing ? `Fermeture non couverte: ${item.need.department?.name ?? item.need.label}` : isRequiredPositionMissing ? `Poste obligatoire absent: ${item.need.position?.name ?? item.need.label}` : `${item.need.label}: ${item.plannedCount}/${item.requiredCount} couvert(s)`;
      conflictData.push({ organizationId, severity, code, label, details: this.operationalNeedAlertDetails(item, code) as Prisma.InputJsonValue });
    }
    const plannedByEmployee = new Map<string, number>();
    assignments.forEach(assignment => plannedByEmployee.set(assignment.employeeId, (plannedByEmployee.get(assignment.employeeId) ?? 0) + this.assignmentMinutes(assignment)));
    const periodWeekFactor = Math.max(Math.ceil((+this.endDay(end) - +this.day(start)) / 86400000) / 7, 1);
    for (const employee of employees) {
      const contractMinutes = this.employeeContractMinutes(employee);
      const plannedMinutes = plannedByEmployee.get(employee.id) ?? 0;
      if (contractMinutes && plannedMinutes > contractMinutes * periodWeekFactor) {
        conflictData.push({ organizationId, severity: PlanningConflictSeverity.STRONG_WARNING, code: 'WEEKLY_QUOTA_EXCEEDED', label: `${employee.firstName} ${employee.lastName}: quota hebdomadaire dépassé`, details: { employeeId: employee.id, plannedMinutes, contractMinutes, periodWeekFactor } as Prisma.InputJsonValue });
      }
    }
    if (conflictData.length) await this.prisma.planningConflict.createMany({ data: conflictData, skipDuplicates: false });
  }
  private operationalNeedAlertDetails(item: any, code: string) {
    const need = this.normalizeOperationalNeed(item.need);
    return { type: code, severity: item.status === 'UNPLANNED' ? 'blocking' : 'warning', message: `${need.label}: ${item.plannedCount}/${item.requiredCount} couvert(s)`, date: this.iso(need.startDate), startDate: this.iso(need.startDate), endDate: need.endDate ? this.iso(need.endDate) : null, departmentId: need.departmentId, departmentName: need.department?.name ?? null, positionId: need.positionId ?? null, positionName: need.position?.name ?? null, siteId: need.siteId ?? null, plannedCount: item.plannedCount, requiredCount: item.requiredCount, season: need.season, timeSlot: need.timeSlot, target: { type: 'PlanningOperationalNeed', id: need.id } };
  }
  private assignmentData(organizationId: string, dto: UpsertPlanningAssignmentDto) {
    const startTime = this.parseTime(dto.date, dto.startTime);
    const endTime = this.parseTime(dto.date, dto.endTime);
    if (endTime <= startTime) endTime.setDate(endTime.getDate() + 1);
    return { organizationId, employeeId: dto.employeeId, departmentId: dto.departmentId, positionId: dto.positionId, siteId: dto.siteId ?? null, date: this.day(this.parseDate(dto.date)), startTime, endTime, breakMinutes: dto.breakMinutes ?? 0, status: dto.status ?? PlanningAssignmentStatus.PLANNED, origin: dto.origin ?? PlanningAssignmentOrigin.MANUAL, comment: dto.comment ?? null, allowCriticalOverride: !!dto.allowCriticalOverride, overrideReason: dto.overrideReason ?? null };
  }
  private async validateRefs(organizationId: string, dto: UpsertPlanningAssignmentDto) { const [e, d, p] = await Promise.all([this.ensureEmployee(organizationId, dto.employeeId), this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId, isArchived: false } }), this.prisma.hrPosition.findFirst({ where: { id: dto.positionId, organizationId, isArchived: false } })]); if (!d) throw new NotFoundException('Service RH introuvable'); if (!p) throw new NotFoundException('Poste RH introuvable'); if (e.departmentId !== dto.departmentId) {/* warning handled in controls */} if (dto.siteId && !(await this.prisma.site.findFirst({ where: { id: dto.siteId, organizationId, isArchived: false } }))) throw new NotFoundException('Site introuvable'); }
  private normalizeOperationalNeed(need: any) {
    const metadata = this.parseOperationalNeedMetadata(need.comment);
    const season = this.getNeedSeason(need);
    const timeSlot = this.getNeedTimeSlot(need);
    const alertImpact = need.priority === 'CRITICAL' ? 'blocking' : need.priority === 'HIGH' ? 'warning' : 'info';
    return { ...need, season, seasonLabel: NEED_SEASONS[season] ?? NEED_SEASONS.normale, timeSlot, timeSlotLabel: NEED_TIME_SLOTS[timeSlot] ?? NEED_TIME_SLOTS.personnalise, alertImpact, metadata };
  }
  private parseOperationalNeedMetadata(comment?: string | null): OperationalNeedMetadata {
    const fallback: OperationalNeedMetadata = { season: 'normale', timeSlot: 'personnalise' };
    if (!comment) return fallback;
    try {
      const parsed = JSON.parse(comment);
      const meta = parsed?.planningNeedMeta ?? parsed;
      return {
        season: this.cleanNeedSeason(meta?.season),
        timeSlot: this.cleanNeedTimeSlot(meta?.timeSlot ?? meta?.slot),
        note: typeof meta?.note === 'string' ? meta.note : null,
        daysOfWeek: Array.isArray(meta?.daysOfWeek) ? meta.daysOfWeek.map(Number).filter((day: number) => day >= 1 && day <= 7) : undefined,
        recurrence: typeof meta?.recurrence === 'string' ? meta.recurrence : null,
      };
    } catch {
      const legacy = Object.fromEntries(comment.split(';').map(part => part.split('=')).filter(part => part.length === 2));
      return { season: this.cleanNeedSeason(legacy.season), timeSlot: this.cleanNeedTimeSlot(legacy.timeSlot ?? legacy.slot), note: null };
    }
  }
  private buildOperationalNeedPayload(organizationId: string, dto: UpsertPlanningNeedDto): Prisma.PlanningOperationalNeedUncheckedCreateInput {
    const legacy = this.parseOperationalNeedMetadata(dto.comment);
    const season = this.cleanNeedSeason(dto.season ?? legacy.season);
    const timeSlot = this.cleanNeedTimeSlot(dto.timeSlot ?? legacy.timeSlot);
    const label = dto.label?.trim() || `${NEED_SEASONS[season] ?? NEED_SEASONS.normale} / ${NEED_TIME_SLOTS[timeSlot] ?? NEED_TIME_SLOTS.personnalise}`;
    return { organizationId, departmentId: dto.departmentId, siteId: dto.siteId ?? null, positionId: dto.positionId ?? null, requiredSkillId: dto.requiredSkillId ?? null, label, startDate: this.parseDate(dto.startDate), endDate: dto.endDate ? this.parseDate(dto.endDate) : null, startTime: dto.startTime, endTime: dto.endTime, requiredCount: dto.requiredCount, priority: dto.priority, comment: this.serializeOperationalNeedMetadata({ season, timeSlot, note: legacy.note, daysOfWeek: legacy.daysOfWeek, recurrence: legacy.recurrence }) };
  }
  private getNeedSeason(need: any) { return this.cleanNeedSeason(this.parseOperationalNeedMetadata(need.comment).season); }
  private getNeedTimeSlot(need: any) { return this.cleanNeedTimeSlot(this.parseOperationalNeedMetadata(need.comment).timeSlot); }
  private cleanNeedSeason(value?: string | null) { return value && NEED_SEASONS[value] ? value : 'normale'; }
  private cleanNeedTimeSlot(value?: string | null) { return value && NEED_TIME_SLOTS[value] ? value : 'personnalise'; }
  private serializeOperationalNeedMetadata(metadata: OperationalNeedMetadata) {
    const planningNeedMeta: Record<string, unknown> = { season: metadata.season, timeSlot: metadata.timeSlot, note: metadata.note ?? null };
    if (metadata.daysOfWeek?.length) planningNeedMeta.daysOfWeek = metadata.daysOfWeek;
    if (metadata.recurrence) planningNeedMeta.recurrence = metadata.recurrence;
    return JSON.stringify({ planningNeedMeta });
  }
  private planningRulesCatalog() {
    const rules = [
      { key: 'closing-covered', name: 'Fermeture obligatoire couverte', description: 'Déclenche une alerte bloquante si un besoin fermeture n’a aucune affectation couvrante.', status: 'active', impact: 'blocking', requiredData: ['planning_operational_needs.timeSlot=fermeture', 'planning_assignments'] },
      { key: 'minimum-by-service', name: 'Minimum par service', description: 'Compare les besoins par service aux affectations qui couvrent le jour et le créneau.', status: 'active', impact: 'warning', requiredData: ['planning_operational_needs', 'planning_assignments'] },
      { key: 'required-position-present', name: 'Poste obligatoire présent', description: 'Déclenche une alerte si un besoin avec poste défini n’est pas couvert par ce poste.', status: 'active', impact: 'warning', requiredData: ['planning_operational_needs.positionId', 'planning_assignments.positionId'] },
      { key: 'weekly-quota', name: 'Quota hebdomadaire', description: 'Compare les heures planifiées aux heures contractuelles RH.', status: 'active', impact: 'warning', requiredData: ['planning_assignments', 'hr_contracts'] },
      { key: 'mandatory-break', name: 'Pause obligatoire', description: 'Préparé pour règles configurables France/Finlande, non codé en dur.', status: 'to_configure', impact: 'warning', requiredData: ['planning_assignments.breakMinutes', 'planning_rule_profiles'] },
      { key: 'minimum-rest-between-shifts', name: 'Repos minimum entre shifts', description: 'Préparé pour profil entreprise configurable.', status: 'to_configure', impact: 'warning', requiredData: ['planning_assignments', 'planning_rule_profiles'] },
      { key: 'availability-respected', name: 'Indisponibilité respectée', description: 'Les absences RH approuvées sont déjà bloquantes; les indisponibilités Planning dédiées viendront plus tard.', status: 'partial', impact: 'blocking', requiredData: ['hr_absences', 'planning_unavailabilities future'] },
      { key: 'overlap-forbidden', name: 'Chevauchement interdit', description: 'Détecte les chevauchements d’affectations pour un même salarié.', status: 'active', impact: 'blocking', requiredData: ['planning_assignments'] },
    ];
    return rules;
  }
  private payrollRuleProfilesPlaceholder() {
    return { currentProfile: 'custom', availableProfiles: ['france', 'finland', 'custom'], configurableByCompany: true, families: ['heures supplémentaires', 'dimanche', 'jours fériés', 'nuit', 'pauses', 'arrondis', 'primes'], persistence: false, note: 'Préparé pour calcul paie/coût futur sans règle légale codée en dur.' };
  }
  private async validateNeedRefs(organizationId: string, dto: UpsertPlanningNeedDto) { if (!(await this.prisma.hrDepartment.findFirst({ where: { id: dto.departmentId, organizationId, isArchived: false } }))) throw new NotFoundException('Service RH introuvable'); if (dto.positionId && !(await this.prisma.hrPosition.findFirst({ where: { id: dto.positionId, organizationId, isArchived: false } }))) throw new NotFoundException('Poste RH introuvable'); if (dto.requiredSkillId && !(await this.prisma.hrSkill.findFirst({ where: { id: dto.requiredSkillId, organizationId, isArchived: false } }))) throw new NotFoundException('Compétence RH introuvable'); }
  private async ensureEmployee(organizationId: string, id: string) { const e = await this.prisma.hrEmployee.findFirst({ where: { id, organizationId, isArchived: false }, include: { skills: true, user: true } }); if (!e) throw new NotFoundException('Collaborateur RH introuvable'); return e; }
  private async detectConflicts(organizationId: string, data: any, excludeId?: string) {
    const conflicts: any[] = [];
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id: data.employeeId, organizationId }, include: { skills: true } });
    if (!employee || employee.isArchived || employee.status !== HrEmployeeStatus.ACTIVE) conflicts.push({ severity: 'BLOCKING', code: 'EMPLOYEE_UNAVAILABLE', label: 'Collaborateur inactif ou archivé' });
    const absence = await this.prisma.hrAbsence.findFirst({ where: { organizationId, employeeId: data.employeeId, status: HrAbsenceStatus.APPROVED, startDate: { lte: data.endTime }, endDate: { gte: data.startTime } } });
    if (absence) conflicts.push({ severity: 'BLOCKING', code: 'APPROVED_ABSENCE', label: 'Collaborateur affecté pendant une absence validée', absenceId: absence.id });
    const overlap = await this.prisma.planningAssignment.findFirst({ where: { organizationId, employeeId: data.employeeId, id: excludeId ? { not: excludeId } : undefined, status: { not: PlanningAssignmentStatus.CANCELLED }, startTime: { lt: data.endTime }, endTime: { gt: data.startTime } } });
    if (overlap) conflicts.push({ severity: 'BLOCKING', code: 'TIME_OVERLAP', label: 'Chevauchement horaire bloquant' });
    if (employee && employee.departmentId !== data.departmentId) conflicts.push({ severity: 'STRONG_WARNING', code: 'DEPARTMENT_MISMATCH', label: 'Service différent du service habituel' });
    if (employee && employee.positionId !== data.positionId) conflicts.push({ severity: 'STRONG_WARNING', code: 'POSITION_MISMATCH', label: 'Poste différent du poste habituel' });

    const dayAssignments = await this.prisma.planningAssignment.findMany({ where: { organizationId, employeeId: data.employeeId, date: data.date, status: { not: PlanningAssignmentStatus.CANCELLED }, id: excludeId ? { not: excludeId } : undefined } });
    const dailyMinutes = dayAssignments.reduce((sum, assignment) => sum + this.assignmentMinutes(assignment), 0) + this.assignmentMinutes(data);
    if (dailyMinutes > 600) conflicts.push({ severity: 'STRONG_WARNING', code: 'DAILY_AMPLITUDE', label: 'Amplitude journalière supérieure à 10h' });

    const ws = this.weekStart(data.date);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    we.setHours(23, 59, 59, 999);
    const week = await this.prisma.planningAssignment.findMany({ where: { organizationId, employeeId: data.employeeId, date: { gte: ws, lte: we }, status: { not: PlanningAssignmentStatus.CANCELLED }, id: excludeId ? { not: excludeId } : undefined } });
    const weeklyMinutes = week.reduce((sum, assignment) => sum + this.assignmentMinutes(assignment), 0) + this.assignmentMinutes(data);
    if (weeklyMinutes > 48 * 60) conflicts.push({ severity: 'STRONG_WARNING', code: 'WEEKLY_LOAD', label: 'Charge hebdomadaire supérieure à 48h' });
    return conflicts;
  }
  private async persistConflicts(tx: Prisma.TransactionClient, organizationId: string, assignmentId: string, conflicts: any[]) { for (const c of conflicts) await tx.planningConflict.create({ data: { organizationId, assignmentId, severity: c.severity as PlanningConflictSeverity, code: c.code, label: c.label, details: c as Prisma.InputJsonValue } }); }
  private weekStart(d: Date) { const x = this.day(d); const day = x.getDay() || 7; x.setDate(x.getDate() - day + 1); return x; }
  private addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }
  private async history(tx: Prisma.TransactionClient, organizationId: string, actorUserId: string | undefined, action: PlanningHistoryAction, entityType: string, entityId: string | undefined, label: string, oldValue: any, newValue: any) { await tx.planningHistory.create({ data: { organizationId, actorUserId, action, entityType, entityId, label, oldValue: oldValue as Prisma.InputJsonValue, newValue: newValue as Prisma.InputJsonValue } }); }
  private async notify(tx: Prisma.TransactionClient, organizationId: string, title: string, message: string, eventType: string, entityType?: string, entityId?: string, recipientUserId?: string | null, recipientEmployeeId?: string | null) { await tx.planningNotification.create({ data: { organizationId, title, message, eventType, entityType, entityId, recipientUserId: recipientUserId || null, recipientEmployeeId: recipientEmployeeId || null } }); await tx.planningHistory.create({ data: { organizationId, action: PlanningHistoryAction.NOTIFICATION_CREATED, entityType: 'PlanningNotification', label: title, newValue: { message, eventType } as Prisma.InputJsonValue } }); }
  private async coverage(organizationId: string, start: Date, end: Date) {
    const needs = await this.prisma.planningOperationalNeed.findMany({ where: { organizationId, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, include: { department: true, site: true, position: true } });
    const assignments = await this.prisma.planningAssignment.findMany({ where: { organizationId, date: { gte: this.day(start), lte: this.endDay(end) }, status: { not: PlanningAssignmentStatus.CANCELLED } } });
    return needs.map(n => {
      const needStart = this.iso(n.startDate);
      const needEnd = this.iso(n.endDate ?? n.startDate);
      const count = assignments.filter(a => {
        const assignmentDate = this.iso(a.date);
        return assignmentDate >= needStart && assignmentDate <= needEnd &&
          a.departmentId === n.departmentId &&
          (!n.siteId || a.siteId === n.siteId) &&
          (!n.positionId || a.positionId === n.positionId) &&
          this.timeRangesOverlap(a.startTime, a.endTime, n.startTime, n.endTime);
      }).length;
      const status = count >= n.requiredCount ? 'COVERED' : count === 0 ? 'UNPLANNED' : 'PARTIAL';
      return { need: n, plannedCount: count, requiredCount: n.requiredCount, status: count < n.requiredCount && count > 0 ? 'UNDERSTAFFED' : status };
    });
  }
  private timeRangesOverlap(aStart: Date | string, aEnd: Date | string, bStart: Date | string, bEnd: Date | string) {
    const startA = this.timeMinutes(aStart);
    let endA = this.timeMinutes(aEnd);
    const startB = this.timeMinutes(bStart);
    let endB = this.timeMinutes(bEnd);
    if (endA <= startA) endA += 24 * 60;
    if (endB <= startB) endB += 24 * 60;
    return startA < endB && endA > startB;
  }
  private timeMinutes(value: Date | string) {
    if (value instanceof Date) return value.getHours() * 60 + value.getMinutes();
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      return date.getHours() * 60 + date.getMinutes();
    }
    const [hours, minutes] = value.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }
  private async detectAbsenceImpact(organizationId: string, actor: Actor, absenceId: string) { const absence = await this.prisma.hrAbsence.findFirst({ where: { id: absenceId, organizationId } }); if (!absence || absence.status !== HrAbsenceStatus.APPROVED) return; const impacted = await this.prisma.planningAssignment.findMany({ where: { organizationId, employeeId: absence.employeeId, status: { not: PlanningAssignmentStatus.CANCELLED }, startTime: { lte: absence.endDate }, endTime: { gte: absence.startDate } } }); for (const a of impacted) { const exists = await this.prisma.planningReplacement.findFirst({ where: { organizationId, assignmentId: a.id, absenceId } }); if (!exists) await this.prisma.planningReplacement.create({ data: { organizationId, assignmentId: a.id, absenceId, absentEmployeeId: absence.employeeId, status: PlanningReplacementStatus.TO_PROCESS, requestedById: actor.id, rationale: await this.replacementCandidates(organizationId, a) as Prisma.InputJsonValue } }); } }
  private async replacementCandidates(organizationId: string, a: any) { const emps = await this.prisma.hrEmployee.findMany({ where: { organizationId, isArchived: false, status: HrEmployeeStatus.ACTIVE, id: { not: a.employeeId } }, include: { skills: { include: { skill: true } }, department: true, position: true } }); const busy = await this.prisma.planningAssignment.findMany({ where: { organizationId, startTime: { lt: a.endTime }, endTime: { gt: a.startTime }, status: { not: PlanningAssignmentStatus.CANCELLED } } }); const busyIds = new Set(busy.map(b => b.employeeId)); return emps.map(e => ({ employeeId: e.id, score: (e.departmentId === a.departmentId ? 40 : 0) + (e.positionId === a.positionId ? 30 : 0) + (!busyIds.has(e.id) ? 20 : -100), reasons: [e.departmentId === a.departmentId ? 'Même service' : 'Service différent', e.positionId === a.positionId ? 'Même poste' : 'Poste différent', !busyIds.has(e.id) ? 'Disponible' : 'Conflit horaire'] })).filter(c => c.score > 0).sort((x, y) => y.score - x.score).slice(0, 5); }
  private async buildGenerationPreview(organizationId: string, start: Date, end: Date, siteId?: string) { const [needs, employees, absences, existing] = await Promise.all([this.prisma.planningOperationalNeed.findMany({ where: { organizationId, siteId: siteId ?? undefined }, include: { department: true, position: true } }), this.prisma.hrEmployee.findMany({ where: { organizationId, isArchived: false, status: HrEmployeeStatus.ACTIVE, mainSiteId: siteId ?? undefined }, include: { skills: true } }), this.prisma.hrAbsence.findMany({ where: { organizationId, status: HrAbsenceStatus.APPROVED, startDate: { lte: end }, endDate: { gte: start } } }), this.prisma.planningAssignment.findMany({ where: { organizationId, date: { gte: start, lte: end }, status: { not: PlanningAssignmentStatus.CANCELLED } } })]); const assignments: any[] = [], alerts: any[] = []; for (const need of needs) { for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { const already = existing.filter(a => a.departmentId === need.departmentId && a.date.toDateString() === d.toDateString()).length + assignments.filter(a => a.departmentId === need.departmentId && a.date === d.toISOString().slice(0, 10)).length; for (let i = already; i < need.requiredCount; i++) { const candidate = employees.find(e => e.departmentId === need.departmentId && !absences.some(ab => ab.employeeId === e.id && ab.startDate <= d && ab.endDate >= d) && !assignments.some(a => a.employeeId === e.id && a.date === d.toISOString().slice(0, 10))); if (!candidate) { alerts.push({ level: 'critical', code: 'UNCOVERED_NEED', needId: need.id, date: d.toISOString().slice(0, 10) }); continue; } assignments.push({ employeeId: candidate.id, departmentId: need.departmentId, positionId: need.positionId ?? candidate.positionId, siteId: need.siteId ?? siteId, date: d.toISOString().slice(0, 10), startTime: need.startTime, endTime: need.endTime, breakMinutes: 30, status: PlanningAssignmentStatus.PLANNED, origin: PlanningAssignmentOrigin.AUTO_GENERATION }); } } } return { assignments, alerts, summary: { created: assignments.length, uncovered: alerts.length }, deterministicRules: ['besoins par service', 'collaborateur actif', 'absence validée exclue', 'pas de doublon journalier'] }; }
}
