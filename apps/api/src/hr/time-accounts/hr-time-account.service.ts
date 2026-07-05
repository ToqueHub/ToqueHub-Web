import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HrAbsenceStatus, HrAbsenceType, HrTimeAccountDirection, HrTimeAccountSourceType, PlanningTimeUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

const SIMPLE_LEAVE_CODES = ['paid_leave', 'annual_leave'] as const;
const SIMPLE_LEAVE_ACCOUNT_TYPES = ['paid_leave', 'annual_leave', 'leave'] as const;

@Injectable()
export class HrTimeAccountService {
  constructor(private readonly prisma: PrismaService) {}

  // HrTimeAccount is now limited to simple paid or annual leave balances.
  private assertWrite(actor: Actor) {
    if (!WRITE_ROLES.includes(actor.role)) throw new ForbiddenException('RH write access is restricted to managers and administrators');
  }

  async list(organizationId: string, q: HrTimeAccountQueryDto = {}) {
    const periodYear = q.periodYear ?? q.year ?? new Date().getFullYear();
    const accountWhere = this.simpleLeaveAccountWhere(q);
    if (!accountWhere) {
      return {
        period: this.yearPeriod(periodYear),
        employees: [],
        accountCount: 0,
        alerts: [],
      };
    }
    const accounts = await this.prisma.hrTimeAccount.findMany({
      where: { organizationId, employeeId: q.employeeId, periodYear, ...accountWhere },
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
    const accountWhere = this.simpleLeaveAccountWhere(q);
    if (!accountWhere) {
      const period = this.yearPeriod(periodYear);
      return {
        employeeId,
        employeeName: 'Collaborateur RH',
        period,
        accounts: [],
        totals: this.emptyTotals(),
        alerts: [],
        periodYear,
        recentTransactions: [],
      };
    }
    const accounts = await this.prisma.hrTimeAccount.findMany({
      where: { organizationId, employeeId, periodYear, ...accountWhere },
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
    const leaveCounter = await this.leaveCounterDefinition(organizationId);

    const absences = options.includeHrAbsences
      ? await this.listAbsencesForRecompute(organizationId, period, dto, scopedEmployeeIds)
      : [];
    const candidates: CounterCandidate[] = [];
    const candidateKeys = new Set<string>();
    const addCandidate = (candidate: CounterCandidate | null) => {
      if (!candidate) return;
      if (candidateKeys.has(candidate.idempotencyKey)) {
        warnings.push({ type: 'DUPLICATE_COUNTER_SOURCE_IGNORED', employeeId: candidate.employeeId, date: this.iso(candidate.date), code: candidate.code });
        return;
      }
      candidateKeys.add(candidate.idempotencyKey);
      candidates.push(candidate);
    };

    for (const absence of absences) {
      if (absence.type !== HrAbsenceType.CONGE) continue;
      const mapped = leaveCounter;
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
        where: { organizationId, periodYear: period.year, employeeId: dto.employeeId ?? (employeeIdsProcessed.size ? { in: [...employeeIdsProcessed] } : undefined), code: { in: [...SIMPLE_LEAVE_CODES] }, closingBalance: { lt: 0 } },
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
        assignmentsProcessed: 0,
        dayStatusesProcessed: 0,
        legacyDayStatusesProcessed: 0,
        hrAbsencesProcessed: absences.length,
        attendanceProcessed: 0,
      },
    };
  }

  async adjust(organizationId: string, actor: Actor, dto: AdjustHrTimeAccountDto) {
    this.assertWrite(actor);
    await this.ensureEmployee(organizationId, dto.employeeId);
    const code = this.normalizeCode(dto.code);
    const accountType = this.normalizeCode(dto.accountType ?? dto.code);
    if (!this.isSimpleLeaveCode(code) || !this.isSimpleLeaveAccountType(accountType)) {
      throw new BadRequestException('Seuls les congÃ©s payÃ©s et congÃ©s annuels peuvent Ãªtre ajustÃ©s.');
    }
    const account = await this.ensureAccount(organizationId, dto.employeeId, dto.periodYear, {
      code,
      accountType,
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
    const accountWhere = this.simpleLeaveAccountWhere(q);
    if (!accountWhere) {
      return {
        enabled: false,
        periodYear,
        period,
        accountCount: 0,
        transactionCount: 0,
        neutralizedTransactionCount: 0,
        negativeBalanceCount: 0,
        totals: [],
        employeePreview: [],
        hiddenEmployeeCount: 0,
        alerts: [],
        storage: 'hr_time_accounts/hr_time_account_transactions',
      };
    }
    const [accounts, negatives, txCount, neutralizedTxCount] = await Promise.all([
      this.prisma.hrTimeAccount.findMany({ where: { organizationId, employeeId: q.employeeId, periodYear, ...accountWhere }, include: { employee: { select: { id: true, firstName: true, lastName: true } } }, take: 1000 }),
      this.prisma.hrTimeAccount.count({ where: { organizationId, employeeId: q.employeeId, periodYear, ...accountWhere, closingBalance: { lt: 0 } } }),
      this.prisma.hrTimeAccountTransaction.count({ where: { organizationId, employeeId: q.employeeId, date: { gte: new Date(periodYear, 0, 1), lte: new Date(periodYear, 11, 31, 23, 59, 59, 999) }, account: { code: { in: [...SIMPLE_LEAVE_CODES] } }, quantity: { not: 0 } } }),
      this.prisma.hrTimeAccountTransaction.count({ where: { organizationId, employeeId: q.employeeId, date: { gte: new Date(periodYear, 0, 1), lte: new Date(periodYear, 11, 31, 23, 59, 59, 999) }, account: { code: { in: [...SIMPLE_LEAVE_CODES] } }, quantity: 0, sourceType: { not: HrTimeAccountSourceType.MANUAL_ADJUSTMENT } } }),
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
      includeAssignments: false,
      includeDayStatuses: false,
      includeHrAbsences: dto.includeHrAbsences !== false,
      includeAttendance: false,
    };
  }

  private async listAbsencesForRecompute(organizationId: string, period: Period, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    return this.prisma.hrAbsence.findMany({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        type: HrAbsenceType.CONGE,
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

  private async existingAutomaticTransactions(organizationId: string, period: Period, options: RecomputeOptions, dto: RecomputeHrTimeAccountsDto, scopedEmployeeIds: string[] | null) {
    const sourceTypes = [
      ...(options.includeHrAbsences ? [HrTimeAccountSourceType.HR_ABSENCE] : []),
    ];
    if (!sourceTypes.length) return [];
    return this.prisma.hrTimeAccountTransaction.findMany({
      where: {
        organizationId,
        employeeId: dto.employeeId ?? (scopedEmployeeIds ? { in: scopedEmployeeIds } : undefined),
        date: { gte: period.start, lte: period.end },
        sourceType: { in: sourceTypes },
        idempotencyKey: { not: null },
        account: { code: { in: [...SIMPLE_LEAVE_CODES] } },
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
        account: { code: { in: [...SIMPLE_LEAVE_CODES] } },
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
    const accounts = await this.prisma.hrTimeAccount.findMany({ where: { organizationId, periodYear, employeeId: employeeId ?? (employeeIds?.length ? { in: employeeIds } : undefined), code: { in: [...SIMPLE_LEAVE_CODES] } }, include: { transactions: true } });
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
        if (account.unit === PlanningTimeUnit.DAYS && this.isSimpleLeaveCode(code) && this.isSimpleLeaveAccountType(accountType)) totals.leaveDays += balance;
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
    return { leaveDays: 0 };
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

  private simpleLeaveAccountWhere(q: HrTimeAccountQueryDto = {}) {
    const code = q.code ? this.normalizeCode(q.code) : undefined;
    if (code && !this.isSimpleLeaveCode(code)) return null;
    const accountType = q.accountType ? this.normalizeCode(q.accountType) : undefined;
    if (accountType && !this.isSimpleLeaveAccountType(accountType)) return null;
    return {
      code: code ?? { in: [...SIMPLE_LEAVE_CODES] },
      accountType,
    };
  }

  private isSimpleLeaveCode(code: string) {
    return (SIMPLE_LEAVE_CODES as readonly string[]).includes(this.normalizeCode(code));
  }

  private isSimpleLeaveAccountType(accountType: string) {
    return (SIMPLE_LEAVE_ACCOUNT_TYPES as readonly string[]).includes(this.normalizeCode(accountType));
  }

  private async leaveCounterDefinition(organizationId: string): Promise<Omit<CounterDefinition, 'quantity'>> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { hrCountryCode: true, regulatoryCountryCode: true },
    });
    const countryCode = String(organization?.hrCountryCode ?? organization?.regulatoryCountryCode ?? 'FR').toUpperCase();
    if (countryCode === 'FI') {
      return { code: 'annual_leave', accountType: 'annual_leave', label: 'Conges annuels', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.DEBIT };
    }
    return { code: 'paid_leave', accountType: 'paid_leave', label: 'Conges payes', unit: PlanningTimeUnit.DAYS, direction: HrTimeAccountDirection.DEBIT };
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

  private iso(value: Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private accountKey(employeeId: string, periodYear: number, code: string) {
    return `${employeeId}:${periodYear}:${this.normalizeCode(code)}`;
  }

  private contentObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private normalizeCode(value: string) {
    return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'custom';
  }
}
