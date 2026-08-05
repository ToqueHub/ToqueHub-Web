import { Injectable } from '@nestjs/common';
import { FinanceAccountCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deduplicateCrossSourceSales } from './finance-sales-dedupe';
import type { FinanceBootstrapQueryDto } from './dto/finance.dto';

type MetricStatus = 'ready' | 'provisional' | 'unavailable';
type RevenueBasis = 'cash_register' | 'accounting' | 'mixed' | 'unavailable';
type DashboardMetric = {
  id: string;
  label: string;
  value: number | null;
  unit: 'currency' | 'percentage' | 'number';
  budget: number | null;
  variance: number | null;
  variancePercent: number | null;
  previous: number | null;
  favorable: boolean | null;
  status: MetricStatus;
  help: string;
  actualValue?: number | null;
  actualLabel?: string;
  targetLabel?: string;
  displayable: boolean;
  availabilityReason?: string | null;
};

type DashboardPeriodContext = {
  budgetRevenue: number | null;
  budgetActiveDays: number;
  budgetMonths: number;
  observedActiveDays: number;
  observedMonths: number;
  activeDaysPerWeek: number;
  referenceTicket: number | null;
  fixedCostsOverride?: number | null;
  fixedCostAllocationDays?: number;
};

const OPTIONAL_KPIS = [
  {
    id: 'average_ticket',
    label: 'Ticket moyen',
    unit: 'currency',
    help: 'Montant TTC moyen par transaction.',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    unit: 'number',
    help: 'Nombre de tickets enregistrés par la caisse.',
  },
  {
    id: 'contribution_margin',
    label: 'Marge contributive',
    unit: 'currency',
    help: 'CA diminué des achats directement liés aux ventes.',
  },
  {
    id: 'contribution_margin_rate',
    label: 'Taux de marge contributive',
    unit: 'percentage',
    help: 'Part du CA disponible pour couvrir les frais fixes.',
  },
  {
    id: 'cash',
    label: 'Trésorerie disponible',
    unit: 'currency',
    help: 'Solde des comptes de trésorerie comptables.',
  },
  {
    id: 'fixed_costs',
    label: 'Charges fixes',
    unit: 'currency',
    help: 'Personnel et autres charges hors achats de matières.',
  },
  {
    id: 'break_even',
    label: 'Seuil de CA',
    unit: 'currency',
    help: 'CA nécessaire pour couvrir les charges au taux de marge observé.',
  },
  {
    id: 'break_even_day',
    label: 'Transactions seuil / jour',
    unit: 'number',
    help: 'Objectif de transactions calculé depuis le CA budgété et les jours d’activité détectés.',
  },
  {
    id: 'break_even_week',
    label: 'Transactions seuil / semaine',
    unit: 'number',
    help: 'Objectif hebdomadaire calculé depuis le CA budgété et le ticket moyen de référence.',
  },
  {
    id: 'break_even_month',
    label: 'Transactions seuil / mois',
    unit: 'number',
    help: 'Objectif mensuel calculé depuis le CA budgété et le ticket moyen de référence.',
  },
] as const;

const DEFAULT_KPI_IDS = [
  'average_ticket',
  'transactions',
  'cash',
  'fixed_costs',
  'break_even_day',
  'break_even_week',
  'break_even_month',
];

function utcDateKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function activeSaleDates(
  sales: Array<{ saleDate: Date; netAmount: Prisma.Decimal; transactionCount: number }>,
  from: Date,
  to: Date,
) {
  return new Set(
    sales
      .filter(
        ({ saleDate, netAmount, transactionCount }) =>
          saleDate >= from &&
          saleDate <= to &&
          (transactionCount > 0 || Math.abs(numeric(netAmount)) > 0),
      )
      .map(({ saleDate }) => utcDateKey(saleDate)),
  );
}

function activeWeekdayProfile(
  sales: Array<{ saleDate: Date; netAmount: Prisma.Decimal; transactionCount: number }>,
) {
  const weekdays = new Set<number>();
  for (const { saleDate, netAmount, transactionCount } of sales) {
    if (transactionCount > 0 || Math.abs(numeric(netAmount)) > 0) {
      weekdays.add(saleDate.getUTCDay());
    }
  }
  return weekdays;
}

function countProfiledDays(from: Date, to: Date, weekdays: Set<number>) {
  const allowed = weekdays.size ? weekdays : new Set([1, 2, 3, 4, 5, 6]);
  let count = 0;
  for (let cursor = startOfUtcDay(from); cursor <= to; cursor = shiftDays(cursor, 1)) {
    if (allowed.has(cursor.getUTCDay())) count += 1;
  }
  return Math.max(1, count);
}

function countMonths(from: Date, to: Date) {
  return Math.max(
    1,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1,
  );
}

function metricIsDisplayable(id: string, value: number | null) {
  if (value == null || !Number.isFinite(value) || value === 0) return false;
  const absolute = Math.abs(value);
  if (id === 'average_ticket') return value > 0 && value <= 10_000;
  if (id === 'transactions') return value > 0 && value <= 100_000_000;
  if (id === 'contribution_margin_rate') return absolute <= 1_000;
  if (id.startsWith('break_even')) return value > 0 && value <= 100_000_000;
  return absolute <= 1_000_000_000_000;
}

export function computeBudgetTransactionPacing(input: {
  budgetRevenue: number | null;
  referenceTicket: number | null;
  budgetActiveDays: number;
  budgetMonths: number;
  activeDaysPerWeek: number;
  actualTransactions: number;
  observedActiveDays: number;
  observedMonths: number;
}) {
  const targetTransactions =
    input.budgetRevenue != null &&
    input.budgetRevenue > 0 &&
    input.referenceTicket != null &&
    input.referenceTicket > 0
      ? input.budgetRevenue / input.referenceTicket
      : null;
  const targetDay =
    targetTransactions == null ? null : targetTransactions / Math.max(1, input.budgetActiveDays);
  const actualDay =
    input.observedActiveDays > 0 ? input.actualTransactions / input.observedActiveDays : null;
  return {
    targetDay,
    targetWeek: targetDay == null ? null : targetDay * input.activeDaysPerWeek,
    targetMonth:
      targetTransactions == null ? null : targetTransactions / Math.max(1, input.budgetMonths),
    actualDay,
    actualWeek: actualDay == null ? null : actualDay * input.activeDaysPerWeek,
    actualMonth:
      input.actualTransactions > 0
        ? input.actualTransactions / Math.max(1, input.observedMonths)
        : null,
  };
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
  );
}

function startOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function resolveMonthlyActualTo(asOf: Date, now: Date) {
  return startOfMonth(asOf) < startOfMonth(now) ? endOfMonth(asOf) : asOf;
}

function shiftYear(value: Date, offset: number) {
  const targetYear = value.getUTCFullYear() + offset;
  const lastDay = new Date(Date.UTC(targetYear, value.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      value.getUTCMonth(),
      Math.min(value.getUTCDate(), lastDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

function shiftMonth(value: Date, offset: number) {
  const targetMonthStart = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1),
  );
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetMonthStart.getUTCFullYear(),
      targetMonthStart.getUTCMonth(),
      Math.min(value.getUTCDate(), lastDay),
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds(),
    ),
  );
}

function shiftDays(value: Date, offset: number) {
  return new Date(value.getTime() + offset * 86_400_000);
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function numeric(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function sameOrBeforeMonth(left: Date, right: Date) {
  return startOfMonth(left) <= startOfMonth(right);
}

function formatComparisonDate(value: Date) {
  return value.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function selectFinanceRevenue({
  cashRegisterRevenue,
  accountingRevenue,
  hasCashRegisterData,
  hasAccountingData,
  periodEnd,
  accountingLockedThrough,
}: {
  cashRegisterRevenue: number;
  accountingRevenue: number;
  hasCashRegisterData: boolean;
  hasAccountingData: boolean;
  periodEnd: Date;
  accountingLockedThrough: Date | null;
}): { value: number | null; basis: Exclude<RevenueBasis, 'mixed'> } {
  const accountingIsClosed = Boolean(
    accountingLockedThrough && endOfUtcDay(accountingLockedThrough) >= periodEnd,
  );
  if (accountingIsClosed && hasAccountingData) {
    return { value: accountingRevenue, basis: 'accounting' };
  }
  if (hasCashRegisterData) {
    return { value: cashRegisterRevenue, basis: 'cash_register' };
  }
  if (hasAccountingData) {
    return { value: accountingRevenue, basis: 'accounting' };
  }
  return { value: null, basis: 'unavailable' };
}

export function resolveFinancePeriod(
  query: FinanceBootstrapQueryDto,
  fiscalYearStartMonth: number,
  now = new Date(),
) {
  if (query.from && query.to) {
    const from = startOfUtcDay(new Date(query.from));
    const to = endOfUtcDay(new Date(query.to));
    return {
      preset: 'custom',
      from,
      to,
      label: `${from.toLocaleDateString('fr-FR')} – ${to.toLocaleDateString('fr-FR')}`,
    };
  }
  const preset = query.preset || 'current_month';
  let from: Date;
  const to = endOfUtcDay(now);
  if (preset === 'last_30_days') from = startOfUtcDay(new Date(now.getTime() - 29 * 86_400_000));
  else if (preset === 'current_quarter')
    from = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  else if (preset === 'fiscal_year') {
    const month = Math.min(12, Math.max(1, fiscalYearStartMonth)) - 1;
    const year = now.getUTCMonth() < month ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    from = new Date(Date.UTC(year, month, 1));
  } else from = startOfMonth(now);
  const labels: Record<string, string> = {
    current_month: 'Mois en cours',
    last_30_days: '30 derniers jours',
    current_quarter: 'Trimestre en cours',
    fiscal_year: 'Exercice en cours',
  };
  return { preset, from, to, label: labels[preset] ?? 'Période sélectionnée' };
}

@Injectable()
export class FinanceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    organizationId: string,
    query: FinanceBootstrapQueryDto,
    fiscalYearStartMonth: number,
  ) {
    const now = new Date();
    const [accounts, sources, settings, budgetPlan, organization] = await Promise.all([
      this.prisma.financeAccount.findMany({ where: { organizationId } }),
      this.prisma.financeDataSource.findMany({ where: { organizationId } }),
      this.prisma.financeSettings.findUnique({ where: { organizationId } }),
      this.prisma.financeBudgetPlan.findFirst({
        where: { organizationId, isReference: true },
        include: { lines: { orderBy: { periodStart: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { mistralApiKey: true },
      }),
    ]);
    const scopedSources = query.siteId
      ? sources.filter(({ siteId }) => siteId === query.siteId)
      : sources;
    const latestCoverage = scopedSources
      .map(({ coverageEnd }) => coverageEnd)
      .filter((value): value is Date => Boolean(value && value <= now))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const earliestRelevantCoverage = scopedSources
      .filter(({ isPrimarySales, sourceType }) => isPrimarySales || sourceType === 'ACCOUNTING_API')
      .map(({ coverageStart }) => coverageStart)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => left.getTime() - right.getTime())[0];
    const requestedAsOf = query.to ? new Date(query.to) : null;
    const asOf = endOfUtcDay(
      requestedAsOf && !Number.isNaN(requestedAsOf.getTime())
        ? requestedAsOf
        : (latestCoverage ?? now),
    );
    const fiscalStartMonth =
      budgetPlan?.startDate.getUTCMonth() ?? Math.min(12, Math.max(1, fiscalYearStartMonth)) - 1;
    const fiscalStartYear =
      budgetPlan && asOf >= budgetPlan.startDate && asOf <= budgetPlan.endDate
        ? budgetPlan.startDate.getUTCFullYear()
        : asOf.getUTCMonth() < fiscalStartMonth
          ? asOf.getUTCFullYear() - 1
          : asOf.getUTCFullYear();
    const fiscalStart =
      budgetPlan && asOf >= budgetPlan.startDate && asOf <= budgetPlan.endDate
        ? startOfMonth(budgetPlan.startDate)
        : new Date(Date.UTC(fiscalStartYear, fiscalStartMonth, 1));
    const fiscalEnd =
      budgetPlan && fiscalStart.getTime() === startOfMonth(budgetPlan.startDate).getTime()
        ? budgetPlan.endDate
        : new Date(
            Date.UTC(
              fiscalStart.getUTCFullYear() + 1,
              fiscalStart.getUTCMonth(),
              0,
              23,
              59,
              59,
              999,
            ),
          );
    const annualBudgetTo = endOfMonth(asOf) > fiscalEnd ? fiscalEnd : endOfMonth(asOf);
    const annualActualTo = asOf > fiscalEnd ? fiscalEnd : asOf;
    const readFrom = shiftYear(fiscalStart, -3);
    const [ledger, importedSales, periods] = await Promise.all([
      this.prisma.financeLedgerEntry.findMany({
        where: {
          organizationId,
          entryDate: { gte: readFrom, lte: annualBudgetTo },
          ...(query.siteId ? { source: { siteId: query.siteId } } : {}),
        },
        orderBy: { entryDate: 'asc' },
      }),
      this.prisma.financeDailySales.findMany({
        where: {
          organizationId,
          saleDate: { gte: readFrom, lte: annualBudgetTo },
          isRevenueRecord: true,
          source: { isPrimarySales: true, ...(query.siteId ? { siteId: query.siteId } : {}) },
        },
        include: { source: { select: { isPrimaryPos: true, provider: true, siteId: true } } },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.financeAccountingPeriod.findMany({ where: { organizationId } }),
    ]);
    const sales = deduplicateCrossSourceSales(importedSales).rows;
    const categoryByCode = new Map(accounts.map(({ code, category }) => [code, category]));
    const accountingLockedThrough = this.accountingLockedThrough(periods);
    const cash = query.siteId
      ? null
      : await this.cashBalanceFor(organizationId, accounts, annualActualTo);
    const annualActual = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      fiscalStart,
      annualActualTo,
      accountingLockedThrough,
    );
    const annualPrevious = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      shiftYear(fiscalStart, -1),
      shiftYear(annualActualTo, -1),
      accountingLockedThrough,
    );
    const monthStart = startOfMonth(asOf);
    const monthEnd = endOfMonth(asOf);
    const monthlyActualTo = resolveMonthlyActualTo(asOf, now);
    const monthlyIsComplete = monthlyActualTo.getTime() === monthEnd.getTime();
    const monthlyActual = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      monthStart,
      monthlyActualTo,
      accountingLockedThrough,
    );
    const monthlyPrevious = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      shiftYear(monthStart, -1),
      shiftYear(monthlyActualTo, -1),
      accountingLockedThrough,
    );
    const dailyActual = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      startOfUtcDay(asOf),
      endOfUtcDay(asOf),
      accountingLockedThrough,
    );
    const dailyPrevious = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      shiftYear(startOfUtcDay(asOf), -1),
      shiftYear(endOfUtcDay(asOf), -1),
      accountingLockedThrough,
    );
    const budgetLines = query.siteId ? [] : (budgetPlan?.lines ?? []);
    const annualBudget = this.budgetAggregate(budgetLines, fiscalStart, annualBudgetTo);
    const monthlyBudget = this.budgetAggregate(budgetLines, monthStart, monthEnd);
    const weekdayProfile = activeWeekdayProfile(sales);
    const activeDaysPerWeek = Math.max(1, weekdayProfile.size || 6);
    const annualObservedActiveDays = activeSaleDates(sales, fiscalStart, annualActualTo).size;
    const monthlyObservedActiveDays = activeSaleDates(sales, monthStart, monthlyActualTo).size;
    const annualBudgetActiveDays = countProfiledDays(fiscalStart, annualBudgetTo, weekdayProfile);
    const monthlyBudgetActiveDays = countProfiledDays(monthStart, monthEnd, weekdayProfile);
    const annualBudgetMonths = countMonths(fiscalStart, annualBudgetTo);
    const annualObservedMonths = countMonths(fiscalStart, annualActualTo);
    const referenceTicket =
      monthlyActual.averageTicket ??
      annualActual.averageTicket ??
      monthlyPrevious.averageTicket ??
      annualPrevious.averageTicket;
    const dailyBudget = Object.fromEntries(
      Object.entries(monthlyBudget).map(([key, value]) => [
        key,
        value == null ? null : numeric(value) / monthlyBudgetActiveDays,
      ]),
    );
    const provisional = !this.isLocked(periods, asOf);
    const annual = this.dashboardPeriod(
      'annual',
      annualActual,
      annualBudget,
      annualPrevious,
      cash,
      provisional,
      {
        budgetRevenue: annualBudget.revenue,
        budgetActiveDays: annualBudgetActiveDays,
        budgetMonths: annualBudgetMonths,
        observedActiveDays: annualObservedActiveDays,
        observedMonths: annualObservedMonths,
        activeDaysPerWeek,
        referenceTicket,
      },
    );
    const monthly = this.dashboardPeriod(
      'monthly',
      monthlyActual,
      monthlyBudget,
      monthlyPrevious,
      cash,
      provisional,
      {
        budgetRevenue: monthlyBudget.revenue,
        budgetActiveDays: monthlyBudgetActiveDays,
        budgetMonths: 1,
        observedActiveDays: monthlyObservedActiveDays,
        observedMonths: 1,
        activeDaysPerWeek,
        referenceTicket,
      },
    );
    const daily = this.dashboardPeriod(
      'daily',
      dailyActual,
      dailyBudget,
      dailyPrevious,
      cash,
      true,
      {
        budgetRevenue: monthlyBudget.revenue,
        budgetActiveDays: monthlyBudgetActiveDays,
        budgetMonths: 1,
        observedActiveDays: dailyActual.transactions > 0 ? 1 : 0,
        observedMonths: 1,
        activeDaysPerWeek,
        referenceTicket,
        fixedCostsOverride:
          monthlyActual.fixedCosts == null || monthlyObservedActiveDays === 0
            ? null
            : monthlyActual.fixedCosts / monthlyObservedActiveDays,
        fixedCostAllocationDays: monthlyObservedActiveDays,
      },
    );
    const series = this.monthlySeries(
      fiscalStart,
      budgetPlan?.endDate ?? fiscalEnd,
      ledger,
      sales,
      categoryByCode,
      budgetLines,
      accountingLockedThrough,
    );
    const dailySeries = this.dailySeries(monthStart, monthlyActualTo, sales);
    const elapsedMonths = Math.max(
      0,
      series.filter(({ periodStart }) => sameOrBeforeMonth(new Date(periodStart), annualBudgetTo))
        .length,
    );
    const totalMonths = series.length || 12;
    const health = this.health(annual.core);
    const selectedKpis = settings?.dashboardKpis?.length ? settings.dashboardKpis : DEFAULT_KPI_IDS;
    const period = resolveFinancePeriod(query, fiscalYearStartMonth, asOf);
    const legacyMetrics = [...annual.core, ...annual.optional].map((metric) =>
      this.legacyMetric(metric, asOf, provisional),
    );
    const annualComparison = this.historicalComparison(
      'annual',
      Array.from({ length: 4 }, (_, offset) => {
        const from = shiftYear(fiscalStart, -offset);
        const to = shiftYear(annualActualTo, -offset);
        return {
          id: offset === 0 ? 'current' : `n_${offset}`,
          label: `${from.getUTCFullYear()}–${from.getUTCFullYear() + 1}`,
          detail: offset === 0 ? 'Exercice en cours' : `Même avancement · N-${offset}`,
          from,
          to,
          isCurrent: offset === 0,
        };
      }),
      ledger,
      sales,
      categoryByCode,
      accountingLockedThrough,
    );
    const monthlyComparison = this.historicalComparison(
      'monthly',
      [
        {
          id: 'current',
          label: monthStart.toLocaleDateString('fr-FR', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          detail: monthlyIsComplete ? 'Mois complet' : 'Mois en cours à date',
          from: monthStart,
          to: monthlyActualTo,
          isCurrent: true,
        },
        ...[1, 2].map((offset) => ({
          id: `n_${offset}`,
          label: shiftYear(monthStart, -offset).toLocaleDateString('fr-FR', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          detail: monthlyIsComplete
            ? `Même mois complet · N-${offset}`
            : `Même mois à date · N-${offset}`,
          from: shiftYear(monthStart, -offset),
          to: shiftYear(monthlyActualTo, -offset),
          isCurrent: false,
        })),
        {
          id: 'm_1',
          label: shiftMonth(monthStart, -1).toLocaleDateString('fr-FR', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          detail: monthlyIsComplete
            ? 'Mois précédent complet'
            : 'Mois précédent au même nombre de jours',
          from: shiftMonth(monthStart, -1),
          to: shiftMonth(monthlyActualTo, -1),
          isCurrent: false,
        },
      ],
      ledger,
      sales,
      categoryByCode,
      accountingLockedThrough,
    );
    const dailyComparison = this.historicalComparison(
      'daily',
      [
        {
          id: 'current',
          label: 'Aujourd’hui',
          detail: formatComparisonDate(asOf),
          from: startOfUtcDay(asOf),
          to: endOfUtcDay(asOf),
          isCurrent: true,
        },
        {
          id: 'w_1',
          label: 'Même jour S-1',
          detail: formatComparisonDate(shiftDays(asOf, -7)),
          from: startOfUtcDay(shiftDays(asOf, -7)),
          to: endOfUtcDay(shiftDays(asOf, -7)),
          isCurrent: false,
        },
        {
          id: 'w_2',
          label: 'Même jour S-2',
          detail: formatComparisonDate(shiftDays(asOf, -14)),
          from: startOfUtcDay(shiftDays(asOf, -14)),
          to: endOfUtcDay(shiftDays(asOf, -14)),
          isCurrent: false,
        },
        {
          id: 'n_1_weekday',
          label: 'Même jour N-1',
          detail: formatComparisonDate(shiftDays(asOf, -364)),
          from: startOfUtcDay(shiftDays(asOf, -364)),
          to: endOfUtcDay(shiftDays(asOf, -364)),
          isCurrent: false,
        },
      ],
      ledger,
      sales,
      categoryByCode,
      accountingLockedThrough,
    );
    return {
      period: { preset: period.preset, label: period.label, from: fiscalStart, to: annualActualTo },
      metrics: legacyMetrics,
      analysis: {
        sales: {
          net: round(monthlyActual.salesNet),
          gross: round(monthlyActual.salesGross),
          vat: round(monthlyActual.salesVat),
          transactions: monthlyActual.transactions,
          averageTicket: monthlyActual.averageTicket,
        },
        profitability: {
          revenue: monthlyActual.revenue,
          materialPurchases: monthlyActual.materialPurchases,
          payroll: monthlyActual.payroll,
          otherExpenses: monthlyActual.otherOpex,
          operatingResult: monthlyActual.operatingResult,
          payrollRatio: monthlyActual.revenue
            ? round((numeric(monthlyActual.payroll) / monthlyActual.revenue) * 100, 1)
            : null,
          purchaseRatio: monthlyActual.revenue
            ? round((numeric(monthlyActual.materialPurchases) / monthlyActual.revenue) * 100, 1)
            : null,
        },
        budget: {
          revenue: monthlyBudget.revenue,
          expenses: monthlyBudget.operatingExpenses,
          revenueVariance:
            monthlyActual.revenue == null || monthlyBudget.revenue == null
              ? null
              : round(monthlyActual.revenue - monthlyBudget.revenue),
        },
        series: dailySeries.map(({ date, revenue }) => ({ date, revenue, result: 0 })),
      },
      dashboard: {
        context: {
          asOf,
          fiscalStart,
          fiscalEnd,
          elapsedMonths,
          totalMonths,
          periodProgress: totalMonths ? round((elapsedMonths / totalMonths) * 100, 1) : 0,
          actualCoverageLabel: earliestRelevantCoverage
            ? `Du ${earliestRelevantCoverage.toLocaleDateString('fr-FR')} au ${asOf.toLocaleDateString('fr-FR')}`
            : `Données disponibles jusqu’au ${asOf.toLocaleDateString('fr-FR')}`,
          dataCoverageStart: earliestRelevantCoverage ?? null,
          coverageComplete: Boolean(
            !query.siteId &&
            earliestRelevantCoverage &&
            earliestRelevantCoverage <= fiscalStart &&
            annualActual.operatingExpenses != null,
          ),
          budgetCoverageLabel: query.siteId
            ? 'Budget non affecté à cet établissement'
            : budgetPlan
              ? `${elapsedMonths} mois comparés aux ${elapsedMonths} mêmes mois budgétés`
              : 'Aucun budget de référence',
        },
        health,
        reconciliation: {
          lockedThrough: accountingLockedThrough,
          annual: this.reconciliation(annualActual),
          monthly: this.reconciliation(monthlyActual),
          daily: this.reconciliation(dailyActual),
        },
        annual: {
          ...annual,
          from: fiscalStart,
          to: annualActualTo,
          label: `Cumul de l’exercice · ${elapsedMonths}/${totalMonths} mois`,
          series,
          comparison: annualComparison,
        },
        monthly: {
          ...monthly,
          from: monthStart,
          to: monthlyActualTo,
          label: monthStart.toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          series: dailySeries,
          comparison: monthlyComparison,
        },
        daily: {
          ...daily,
          from: startOfUtcDay(asOf),
          to: endOfUtcDay(asOf),
          label: asOf.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          series: dailySeries,
          comparison: dailyComparison,
        },
        budget:
          budgetPlan && !query.siteId
            ? {
                id: budgetPlan.id,
                name: budgetPlan.name,
                scenario: budgetPlan.scenario,
                currency: budgetPlan.currency,
                startDate: budgetPlan.startDate,
                endDate: budgetPlan.endDate,
                isReference: budgetPlan.isReference,
                totals: this.budgetAggregate(budgetLines, budgetPlan.startDate, budgetPlan.endDate),
                targets: this.budgetTargets(budgetLines, asOf),
                series,
              }
            : null,
        preferences: { selected: selectedKpis, available: OPTIONAL_KPIS },
        mistral: { configured: Boolean(organization?.mistralApiKey) },
      },
    };
  }

  private aggregate(
    ledger: Array<{
      entryDate: Date;
      accountCode: string;
      debit: Prisma.Decimal;
      credit: Prisma.Decimal;
    }>,
    sales: Array<{
      saleDate: Date;
      netAmount: Prisma.Decimal;
      grossAmount: Prisma.Decimal;
      vatAmount: Prisma.Decimal;
      transactionCount: number;
    }>,
    categories: Map<string, FinanceAccountCategory>,
    from: Date,
    to: Date,
    accountingLockedThrough: Date | null,
  ) {
    const selectedLedger = ledger.filter(({ entryDate }) => entryDate >= from && entryDate <= to);
    const selectedSales = sales.filter(({ saleDate }) => saleDate >= from && saleDate <= to);
    const buckets = new Map<FinanceAccountCategory, number>();
    for (const entry of selectedLedger) {
      const category = categories.get(entry.accountCode) ?? FinanceAccountCategory.OTHER;
      const debitMinusCredit = numeric(entry.debit) - numeric(entry.credit);
      const signed =
        category === FinanceAccountCategory.REVENUE ? -debitMinusCredit : debitMinusCredit;
      buckets.set(category, (buckets.get(category) ?? 0) + signed);
    }
    const ledgerRevenueRows = selectedLedger.filter(
      ({ accountCode }) =>
        (categories.get(accountCode) ?? FinanceAccountCategory.OTHER) ===
        FinanceAccountCategory.REVENUE,
    );
    const ledgerRevenue = buckets.get(FinanceAccountCategory.REVENUE) ?? 0;
    const salesNet = selectedSales.reduce((sum, item) => sum + numeric(item.netAmount), 0);
    const salesGross = selectedSales.reduce((sum, item) => sum + numeric(item.grossAmount), 0);
    const salesVat = selectedSales.reduce((sum, item) => sum + numeric(item.vatAmount), 0);
    const transactions = selectedSales.reduce((sum, item) => sum + item.transactionCount, 0);
    const hasCashRegisterData = selectedSales.some(
      (item) =>
        item.transactionCount !== 0 ||
        numeric(item.netAmount) !== 0 ||
        numeric(item.grossAmount) !== 0 ||
        numeric(item.vatAmount) !== 0,
    );
    const hasLedger = selectedLedger.length > 0;
    const revenueSelections: Array<{
      value: number | null;
      basis: Exclude<RevenueBasis, 'mixed'>;
    }> = [];
    let cursor = from;
    while (cursor <= to) {
      const sliceEnd = new Date(Math.min(endOfMonth(cursor).getTime(), to.getTime()));
      const sliceLedgerRevenueRows = ledgerRevenueRows.filter(
        ({ entryDate }) => entryDate >= cursor && entryDate <= sliceEnd,
      );
      const sliceSales = selectedSales.filter(
        ({ saleDate }) => saleDate >= cursor && saleDate <= sliceEnd,
      );
      revenueSelections.push(
        selectFinanceRevenue({
          cashRegisterRevenue: sliceSales.reduce((sum, item) => sum + numeric(item.netAmount), 0),
          accountingRevenue: sliceLedgerRevenueRows.reduce(
            (sum, entry) => sum + numeric(entry.credit) - numeric(entry.debit),
            0,
          ),
          hasCashRegisterData: sliceSales.some(
            (item) =>
              item.transactionCount !== 0 ||
              numeric(item.netAmount) !== 0 ||
              numeric(item.grossAmount) !== 0 ||
              numeric(item.vatAmount) !== 0,
          ),
          hasAccountingData: sliceLedgerRevenueRows.length > 0,
          periodEnd: sliceEnd,
          accountingLockedThrough,
        }),
      );
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    const selectedRevenue = revenueSelections.filter(
      (selection): selection is typeof selection & { value: number } => selection.value != null,
    );
    const revenue = selectedRevenue.length
      ? selectedRevenue.reduce((sum, selection) => sum + selection.value, 0)
      : null;
    const selectedBases = new Set(
      selectedRevenue.map(({ basis }) => basis).filter((basis) => basis !== 'unavailable'),
    );
    const revenueBasis: RevenueBasis =
      selectedBases.size > 1
        ? 'mixed'
        : (([...selectedBases][0] as RevenueBasis | undefined) ?? 'unavailable');
    const materialPurchases = hasLedger
      ? (buckets.get(FinanceAccountCategory.MATERIAL_PURCHASES) ?? 0)
      : null;
    const payroll = hasLedger ? (buckets.get(FinanceAccountCategory.PAYROLL) ?? 0) : null;
    const otherOpex = hasLedger ? (buckets.get(FinanceAccountCategory.OTHER_OPEX) ?? 0) : null;
    const operatingExpenses = hasLedger
      ? numeric(materialPurchases) + numeric(payroll) + numeric(otherOpex)
      : null;
    const operatingResult =
      revenue != null && operatingExpenses != null ? revenue - operatingExpenses : null;
    const contributionMargin =
      revenue != null && materialPurchases != null ? revenue - materialPurchases : null;
    const contributionMarginRate =
      revenue && contributionMargin != null ? (contributionMargin / revenue) * 100 : null;
    const fixedCosts = payroll != null && otherOpex != null ? payroll + otherOpex : null;
    const breakEven =
      fixedCosts != null && contributionMarginRate && contributionMarginRate > 0
        ? fixedCosts / (contributionMarginRate / 100)
        : null;
    const blendedSource = (value: number | null): RevenueBasis => {
      if (value == null) return 'unavailable';
      if (revenueBasis === 'accounting') return 'accounting';
      return hasLedger ? 'mixed' : revenueBasis;
    };
    return {
      revenue: revenue == null ? null : round(revenue),
      materialPurchases: materialPurchases == null ? null : round(materialPurchases),
      payroll: payroll == null ? null : round(payroll),
      otherOpex: otherOpex == null ? null : round(otherOpex),
      operatingExpenses: operatingExpenses == null ? null : round(operatingExpenses),
      operatingResult: operatingResult == null ? null : round(operatingResult),
      contributionMargin: contributionMargin == null ? null : round(contributionMargin),
      contributionMarginRate:
        contributionMarginRate == null ? null : round(contributionMarginRate, 1),
      fixedCosts: fixedCosts == null ? null : round(fixedCosts),
      breakEven: breakEven == null ? null : round(breakEven),
      salesNet: round(salesNet),
      salesGross: round(salesGross),
      salesVat: round(salesVat),
      transactions,
      averageTicket: transactions ? round(salesGross / transactions) : null,
      cashRegisterRevenue: hasCashRegisterData ? round(salesNet) : null,
      accountingRevenue: ledgerRevenueRows.length ? round(ledgerRevenue) : null,
      revenueDifference:
        hasCashRegisterData && ledgerRevenueRows.length ? round(ledgerRevenue - salesNet) : null,
      revenueBasis,
      metricSources: {
        revenue: revenueBasis,
        operating_expenses: operatingExpenses == null ? 'unavailable' : 'accounting',
        payroll: payroll == null ? 'unavailable' : 'accounting',
        operating_result: blendedSource(operatingResult),
        transactions: hasCashRegisterData ? 'cash_register' : 'unavailable',
        average_ticket: hasCashRegisterData ? 'cash_register' : 'unavailable',
        contribution_margin: blendedSource(contributionMargin),
        contribution_margin_rate: blendedSource(contributionMarginRate),
      } satisfies Record<string, RevenueBasis>,
    };
  }

  private budgetAggregate(
    lines: Array<{ metric: string; periodStart: Date; amount: Prisma.Decimal }>,
    from: Date,
    to: Date,
  ) {
    const totals = new Map<string, number>();
    for (const line of lines) {
      if (line.periodStart < startOfMonth(from) || line.periodStart > startOfMonth(to)) continue;
      totals.set(line.metric, (totals.get(line.metric) ?? 0) + numeric(line.amount));
    }
    const get = (metric: string) => (totals.has(metric) ? round(totals.get(metric)!) : null);
    return {
      revenue: get('revenue'),
      materialPurchases: get('material_purchases'),
      payroll: get('payroll'),
      otherOpex: get('other_opex'),
      operatingExpenses: get('operating_expenses'),
      operatingResult: get('operating_result'),
      netResult: get('net_result'),
      breakEven: get('break_even'),
    };
  }

  private budgetTargets(
    lines: Array<{ metric: string; periodStart: Date; amount: Prisma.Decimal }>,
    asOf: Date,
  ) {
    const budgetMonths = lines
      .map((line) => startOfMonth(line.periodStart))
      .sort((left, right) => left.getTime() - right.getTime());
    const firstMonth = budgetMonths[0] ?? startOfMonth(asOf);
    const lastMonth = budgetMonths.at(-1) ?? firstMonth;
    const requestedMonth = startOfMonth(asOf);
    const referenceMonth =
      requestedMonth < firstMonth
        ? firstMonth
        : requestedMonth > lastMonth
          ? lastMonth
          : requestedMonth;
    const referenceMonthEnd = endOfMonth(referenceMonth);
    const budget = this.budgetAggregate(lines, referenceMonth, referenceMonthEnd);
    const days = referenceMonthEnd.getUTCDate();
    const perDay = (value: number | null) => (value == null ? null : round(value / days));
    const perWeek = (value: number | null) => (value == null ? null : round((value / days) * 7));
    const pointMortDay =
      budget.revenue != null && budget.revenue > 0 && budget.breakEven != null
        ? Math.max(1, Math.ceil((budget.breakEven / budget.revenue) * days))
        : null;
    const pointMortDate =
      pointMortDay != null && pointMortDay <= days
        ? new Date(
            Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth(), pointMortDay),
          )
        : null;
    return {
      periodStart: referenceMonth,
      label: referenceMonth.toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      days,
      revenueMonth: budget.revenue,
      revenueWeek: perWeek(budget.revenue),
      revenueDay: perDay(budget.revenue),
      breakEvenMonth: budget.breakEven,
      breakEvenWeek: perWeek(budget.breakEven),
      breakEvenDay: perDay(budget.breakEven),
      operatingResult: budget.operatingResult,
      pointMortDay,
      pointMortDate,
    };
  }

  private dashboardPeriod(
    kind: 'annual' | 'monthly' | 'daily',
    actual: ReturnType<FinanceAnalyticsService['aggregate']>,
    budget: Record<string, number | null>,
    previous: ReturnType<FinanceAnalyticsService['aggregate']>,
    cash: number | null,
    provisional: boolean,
    context: DashboardPeriodContext,
  ) {
    const core = [
      this.comparisonMetric(
        'revenue',
        'Chiffre d’affaires',
        actual.revenue,
        budget.revenue,
        previous.revenue,
        false,
        'currency',
        'Les ventes HT sur la période comparées au budget au même stade.',
        provisional,
      ),
      this.comparisonMetric(
        'operating_expenses',
        'Charges d’exploitation',
        actual.operatingExpenses,
        budget.operatingExpenses,
        previous.operatingExpenses,
        true,
        'currency',
        'Toutes les charges nécessaires à l’activité, personnel et achats inclus.',
        provisional,
      ),
      this.comparisonMetric(
        'payroll',
        'Masse salariale',
        actual.payroll,
        budget.payroll,
        previous.payroll,
        true,
        'currency',
        'Salaires et charges employeur affectés à la période.',
        provisional,
      ),
      this.comparisonMetric(
        'operating_result',
        'Résultat d’exploitation',
        actual.operatingResult,
        budget.operatingResult,
        previous.operatingResult,
        false,
        'currency',
        'Ce que l’activité gagne ou perd avant finance et impôts.',
        provisional,
      ),
    ];
    const transactionPacing = computeBudgetTransactionPacing({
      budgetRevenue: context.budgetRevenue,
      referenceTicket: context.referenceTicket,
      budgetActiveDays: context.budgetActiveDays,
      budgetMonths: context.budgetMonths,
      activeDaysPerWeek: context.activeDaysPerWeek,
      actualTransactions: actual.transactions,
      observedActiveDays: context.observedActiveDays,
      observedMonths: context.observedMonths,
    });
    const optional: DashboardMetric[] = [
      this.simpleMetric(
        'average_ticket',
        'Ticket moyen',
        actual.averageTicket,
        'currency',
        'Montant TTC moyen par transaction.',
      ),
      this.simpleMetric(
        'transactions',
        'Transactions',
        actual.transactions || null,
        'number',
        'Nombre de tickets enregistrés par la caisse.',
      ),
      this.simpleMetric(
        'contribution_margin',
        'Marge contributive',
        actual.contributionMargin,
        'currency',
        'CA diminué des achats directement liés aux ventes.',
      ),
      this.simpleMetric(
        'contribution_margin_rate',
        'Taux de marge contributive',
        actual.contributionMarginRate,
        'percentage',
        'Part du CA disponible pour couvrir les frais fixes.',
      ),
      this.simpleMetric(
        'cash',
        'Trésorerie disponible',
        cash,
        'currency',
        'Solde des comptes de trésorerie au dernier mouvement disponible.',
      ),
      this.simpleMetric(
        'fixed_costs',
        'Charges fixes',
        context.fixedCostsOverride === undefined ? actual.fixedCosts : context.fixedCostsOverride,
        'currency',
        kind === 'daily'
          ? `Charges fixes réparties sur les ${context.fixedCostAllocationDays || 0} jour(s) d’activité détecté(s) ce mois.`
          : 'Personnel et autres charges hors achats de matières.',
      ),
      this.comparisonMetric(
        'break_even',
        'Seuil de CA',
        actual.breakEven,
        budget.breakEven,
        null,
        true,
        'currency',
        'CA nécessaire pour couvrir les charges au taux de marge observé.',
        provisional,
      ),
      this.targetMetric(
        'break_even_day',
        'Transactions seuil / jour',
        transactionPacing.targetDay,
        transactionPacing.actualDay,
        'Objectif budget / jour actif',
        kind === 'daily' ? 'Réalisé ce jour' : 'Rythme réalisé / jour actif',
        `Transactions quotidiennes nécessaires pour atteindre le CA budgété, calculées sur ${context.budgetActiveDays} jour(s) d’ouverture estimé(s).`,
      ),
      this.targetMetric(
        'break_even_week',
        'Transactions seuil / semaine',
        transactionPacing.targetWeek,
        transactionPacing.actualWeek,
        'Objectif budget / semaine',
        'Rythme réalisé / semaine',
        `Transactions hebdomadaires nécessaires pour atteindre le CA budgété, sur ${context.activeDaysPerWeek} jour(s) d’activité habituels.`,
      ),
      this.targetMetric(
        'break_even_month',
        'Transactions seuil / mois',
        transactionPacing.targetMonth,
        transactionPacing.actualMonth,
        'Objectif budget / mois',
        kind === 'annual' ? 'Moyenne réalisée / mois' : 'Réalisé à date',
        'Transactions mensuelles nécessaires pour atteindre le chiffre d’affaires prévu au budget.',
      ),
    ];
    return {
      kind,
      core,
      optional:
        kind === 'daily'
          ? optional.filter(({ id }) => id !== 'break_even_week' && id !== 'break_even_month')
          : optional,
      status: provisional ? 'provisional' : 'ready',
    };
  }

  private comparisonMetric(
    id: string,
    label: string,
    value: number | null,
    budget: number | null | undefined,
    previous: number | null,
    lowerIsBetter: boolean,
    unit: DashboardMetric['unit'],
    help: string,
    provisional: boolean,
  ): DashboardMetric {
    const variance = value == null || budget == null ? null : round(value - budget);
    const variancePercent =
      variance == null || !budget ? null : round((variance / Math.abs(budget)) * 100, 1);
    return {
      id,
      label,
      value,
      unit,
      budget: budget ?? null,
      variance,
      variancePercent,
      previous,
      favorable: variance == null ? null : lowerIsBetter ? variance <= 0 : variance >= 0,
      status: value == null ? 'unavailable' : provisional ? 'provisional' : 'ready',
      help,
      displayable: metricIsDisplayable(id, value),
      availabilityReason:
        value == null
          ? 'Donnée indisponible pour cette période.'
          : metricIsDisplayable(id, value)
            ? null
            : 'Valeur nulle ou incohérente pour cette période.',
    };
  }

  private simpleMetric(
    id: string,
    label: string,
    value: number | null,
    unit: DashboardMetric['unit'],
    help: string,
  ): DashboardMetric {
    return {
      id,
      label,
      value: value == null ? null : round(value, unit === 'number' ? 1 : 2),
      unit,
      budget: null,
      variance: null,
      variancePercent: null,
      previous: null,
      favorable: null,
      status: value == null ? 'unavailable' : 'ready',
      help,
      displayable: metricIsDisplayable(id, value),
      availabilityReason:
        value == null
          ? 'Donnée indisponible pour cette période.'
          : metricIsDisplayable(id, value)
            ? null
            : 'Valeur nulle ou incohérente pour cette période.',
    };
  }

  private targetMetric(
    id: string,
    label: string,
    targetValue: number | null,
    actualValue: number | null,
    targetLabel: string,
    actualLabel: string,
    help: string,
  ): DashboardMetric {
    const roundedTarget = targetValue == null ? null : round(targetValue, 1);
    const roundedActual = actualValue == null ? null : round(actualValue, 1);
    const displayable = metricIsDisplayable(id, roundedTarget);
    return {
      id,
      label,
      value: roundedTarget,
      actualValue: roundedActual,
      targetLabel,
      actualLabel,
      unit: 'number',
      budget: null,
      variance:
        roundedTarget == null || roundedActual == null
          ? null
          : round(roundedActual - roundedTarget, 1),
      variancePercent:
        roundedTarget == null || roundedActual == null || roundedTarget === 0
          ? null
          : round(((roundedActual - roundedTarget) / roundedTarget) * 100, 1),
      previous: null,
      favorable:
        roundedTarget == null || roundedActual == null ? null : roundedActual >= roundedTarget,
      status: displayable ? 'ready' : 'unavailable',
      help,
      displayable,
      availabilityReason: displayable
        ? null
        : 'Budget de chiffre d’affaires ou ticket moyen de référence insuffisant.',
    };
  }

  private historicalComparison(
    kind: 'annual' | 'monthly' | 'daily',
    ranges: Array<{
      id: string;
      label: string;
      detail: string;
      from: Date;
      to: Date;
      isCurrent: boolean;
    }>,
    ledger: Parameters<FinanceAnalyticsService['aggregate']>[0],
    sales: Parameters<FinanceAnalyticsService['aggregate']>[1],
    categories: Map<string, FinanceAccountCategory>,
    accountingLockedThrough: Date | null,
  ) {
    return {
      modeLabel:
        kind === 'annual'
          ? 'Exercices comparés au même stade'
          : kind === 'monthly'
            ? 'Mois comparés au même nombre de jours'
            : 'Jours de semaine équivalents',
      periods: ranges.map((range) => {
        const actual = this.aggregate(
          ledger,
          sales,
          categories,
          range.from,
          range.to,
          accountingLockedThrough,
        );
        return {
          ...range,
          basis: actual.revenueBasis,
          sources: actual.metricSources,
          metrics: {
            revenue: actual.revenue,
            operating_expenses: actual.operatingExpenses,
            payroll: actual.payroll,
            operating_result: actual.operatingResult,
            transactions: actual.transactions || null,
            average_ticket: actual.averageTicket,
            contribution_margin: actual.contributionMargin,
            contribution_margin_rate: actual.contributionMarginRate,
          },
        };
      }),
    };
  }

  private monthlySeries(
    start: Date,
    end: Date,
    ledger: Parameters<FinanceAnalyticsService['aggregate']>[0],
    sales: Parameters<FinanceAnalyticsService['aggregate']>[1],
    categories: Map<string, FinanceAccountCategory>,
    budgetLines: Array<{ metric: string; periodStart: Date; amount: Prisma.Decimal }>,
    accountingLockedThrough: Date | null,
  ) {
    const result = [];
    let cursor = startOfMonth(start);
    let cumulativeActual = 0;
    let cumulativeBudget = 0;
    while (cursor <= endOfMonth(end)) {
      const monthEnd = endOfMonth(cursor);
      const actual = this.aggregate(
        ledger,
        sales,
        categories,
        cursor,
        monthEnd,
        accountingLockedThrough,
      );
      const budget = this.budgetAggregate(budgetLines, cursor, monthEnd);
      cumulativeActual += actual.revenue ?? 0;
      cumulativeBudget += budget.revenue ?? 0;
      result.push({
        periodStart: cursor.toISOString(),
        label: cursor.toLocaleDateString('fr-FR', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        }),
        actualRevenue: actual.revenue,
        budgetRevenue: budget.revenue,
        actualResult: actual.operatingResult,
        budgetResult: budget.operatingResult,
        budgetBreakEven: budget.breakEven,
        cumulativeActualRevenue: round(cumulativeActual),
        cumulativeBudgetRevenue: round(cumulativeBudget),
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return result;
  }

  private dailySeries(
    start: Date,
    end: Date,
    sales: Array<{ saleDate: Date; netAmount: Prisma.Decimal; transactionCount: number }>,
  ) {
    const byDay = new Map<string, { revenue: number; transactions: number }>();
    for (const row of sales) {
      if (row.saleDate < start || row.saleDate > end) continue;
      const key = row.saleDate.toISOString().slice(0, 10);
      const current = byDay.get(key) ?? { revenue: 0, transactions: 0 };
      current.revenue += numeric(row.netAmount);
      current.transactions += row.transactionCount;
      byDay.set(key, current);
    }
    const result: Array<{ date: string; revenue: number; transactions: number }> = [];
    for (let cursor = startOfUtcDay(start); cursor <= end; cursor = shiftDays(cursor, 1)) {
      const date = utcDateKey(cursor);
      const values = byDay.get(date) ?? { revenue: 0, transactions: 0 };
      result.push({
        date,
        revenue: round(values.revenue),
        transactions: values.transactions,
      });
    }
    return result;
  }

  private async cashBalanceFor(
    organizationId: string,
    accounts: Array<{ code: string; category: FinanceAccountCategory }>,
    to: Date,
  ) {
    const cashCodes = accounts
      .filter(({ category }) => category === FinanceAccountCategory.CASH)
      .map(({ code }) => code);
    if (!cashCodes.length) return null;
    const rows = await this.prisma.financeLedgerEntry.findMany({
      where: { organizationId, accountCode: { in: cashCodes }, entryDate: { lte: to } },
      orderBy: { entryDate: 'asc' },
    });
    if (!rows.length) return null;
    const balances = new Map<string, number>();
    for (const row of rows)
      balances.set(
        row.accountCode,
        row.closingBalance == null
          ? (balances.get(row.accountCode) ?? 0) + numeric(row.debit) - numeric(row.credit)
          : numeric(row.closingBalance),
      );
    return round([...balances.values()].reduce((sum, value) => sum + value, 0));
  }

  private health(core: DashboardMetric[]) {
    const revenue = core.find(({ id }) => id === 'revenue');
    const result = core.find(({ id }) => id === 'operating_result');
    if (core.some(({ value }) => value == null))
      return {
        level: 'unknown',
        label: 'Lecture incomplète',
        summary:
          'Les ventes visibles sont réelles, mais la comptabilité ne couvre pas encore toute la période. Connectez Fennoa avant de conclure sur la rentabilité.',
      };
    if (result?.value != null && result.value < 0)
      return {
        level: 'critical',
        label: 'Situation critique',
        summary: `L’exploitation affiche une perte de ${Math.abs(result.value).toLocaleString('fr-FR')} €. Le CA et les charges doivent être examinés ensemble.`,
      };
    if (revenue?.variancePercent != null && revenue.variancePercent < -5)
      return {
        level: 'attention',
        label: 'Trajectoire à surveiller',
        summary: `Le chiffre d’affaires cumulé est inférieur de ${Math.abs(revenue.variancePercent).toLocaleString('fr-FR')} % au budget des mêmes mois.`,
      };
    if (revenue?.value == null)
      return {
        level: 'unknown',
        label: 'Lecture incomplète',
        summary: 'Les sources ne couvrent pas encore suffisamment la période pour conclure.',
      };
    return {
      level: 'good',
      label: 'Trajectoire favorable',
      summary:
        'Les indicateurs disponibles sont cohérents avec le budget au même stade de l’exercice.',
    };
  }

  private legacyMetric(metric: DashboardMetric, asOf: Date, provisional: boolean) {
    return {
      id: metric.id,
      label: metric.label,
      value: metric.value,
      unit: metric.unit,
      status:
        metric.value == null
          ? ('unavailable' as const)
          : provisional
            ? ('provisional' as const)
            : ('ready' as const),
      source: metric.value == null ? null : 'Finance consolidée',
      asOf: metric.value == null ? null : asOf,
      coverage: metric.value == null ? null : 1,
      reason:
        metric.value == null ? 'Donnée absente de la source pour cette période.' : metric.help,
    };
  }

  private reconciliation(actual: ReturnType<FinanceAnalyticsService['aggregate']>) {
    const tolerance =
      actual.cashRegisterRevenue == null
        ? 1
        : Math.max(1, Math.abs(actual.cashRegisterRevenue) * 0.005);
    return {
      cashRegisterRevenue: actual.cashRegisterRevenue,
      accountingRevenue: actual.accountingRevenue,
      difference: actual.revenueDifference,
      selectedRevenue: actual.revenue,
      basis: actual.revenueBasis,
      status:
        actual.revenueDifference == null
          ? ('partial' as const)
          : Math.abs(actual.revenueDifference) <= tolerance
            ? ('matched' as const)
            : ('attention' as const),
    };
  }

  private accountingLockedThrough(periods: Array<{ accountingLockedAt: Date | null }>) {
    return (
      periods
        .map(({ accountingLockedAt }) => accountingLockedAt)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null
    );
  }

  private isLocked(periods: Array<{ accountingLockedAt: Date | null }>, to: Date) {
    return periods.some(({ accountingLockedAt }) => accountingLockedAt && accountingLockedAt >= to);
  }
}
