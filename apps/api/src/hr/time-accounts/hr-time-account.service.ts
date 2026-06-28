import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HrAbsenceStatus, HrAbsenceType, PlanningAssignmentStatus, HrTimeAccountDirection, HrTimeAccountSourceType, PlanningTimeUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { calculatePlanningAssignmentMinutes } from '../../planning/planning-time';
import { AdjustHrTimeAccountDto, HrTimeAccountQueryDto, RecomputeHrTimeAccountsDto } from './hr-time-account.dto';

type Actor = { id: string; role: string };
type Period = { start: Date; end: Date; year: number };
type RecomputeOptions = {
  dryRun: boolean;
  includeAssignments: boolean;
  includeDayStatuses: boolean;
  includeHrAbsences: boolean;
  includeAttendance: boolean;
};
type CounterDefinition = { code: string; accountType: string; label: string; unit: PlanningTimeUnit; direction: HrTimeAccountDirection; quantity: number };
type CounterCandidate = CounterDefinition & {
  employeeId: string;
  date: Date;
  sourceType: HrTimeAccountSourceType;
  sourceId: string;
  idempotencyKey: string;
  comment?: string | null;
  metadata?: Prisma.InputJsonValue;
};
type RecomputeWarning = { type: string; employeeId?: string; date?: string; code?: string; accountType?: string; balance?: number; message?: string };

const WRITE_ROLES = ['SUPER_ADMIN', 'Administrateur', 'ADMIN', 'Manager', 'MANAGER', 'Chef', 'Responsable'];

const ABSENCE_ACCOUNT_MAP: Record<string, Omit<CounterDefinition, 'quantity'>> = {
  [HrAbsenceType.CONGE]: { code: 'paid_leave', accountType: 'leave', label: 'Congés annuels', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.DEBIT },
  [HrAbsenceType.RTT]: { code: 'rtt', accountType: 'rtt', label: 'RTT', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.DEBIT },
  [HrAbsenceType.MALADIE]: { code: 'sick_leave', accountType: 'absence', label: 'Maladie', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.CREDIT },
  [HrAbsenceType.FORMATION]: { code: 'training', accountType: 'training', label: 'Formation', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.CREDIT },
  [HrAbsenceType.EXCEPTIONNELLE]: { code: 'exceptional_leave', accountType: 'leave', label: 'Congés exceptionnels', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.DEBIT },
  [HrAbsenceType.REPOS]: { code: 'rest', accountType: 'rest', label: 'Repos', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.CREDIT },
  [HrAbsenceType.ACCIDENT]: { code: 'work_accident', accountType: 'absence', label: 'Accident', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.CREDIT },
  [HrAbsenceType.AUTRE]: { code: 'other_absence', accountType: 'absence', label: 'Absence autre', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.CREDIT },
};

const LEGACY_STATUS_ALIASES: Record<string, string> = {
  vacation: 'paid_leave',
  leave: 'paid_leave',
  sick: 'sick_leave',
  recovery: 'recovery',
  vv: 'green_hours',
};

const GREEN_HOUR_CODES = new Set(['green_hours', 'heure_verte', 'heures_vertes']);

@Injectable()
export class HrTimeAccountService {
  constructor(private readonly prisma: PrismaService) {}

  // HrTimeAccount is a balance ledger fed by assignments, absences, attendance or manual adjustments.
  // It must never be treated as a legal source; legal origin lives on LegalRightRuleVersion/configuration metadata.
  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('RH write access is restricted to managers and administrators');
  }

  async list(organizationId: string, q: HrTimeAccountQueryDto = {}) {
    const periodYear = q.periodYear ?? q.year ?? new Date().getFullYear();
    const accounts = await this.prisma.hrTimeAccount.findMany({
      where: { organizationId, employeeId: q.employeeId, periodYear, accountType: q.accountType, code: q.code },
      include: { employee: { include: { department: true, position: true } } },
      orderBy: [{ employee: { lastName: 'asc' } }, { code: 'asc' }],
      take: Math.min(q.pageSize ?? 200, 500),
    });
    return {
      period: this.yearPeriod(periodYear),
      employees: this.summarizeByEmployee(accounts, this.yearPeriod(periodYear)),
      accountCount: accounts.length,
      alerts: this.counterAlerts(accounts),
    };
  }

  async employee(organizationId: string, employeeId: string, q: HrTimeAccountQueryDto = {}) {
    await this.ensureEmployee(organizationId, employeeId);
    const periodYear = q.periodYear ?? q.year ?? new Date().getFullYear();
    const accounts = await this.prisma.hrTimeAccount.findMany({
      where: { organizationId, employeeId, periodYear, accountType: q.accountType, code: q.code },
      include: { transactions: { where: { quantity: { not: 0 } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], take: 100 } },
      orderBy: { code: 'asc' },
    });
    const summary = this.summarizeByEmployee(accounts, this.yearPeriod(periodYear), employeeId)[0] ?? {
      employeeId,
      employeeName: 'Collaborateur RH',
      period: this.yearPeriod(periodYear),
      accounts: [],
      totals: this.emptyTotals(),
      alerts: [],
    };
    return { ...summary, periodYear, recentTransactions: accounts.flatMap(account => account.transactions ?? []).slice(0, 100) };
  }

  async recompute(organizationId: string, actor: Actor, dto: RecomputeHrTimeAccountsDto) {
    this.assertWrite(actor);
    const period = this.period(dto);
    const options = this.recomputeOptions(dto);
    const warnings: RecomputeWarning[] = [];
    if (options.includeAttendance) warnings.push({ type: 'ATTENDANCE_COUNTER_SOURCE_PENDING', message: 'Émargement persistant préparé: aucune transaction compteur attendance générée dans cette passe.' });
    if (dto.employeeId) await this.ensureEmployee(organizationId, dto.employeeId);
    const scopedEmployeeIds = await this.employeeScope(organizationId, dto);

    const [assignments, dayStatuses, absences, dictionary] = await Promise.all([
      options.includeAssignments ? this.listAssignmentsForRecompute(organizationId, period, dto, scopedEmployeeIds) : Promise.resolve([]),
      options.includeDayStatuses ? this.listDayStatusesForRecompute(organizationId, period, dto, scopedEmployeeIds) : Promise.resolve([]),
      options.includeHrAbsences ? this.listAbsencesForRecompute(organizationId, period, dto, scopedEmployeeIds) : Promise.resolve([]),
      options.includeDayStatuses ? this.prisma.planningCodeDictionary.findMany({ where: { organizationId }, take: 1000 }) : Promise.resolve([]),
    ]);

    const dictionaryMap = this.dictionaryMap(dictionary);
    const candidates: CounterCandidate[] = [];
    const candidateKeys = new Set<string>();
    const absenceDayKeys = this.absenceDayKeys(absences, period);
    const statusDayGroups = this.dayStatusGroups(dayStatuses);
    const blockingStatusDayKeys = this.blockingDayStatusKeys(dayStatuses, dictionaryMap);
    const addCandidate = (candidate: CounterCandidate | null) => {
      if (!candidate) return;
      if (candidateKeys.has(candidate.idempotencyKey)) {
        warnings.push({ type: 'DUPLICATE_COUNTER_SOURCE_IGNORED', employeeId: candidate.employeeId, date: this.iso(candidate.date), code: candidate.code });
        return;
      }
      candidateKeys.add(candidate.idempotencyKey);
      candidates.push(candidate);
    };
    let legacyDayStatusesProcessed = 0;

    for (const absence of absences) {
      const mapped = ABSENCE_ACCOUNT_MAP[String(absence.type)] ?? ABSENCE_ACCOUNT_MAP[HrAbsenceType.AUTRE];
      const quantity = this.absenceDays(absence.startDate, absence.endDate, period);
      if (quantity <= 0) continue;
      addCandidate({
        ...mapped,
        quantity,
        employeeId: absence.employeeId,
        date: this.day(absence.startDate < period.start ? period.start : absence.startDate),
        sourceType: HrTimeAccountSourceType.HR_ABSENCE,
        sourceId: absence.id,
        idempotencyKey: `hr_absence:${absence.id}:${mapped.code}`,
        comment: dto.note ?? null,
        metadata: { absenceType: absence.type, startDate: this.iso(absence.startDate), endDate: this.iso(absence.endDate), priority: 1 } as Prisma.InputJsonValue,
      });
    }

    for (const dayStatus of dayStatuses) {
      addCandidate(this.dayStatusCandidate(dictionaryMap, {
        employeeId: dayStatus.employeeId,
        date: dayStatus.date,
        statusCode: dayStatus.statusCode,
        label: dayStatus.label,
        sourceId: dayStatus.id,
        idempotencyKey: `day_status:${dayStatus.dedupeKey ?? dayStatus.id}`,
        metadata: { ...this.contentObject(dayStatus.metadata), priority: 2 },
      }, warnings));
    }

    for (const assignment of assignments) {
      const calculation = calculatePlanningAssignmentMinutes(assignment);
      calculation.warnings.forEach(warning => warnings.push({ type: `ASSIGNMENT_${warning}`, employeeId: assignment.employeeId, date: this.iso(assignment.date), message: `Affectation ${assignment.id}` }));
      const dayKey = this.employeeDateKey(assignment.employeeId, assignment.date);
      const blockedByAbsence = absenceDayKeys.has(dayKey);
      const blockedByStatus = blockingStatusDayKeys.has(dayKey);
      if (calculation.plannedMinutes > 0 && !blockedByAbsence && !blockedByStatus) {
        if (statusDayGroups.has(dayKey)) warnings.push({ type: 'PARTIAL_DAY_STATUS_WITH_ASSIGNMENT', employeeId: assignment.employeeId, date: this.iso(assignment.date), message: 'Un statut de jour non bloquant coexiste avec une affectation planifiée.' });
        addCandidate({
          employeeId: assignment.employeeId,
          date: assignment.date,
          quantity: calculation.plannedMinutes,
          unit: PlanningTimeUnit.MINUTES,
          direction: HrTimeAccountDirection.CREDIT,
          sourceType: HrTimeAccountSourceType.ASSIGNMENT,
          sourceId: assignment.id,
          idempotencyKey: `assignment:${assignment.id}:planned_minutes`,
          code: 'planned_time',
          accountType: 'time',
          label: 'Temps planifié',
          comment: dto.note ?? null,
          metadata: { startTime: assignment.startTime, endTime: assignment.endTime, breakMinutes: calculation.breakMinutes, grossMinutes: calculation.grossMinutes, crossesMidnight: calculation.crossesMidnight, priority: 4 } as Prisma.InputJsonValue,
        });
      } else if (calculation.plannedMinutes > 0 && blockedByAbsence) {
        warnings.push({ type: 'ASSIGNMENT_SUPPRESSED_BY_HR_ABSENCE', employeeId: assignment.employeeId, date: this.iso(assignment.date), message: `Affectation ${assignment.id}` });
      } else if (calculation.plannedMinutes > 0 && blockedByStatus) {
        warnings.push({ type: 'ASSIGNMENT_SUPPRESSED_BY_DAY_STATUS', employeeId: assignment.employeeId, date: this.iso(assignment.date), message: `Affectation ${assignment.id}` });
      }
      const legacyStatus = this.assignmentBusinessStatus(assignment.comment);
      if (!options.includeDayStatuses || !legacyStatus || legacyStatus === 'work') continue;
      if (blockedByAbsence) {
        warnings.push({ type: 'LEGACY_STATUS_IGNORED_BY_HR_ABSENCE', employeeId: assignment.employeeId, date: this.iso(assignment.date), code: legacyStatus });
        continue;
      }
      if (statusDayGroups.has(dayKey)) {
        warnings.push({ type: 'LEGACY_STATUS_IGNORED_BY_DAY_STATUS', employeeId: assignment.employeeId, date: this.iso(assignment.date), code: legacyStatus });
        continue;
      }
      {
        legacyDayStatusesProcessed += 1;
        addCandidate(this.dayStatusCandidate(dictionaryMap, {
          employeeId: assignment.employeeId,
          date: assignment.date,
          statusCode: legacyStatus,
          label: legacyStatus,
          sourceId: assignment.id,
          idempotencyKey: `assignment:${assignment.id}:business_status:${legacyStatus}`,
          metadata: { source: 'planning_assignments.comment', priority: 3 },
        }, warnings));
      }
    }

    const existing = await this.existingAutomaticTransactions(organizationId, period, options, dto, scopedEmployeeIds);
    const existingByKey = new Map(existing.map(tx => [String(tx.idempotencyKey), tx]));
    const expectedKeys = new Set(candidates.map(candidate => candidate.idempotencyKey));
    const accountKeysTouched = new Set<string>();
    const employeeIdsProcessed = new Set<string>();
    let transactionsCreated = 0;
    let transactionsUpdated = 0;
    let transactionsSkipped = 0;
    let transactionsNeutralized = 0;

    for (const candidate of candidates) {
      employeeIdsProcessed.add(candidate.employeeId);
      accountKeysTouched.add(this.accountKey(candidate.employeeId, period.year, candidate.code));
      const previous = existingByKey.get(candidate.idempotencyKey);
      const change = this.transactionChange(previous, candidate);
      if (change === 'skip') {
        transactionsSkipped += 1;
        continue;
      }
      if (change === 'create') transactionsCreated += 1;
      if (change === 'update') transactionsUpdated += 1;
      if (options.dryRun) continue;
      const account = await this.ensureAccount(organizationId, candidate.employeeId, period.year, candidate);
      await this.upsertTransaction({ ...candidate, organizationId, accountId: account.id, createdById: actor.id });
    }

    for (const stale of existing.filter(tx => tx.idempotencyKey && !expectedKeys.has(String(tx.idempotencyKey)) && tx.quantity !== 0)) {
      if (!options.dryRun) {
        await this.prisma.hrTimeAccountTransaction.update({
          where: { id: stale.id, organizationId },
          data: { quantity: 0, comment: dto.note ?? stale.comment, metadata: { ...this.contentObject(stale.metadata), staleAfterRecompute: true, staleAt: new Date().toISOString() } as Prisma.InputJsonValue },
        });
      }
      transactionsNeutralized += 1;
      employeeIdsProcessed.add(stale.employeeId);
      if (stale.account) accountKeysTouched.add(this.accountKey(stale.employeeId, period.year, stale.account.code));
    }

    const manualTransactionsPreserved = await this.countManualTransactions(organizationId, period, dto, scopedEmployeeIds);
    let accountsTouched = accountKeysTouched.size;
    if (!options.dryRun) {
      const touchedIds = await this.rebuildBalances(organizationId, period.year, dto.employeeId, [...employeeIdsProcessed]);
      accountsTouched = touchedIds.length || accountsTouched;
      const negativeAccounts = await this.prisma.hrTimeAccount.findMany({
        where: { organizationId, periodYear: period.year, employeeId: dto.employeeId ?? (employeeIdsProcessed.size ? { in: [...employeeIdsProcessed] } : undefined), closingBalance: { lt: 0 } },
        select: { employeeId: true, accountType: true, closingBalance: true },
        take: 100,
      });
      negativeAccounts.forEach(account => warnings.push({ type: 'NEGATIVE_BALANCE', employeeId: account.employeeId, accountType: account.accountType, balance: account.closingBalance }));
    }

    return {
      period: { startDate: this.iso(period.start), endDate: this.iso(period.end), year: period.year },
      employeesProcessed: employeeIdsProcessed.size,
      accountsTouched,
      transactionsCreated,
      transactionsUpdated,
      transactionsSkipped,
      transactionsNeutralized,
      manualTransactionsPreserved,
      warnings,
      dryRun: options.dryRun,
      idempotent: true,
      sources: {
        assignmentsProcessed: assignments.length,
        dayStatusesProcessed: dayStatuses.length,
        legacyDayStatusesProcessed,
        hrAbsencesProcessed: absences.length,
        attendanceProcessed: 0,
      },
    };
  }

  async adjust(organizationId: string, actor: Actor, dto: AdjustHrTimeAccountDto) {
    this.assertWrite(actor);
    await this.ensureEmployee(organizationId, dto.employeeId);
    const metadata = this.contentObject(dto.metadata);
    if (this.isGreenHourCode(dto.code) || this.isGreenHourCode(dto.accountType ?? '')) {
      this.assertGreenHourOrigin(metadata, dto.comment);
    }
    const account = await this.ensureAccount(organizationId, dto.employeeId, dto.periodYear, {
      code: this.normalizeCode(dto.code),
      accountType: this.normalizeCode(dto.accountType ?? dto.code),
      label: dto.label,
      unit: dto.unit,
    });
    const transaction = await this.prisma.hrTimeAccountTransaction.create({
      data: {
        organizationId,
        accountId: account.id,
        employeeId: dto.employeeId,
        date: dto.date ? this.day(this.parseDate(dto.date)) : new Date(),
        quantity: dto.quantity,
        unit: dto.unit,
        direction: dto.direction,
        sourceType: HrTimeAccountSourceType.MANUAL_ADJUSTMENT,
        idempotencyKey: `manual:${actor.id}:${Date.now()}`,
        label: dto.label,
        comment: dto.comment ?? null,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        createdById: actor.id,
      },
    });
    await this.rebuildBalances(organizationId, dto.periodYear, dto.employeeId);
    return transaction;
  }

  async contextSummary(organizationId: string, q: HrTimeAccountQueryDto = {}) {
    const periodYear = q.periodYear ?? q.year ?? new Date().getFullYear();
    const period = this.yearPeriod(periodYear);
    const [accounts, negatives, txCount, neutralizedTxCount] = await Promise.all([
      this.prisma.hrTimeAccount.findMany({ where: { organizationId, employeeId: q.employeeId, periodYear }, include: { employee: { select: { id: true, firstName: true, lastName: true } } }, take: 1000 }),
      this.prisma.hrTimeAccount.count({ where: { organizationId, employeeId: q.employeeId, periodYear, closingBalance: { lt: 0 } } }),
      this.prisma.hrTimeAccountTransaction.count({ where: { organizationId, employeeId: q.employeeId, date: { gte: new Date(periodYear, 0, 1), lte: new Date(periodYear, 11, 31, 23, 59, 59, 999) }, quantity: { not: 0 } } }),
      this.prisma.hrTimeAccountTransaction.count({ where: { organizationId, employeeId: q.employeeId, date: { gte: new Date(periodYear, 0, 1), lte: new Date(periodYear, 11, 31, 23, 59, 59, 999) }, quantity: 0, sourceType: { not: HrTimeAccountSourceType.MANUAL_ADJUSTMENT } } }),
    ]);
    const byCode = new Map<string, { code: string; accountType: string; label: string; unit: PlanningTimeUnit; total: number }>();
    for (const account of accounts) {
      const current = byCode.get(account.code) ?? { code: account.code, accountType: account.accountType, label: account.label, unit: account.unit, total: 0 };
      current.total += account.closingBalance;
      byCode.set(account.code, current);
    }
    const employees = this.summarizeByEmployee(accounts, period);
    return {
      enabled: accounts.length > 0,
      periodYear,
      period,
      accountCount: accounts.length,
      transactionCount: txCount,
      neutralizedTransactionCount: neutralizedTxCount,
      negativeBalanceCount: negatives,
      totals: [...byCode.values()],
      employeePreview: employees.slice(0, 6),
      hiddenEmployeeCount: Math.max(0, employees.length - 6),
      alerts: this.counterAlerts(accounts),
      storage: 'hr_time_accounts/hr_time_account_transactions',
    };
  }

  private recomputeOptions(dto: RecomputeHrTimeAccountsDto): RecomputeOptions {
    return {
      dryRun: !!dto.dryRun,
      includeAssignments: dto.includeAssignments !== false,
      includeDayStatuses: dto.includeDayStatuses !== false,
      includeHrAbsences: dto.includeHrAbsences !== false,
      includeAttendance: !!dto.includeAttendance,
    };
  }

  private async listAssignmentsForRecompute(organizationId: string, period: Period, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    return this.prisma.planningAssignment.findMany({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        siteId: dto.siteId,
        date: { gte: period.start, lte: period.end },
        status: { not: PlanningAssignmentStatus.CANCELLED },
      },
      select: { id: true, employeeId: true, siteId: true, date: true, startTime: true, endTime: true, breakMinutes: true, status: true, comment: true },
      take: 10000,
    });
  }

  private async listDayStatusesForRecompute(organizationId: string, period: Period, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    return this.prisma.planningDayStatus.findMany({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        date: { gte: period.start, lte: period.end },
        affectsCounters: true,
      },
      select: { id: true, employeeId: true, date: true, statusCode: true, label: true, sourceType: true, sourceId: true, dedupeKey: true, metadata: true },
      take: 5000,
    });
  }

  private async listAbsencesForRecompute(organizationId: string, period: Period, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    return this.prisma.hrAbsence.findMany({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        status: HrAbsenceStatus.APPROVED,
        startDate: { lte: period.end },
        endDate: { gte: period.start },
      },
      select: { id: true, employeeId: true, type: true, startDate: true, endDate: true },
      take: 5000,
    });
  }

  private async employeeScope(organizationId: string, dto: RecomputeHrTimeAccountsDto) {
    if (!dto.siteId) return null;
    const site = await this.prisma.site.findFirst({ where: { id: dto.siteId, organizationId, isArchived: false }, select: { id: true } });
    if (!site) throw new NotFoundException('Site introuvable');
    if (dto.employeeId) return [dto.employeeId];
    const [siteEmployees, assignedEmployees] = await Promise.all([
      this.prisma.hrEmployee.findMany({ where: { organizationId, mainSiteId: dto.siteId, isArchived: false }, select: { id: true }, take: 5000 }),
      this.prisma.planningAssignment.findMany({ where: { organizationId, siteId: dto.siteId }, select: { employeeId: true }, distinct: ['employeeId'], take: 5000 }),
    ]);
    return [...new Set([...siteEmployees.map(employee => employee.id), ...assignedEmployees.map(assignment => assignment.employeeId)])];
  }

  private dictionaryMap(dictionary: Array<{ normalizedCode: string; defaultStatusCode: string | null; label: string; category?: string | null; accountType: string | null; unit: PlanningTimeUnit | null; defaultQuantity: number | null; affectsLeaveBalance: boolean }>) {
    const map = new Map<string, typeof dictionary[number]>();
    for (const entry of dictionary) {
      map.set(entry.normalizedCode, entry);
      if (entry.defaultStatusCode) map.set(entry.defaultStatusCode, entry);
    }
    return map;
  }

  private absenceDayKeys(absences: Array<{ employeeId: string; startDate: Date; endDate: Date }>, period: Period) {
    const keys = new Set<string>();
    for (const absence of absences) {
      let current = this.day(absence.startDate < period.start ? period.start : absence.startDate);
      const end = this.day(absence.endDate > period.end ? period.end : absence.endDate);
      while (current <= end) {
        keys.add(this.employeeDateKey(absence.employeeId, current));
        current = this.addDays(current, 1);
      }
    }
    return keys;
  }

  private dayStatusGroups(statuses: Array<{ employeeId: string; date: Date }>) {
    const groups = new Map<string, number>();
    statuses.forEach(status => {
      const key = this.employeeDateKey(status.employeeId, status.date);
      groups.set(key, (groups.get(key) ?? 0) + 1);
    });
    return groups;
  }

  private blockingDayStatusKeys(statuses: Array<{ employeeId: string; date: Date; statusCode: string; metadata?: unknown }>, dictionary: Map<string, any>) {
    const keys = new Set<string>();
    statuses.forEach(status => {
      if (this.dayStatusBlocksPlannedTime(status, dictionary)) keys.add(this.employeeDateKey(status.employeeId, status.date));
    });
    return keys;
  }

  private dayStatusBlocksPlannedTime(status: { statusCode: string; metadata?: unknown }, dictionary: Map<string, any>) {
    const metadata = this.contentObject(status.metadata);
    if (metadata.blocksPlannedTime === false || metadata.partialDay === true) return false;
    if (metadata.blocksPlannedTime === true || metadata.fullDay === true) return true;
    const statusCode = this.normalizeCode(status.statusCode);
    const mappedCode = LEGACY_STATUS_ALIASES[statusCode] ?? statusCode;
    const dictionaryEntry = dictionary.get(mappedCode) ?? dictionary.get(statusCode);
    const unit = this.validUnit(metadata.unit) ?? dictionaryEntry?.unit;
    const accountType = this.normalizeCode(String(metadata.accountType ?? dictionaryEntry?.accountType ?? dictionaryEntry?.category ?? mappedCode));
    const blockingCodes = new Set(['absence', 'exceptional_leave', 'leave', 'other_absence', 'paid_leave', 'rest', 'rtt', 'sick_leave', 'strike', 'vacation', 'work_accident']);
    return unit === PlanningTimeUnit.DAYS && (blockingCodes.has(accountType) || blockingCodes.has(mappedCode));
  }

  private dayStatusCandidate(dictionary: Map<string, any>, input: { employeeId: string; date: Date; statusCode: string; label: string; sourceId: string; idempotencyKey: string; metadata?: unknown }, warnings: RecomputeWarning[]): CounterCandidate | null {
    const metadata = this.contentObject(input.metadata);
    const statusCode = this.normalizeCode(input.statusCode);
    const mappedCode = LEGACY_STATUS_ALIASES[statusCode] ?? statusCode;
    const dictionaryEntry = dictionary.get(mappedCode) ?? dictionary.get(statusCode);
    const accountType = this.normalizeCode(String(metadata.accountType ?? dictionaryEntry?.accountType ?? dictionaryEntry?.defaultStatusCode ?? mappedCode));
    const unit = this.validUnit(metadata.unit) ?? dictionaryEntry?.unit;
    const quantity = Number(metadata.quantity ?? metadata.defaultQuantity ?? dictionaryEntry?.defaultQuantity ?? 0);
    if (!dictionaryEntry && (!metadata.accountType || !unit || !quantity)) {
      warnings.push({ type: 'UNKNOWN_CODE', employeeId: input.employeeId, date: this.iso(input.date), code: statusCode });
      return null;
    }
    if (!unit || !Number.isFinite(quantity) || quantity <= 0) {
      warnings.push({ type: 'MISSING_QUANTITY', employeeId: input.employeeId, date: this.iso(input.date), code: statusCode });
      return null;
    }
    if (this.isGreenHourCode(accountType) && !this.hasGreenHourOrigin(metadata)) {
      warnings.push({ type: 'GREEN_HOUR_ORIGIN_REQUIRED', employeeId: input.employeeId, date: this.iso(input.date), code: statusCode, message: 'HEURE_VERTE doit être rattachée à une récupération, RTT, repos compensateur, jour férié compensé, annualisation ou accord local.' });
      return null;
    }
    return {
      employeeId: input.employeeId,
      date: input.date,
      quantity: Math.round(quantity),
      unit,
      direction: dictionaryEntry?.affectsLeaveBalance === true || metadata.direction === HrTimeAccountDirection.DEBIT ? HrTimeAccountDirection.DEBIT : HrTimeAccountDirection.CREDIT,
      sourceType: HrTimeAccountSourceType.DAY_STATUS,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      code: accountType,
      accountType,
      label: dictionaryEntry?.label ?? input.label,
      metadata: { ...metadata, statusCode, dictionaryCode: dictionaryEntry?.normalizedCode ?? null } as Prisma.InputJsonValue,
    };
  }

  private async existingAutomaticTransactions(organizationId: string, period: Period, options: RecomputeOptions, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    const sourceTypes = [
      ...(options.includeAssignments ? [HrTimeAccountSourceType.ASSIGNMENT] : []),
      ...(options.includeDayStatuses ? [HrTimeAccountSourceType.DAY_STATUS] : []),
      ...(options.includeHrAbsences ? [HrTimeAccountSourceType.HR_ABSENCE] : []),
      ...(options.includeAttendance ? [HrTimeAccountSourceType.ATTENDANCE] : []),
    ];
    if (!sourceTypes.length) return [];
    return this.prisma.hrTimeAccountTransaction.findMany({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        date: { gte: period.start, lte: period.end },
        sourceType: { in: sourceTypes },
        idempotencyKey: { not: null },
      },
      include: { account: { select: { code: true, periodYear: true } } },
      take: 20000,
    });
  }

  private countManualTransactions(organizationId: string, period: Period, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    return this.prisma.hrTimeAccountTransaction.count({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        date: { gte: period.start, lte: period.end },
        sourceType: HrTimeAccountSourceType.MANUAL_ADJUSTMENT,
      },
    });
  }

  private transactionChange(existing: any, candidate: CounterCandidate) {
    if (!existing) return 'create';
    const same = existing.quantity === candidate.quantity &&
      existing.unit === candidate.unit &&
      existing.direction === candidate.direction &&
      existing.sourceType === candidate.sourceType &&
      existing.sourceId === candidate.sourceId &&
      this.normalizeCode(String(existing.account?.code ?? '')) === this.normalizeCode(candidate.code) &&
      existing.label === candidate.label;
    return same ? 'skip' : 'update';
  }

  private async ensureAccount(organizationId: string, employeeId: string, periodYear: number, input: { code: string; accountType: string; label: string; unit: PlanningTimeUnit }) {
    const code = this.normalizeCode(input.code);
    return this.prisma.hrTimeAccount.upsert({
      where: { organizationId_employeeId_periodYear_code: { organizationId, employeeId, periodYear, code } },
      create: {
        organizationId,
        employeeId,
        periodYear,
        code,
        accountType: this.normalizeCode(input.accountType),
        label: input.label,
        unit: input.unit,
        visibleToEmployee: false,
        visibleToManager: true,
        visibleToAdmin: true,
      },
      update: { label: input.label, accountType: this.normalizeCode(input.accountType), unit: input.unit },
    });
  }

  private async upsertTransaction(input: CounterCandidate & { organizationId: string; accountId: string; createdById: string }) {
    if (this.isGreenHourCode(input.code) || this.isGreenHourCode(input.accountType)) {
      this.assertGreenHourOrigin(this.contentObject(input.metadata), input.comment);
    }
    return this.prisma.hrTimeAccountTransaction.upsert({
      where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
      create: {
        organizationId: input.organizationId,
        accountId: input.accountId,
        employeeId: input.employeeId,
        date: input.date,
        quantity: input.quantity,
        unit: input.unit,
        direction: input.direction,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        label: input.label,
        comment: input.comment ?? null,
        metadata: input.metadata ?? {},
        createdById: input.createdById,
      },
      update: {
        accountId: input.accountId,
        employeeId: input.employeeId,
        date: input.date,
        quantity: input.quantity,
        unit: input.unit,
        direction: input.direction,
        sourceId: input.sourceId,
        label: input.label,
        comment: input.comment ?? null,
        metadata: input.metadata ?? {},
      },
    });
  }

  private async rebuildBalances(organizationId: string, periodYear: number, employeeId?: string, employeeIds?: string[]) {
    const accounts = await this.prisma.hrTimeAccount.findMany({ where: { organizationId, periodYear, employeeId: employeeId ?? (employeeIds?.length ? { in: employeeIds } : undefined) }, include: { transactions: true } });
    for (const account of accounts) {
      let accrued = 0;
      let consumed = 0;
      let adjusted = 0;
      for (const tx of account.transactions) {
        if (tx.sourceType === HrTimeAccountSourceType.MANUAL_ADJUSTMENT) {
          adjusted += tx.direction === HrTimeAccountDirection.CREDIT ? tx.quantity : -tx.quantity;
        } else if (tx.direction === HrTimeAccountDirection.CREDIT) {
          accrued += tx.quantity;
        } else {
          consumed += tx.quantity;
        }
      }
      await this.prisma.hrTimeAccount.update({
        where: { id: account.id, organizationId },
        data: {
          accrued,
          consumed,
          adjusted,
          closingBalance: account.openingBalance + accrued + adjusted - consumed,
        },
      });
    }
    return accounts.map(account => account.id);
  }

  private summarizeByEmployee(accounts: Array<any>, period: { startDate: string; endDate: string }, fallbackEmployeeId?: string) {
    const groups = new Map<string, any[]>();
    accounts.forEach(account => {
      const employeeId = account.employeeId ?? fallbackEmployeeId;
      if (!employeeId) return;
      groups.set(employeeId, [...(groups.get(employeeId) ?? []), account]);
    });
    return [...groups.entries()].map(([employeeId, items]) => {
      const totals = this.emptyTotals();
      for (const account of items) {
        const code = this.normalizeCode(String(account.code));
        const accountType = this.normalizeCode(String(account.accountType));
        const balance = Number(account.closingBalance ?? 0) || 0;
        if (code === 'planned_time' || accountType === 'time') totals.plannedMinutes += balance;
        if (code === 'validated_time') totals.validatedMinutes += balance;
        if (account.unit === PlanningTimeUnit.DAYS && ['absence', 'sick_leave', 'work_accident', 'other_absence'].includes(accountType)) totals.absenceDays += Math.abs(balance);
        if (account.unit === PlanningTimeUnit.DAYS && ['leave', 'paid_leave', 'rtt'].includes(accountType)) totals.leaveDays += balance;
        if (code === 'recovery' || accountType === 'recovery') totals.recoveryMinutes += balance;
        if (code === 'overtime' || accountType === 'overtime') totals.overtimeMinutes += balance;
      }
      const employee = items[0]?.employee;
      return {
        employeeId,
        employeeName: this.employeeName(employee),
        period,
        accounts: items.map(account => ({
          accountId: account.id,
          accountType: account.accountType,
          code: account.code,
          label: account.label,
          unit: account.unit,
          openingBalance: account.openingBalance,
          accrued: account.accrued,
          consumed: account.consumed,
          adjusted: account.adjusted,
          closingBalance: account.closingBalance,
          visibleToEmployee: !!account.visibleToEmployee,
          visibleToManager: account.visibleToManager !== false,
          visibleToAdmin: account.visibleToAdmin !== false,
        })),
        totals,
        alerts: this.counterAlerts(items),
      };
    });
  }

  private emptyTotals() {
    return { plannedMinutes: 0, validatedMinutes: 0, absenceDays: 0, leaveDays: 0, recoveryMinutes: 0, overtimeMinutes: 0 };
  }

  private counterAlerts(accounts: Array<any>) {
    return accounts
      .filter(account => Number(account.closingBalance ?? 0) < 0)
      .map(account => ({ type: 'NEGATIVE_BALANCE', employeeId: account.employeeId, accountType: account.accountType, code: account.code, balance: account.closingBalance }));
  }

  private employeeName(employee?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
    const name = `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim();
    return name || employee?.email || 'Collaborateur RH';
  }

  private yearPeriod(year: number) {
    return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }

  private async ensureEmployee(organizationId: string, employeeId: string) {
    const employee = await this.prisma.hrEmployee.findFirst({ where: { id: employeeId, organizationId, isArchived: false }, select: { id: true } });
    if (!employee) throw new NotFoundException('Collaborateur RH introuvable');
  }

  private absenceDays(startDate: Date, endDate: Date, period: Period) {
    const start = this.day(startDate < period.start ? period.start : startDate);
    const end = this.day(endDate > period.end ? period.end : endDate);
    return Math.max(0, Math.floor((+end - +start) / 86400000) + 1);
  }

  private period(dto: RecomputeHrTimeAccountsDto): Period {
    const start = this.day(this.parseDate(dto.startDate));
    const end = this.endDay(this.parseDate(dto.endDate));
    if (end < start) throw new BadRequestException('La date de fin doit être postérieure à la date de début');
    return { start, end, year: start.getFullYear() };
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

  private addDays(d: Date, days: number) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  private iso(value: Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private sameDay(a: Date, b: Date) {
    return this.iso(a) === this.iso(b);
  }

  private employeeDateKey(employeeId: string, date: Date) {
    return `${employeeId}:${this.iso(date)}`;
  }

  private accountKey(employeeId: string, periodYear: number, code: string) {
    return `${employeeId}:${periodYear}:${this.normalizeCode(code)}`;
  }

  private assignmentBusinessStatus(comment?: string | null) {
    if (!comment) return 'work';
    try {
      const parsed = JSON.parse(comment);
      return this.normalizeCode(String((parsed?.planningAssignmentMeta ?? parsed ?? {}).businessStatus ?? 'work'));
    } catch {
      return 'work';
    }
  }

  private contentObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private validUnit(value: unknown) {
    return value === PlanningTimeUnit.MINUTES || value === PlanningTimeUnit.DAYS ? value : null;
  }

  private isGreenHourCode(value: string) {
    return GREEN_HOUR_CODES.has(this.normalizeCode(String(value ?? '')));
  }

  private hasGreenHourOrigin(metadata: Record<string, any>, comment?: string | null) {
    const reason = metadata.reason ?? metadata.reasonCode ?? comment;
    const source = metadata.sourceRuleId ??
      metadata.source_rule_id ??
      metadata.sourceEventId ??
      metadata.source_event_id ??
      metadata.sourceLegalOrigin ??
      metadata.originLegalCode ??
      metadata.origin;
    return !!reason && !!source;
  }

  private assertGreenHourOrigin(metadata: Record<string, any>, comment?: string | null) {
    if (!this.hasGreenHourOrigin(metadata, comment)) {
      throw new BadRequestException('HEURE_VERTE doit avoir une raison et une origine source_rule_id/source_event_id ou origine juridique structurée.');
    }
  }

  private normalizeCode(value: string) {
    return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'custom';
  }
}
