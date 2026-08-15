import { Injectable } from '@nestjs/common';
import { FinanceAccountCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deduplicateCrossSourceSales,
  resolveContributingSalesSourceIds,
} from './finance-sales-dedupe';
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
  revenuePercent?: number | null;
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

type FinanceAggregateOptions = {
  revenuePolicy?: 'operational' | 'accounting';
  finnishChart?: boolean;
  accountingCoverageThrough?: Date | null;
};

type FinanceLedgerRevenueRow = {
  entryDate: Date;
  accountCode: string;
  debit: Prisma.Decimal | number;
  credit: Prisma.Decimal | number;
  description?: string | null;
  series?: string | null;
  entryType?: number | null;
  sourceEntityId?: string | null;
};

type FinanceSalesRevenueRow = {
  saleDate: Date;
  netAmount: Prisma.Decimal | number;
  grossAmount: Prisma.Decimal | number;
  vatAmount: Prisma.Decimal | number;
  transactionCount: number;
  paymentMethod?: string | null;
  source?: { provider?: string | null } | null;
};

export type FinanceRevenueBreakdown = {
  selectedCashRegisterRevenue: number;
  selectedAccountingRevenue: number;
  accountingInvoiceRevenue: number;
  accountingFallbackRevenue: number;
  accountingAdjustmentRevenue: number;
  accountingOverlappingRevenue: number;
  accountingOtherRevenue: number;
};

type FennoaBudgetLineInput = {
  accountingPeriodExternalId: number;
  externalBudgetId: number | null;
  budgetName: string | null;
  accountCode: string;
  month: number;
  amount: Prisma.Decimal | number;
};

type BudgetMetricLine = {
  metric: string;
  label: string;
  periodStart: Date;
  amount: Prisma.Decimal;
};

type FinanceBudgetCandidate = {
  id: string;
  siteId: string | null;
  site: { id: string; name: string } | null;
  name: string;
  scenario: string | null;
  currency: string;
  startDate: Date;
  endDate: Date;
  source: string;
  isReference: boolean;
  lines: BudgetMetricLine[];
};

export type FinanceSiteDataScopeMode =
  | 'consolidated'
  | 'direct'
  | 'exclusive_site_fallback'
  | 'unavailable';

export function selectFinanceBudgetPlan<T extends { siteId?: string | null }>(
  plans: T[],
  siteId?: string,
) {
  if (!siteId) return plans[0] ?? null;
  return plans.find((plan) => plan.siteId === siteId) ?? plans.find((plan) => !plan.siteId) ?? null;
}

export function listFennoaBudgets(
  lines: FennoaBudgetLineInput[],
  accountingPeriodExternalId: number | null,
) {
  if (accountingPeriodExternalId == null) return [];
  const groups = new Map<
    string,
    {
      externalBudgetId: number | null;
      name: string;
      lines: FennoaBudgetLineInput[];
    }
  >();
  for (const line of lines) {
    if (line.accountingPeriodExternalId !== accountingPeriodExternalId) continue;
    const name = line.budgetName?.trim() || 'Budget Fennoa';
    const key = `${line.externalBudgetId ?? 'sans-id'}:${name}`;
    const group = groups.get(key) ?? {
      externalBudgetId: line.externalBudgetId,
      name,
      lines: [],
    };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (left, right) => (right.externalBudgetId ?? -1) - (left.externalBudgetId ?? -1),
  );
}

export function selectFennoaBudget(
  lines: FennoaBudgetLineInput[],
  accountingPeriodExternalId: number | null,
) {
  return listFennoaBudgets(lines, accountingPeriodExternalId)[0] ?? null;
}

export function financeBudgetSelectionKey(from: Date, to: Date, siteId?: string) {
  return `${siteId || 'consolidated'}:${from.toISOString().slice(0, 10)}:${to
    .toISOString()
    .slice(0, 10)}`;
}

export function fennoaBudgetMetricLines(
  lines: FennoaBudgetLineInput[],
  fiscalStart: Date,
): BudgetMetricLine[] {
  const months = new Map<
    number,
    {
      turnover: number;
      otherOperatingIncome: number;
      materialPurchases: number;
      payroll: number;
      depreciation: number;
      otherOpex: number;
      financial: number;
      taxes: number;
    }
  >();
  for (const line of lines) {
    if (line.month < 1 || line.month > 12) continue;
    const account = Number.parseInt(line.accountCode.replace(/\D/g, '').slice(0, 4), 10);
    if (!Number.isFinite(account)) continue;
    const month = months.get(line.month) ?? {
      turnover: 0,
      otherOperatingIncome: 0,
      materialPurchases: 0,
      payroll: 0,
      depreciation: 0,
      otherOpex: 0,
      financial: 0,
      taxes: 0,
    };
    const amount = numeric(line.amount);
    if (account >= 3000 && account <= 3899) month.turnover += amount;
    else if (account >= 3900 && account <= 3999) month.otherOperatingIncome += amount;
    else if (account >= 4000 && account <= 4999) month.materialPurchases += amount;
    else if (account >= 5000 && account <= 6799) month.payroll += amount;
    else if (account >= 6800 && account <= 6899) month.depreciation += amount;
    else if (account >= 6900 && account <= 8999) month.otherOpex += amount;
    else if (account >= 9000 && account <= 9799) month.financial += amount;
    else if (account >= 9800 && account <= 9999) month.taxes += amount;
    months.set(line.month, month);
  }

  const definitions = [
    ['revenue', "Chiffre d'affaires"],
    ['other_operating_income', "Autres produits d'exploitation"],
    ['material_purchases', 'Achats / matières'],
    ['payroll', 'Masse salariale'],
    ['depreciation', 'Amortissements'],
    ['other_opex', "Autres charges d'exploitation"],
    ['operating_expenses', "Charges d'exploitation"],
    ['result_before_depreciation', 'Résultat avant amortissements'],
    ['operating_result', "Résultat d'exploitation"],
    ['financial_result', 'Résultat financier'],
    ['taxes', 'Impôts'],
    ['net_result', 'Résultat net'],
  ] as const;

  return [...months.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([monthNumber, month]) => {
      const materialPurchases = -month.materialPurchases;
      const payroll = -month.payroll;
      const depreciation = -month.depreciation;
      const otherOpexWithoutDepreciation = -month.otherOpex;
      const otherOpex = depreciation + otherOpexWithoutDepreciation;
      const operatingExpenses = materialPurchases + payroll + otherOpex;
      const operatingIncome = month.turnover + month.otherOperatingIncome;
      const resultBeforeDepreciation =
        operatingIncome - materialPurchases - payroll - otherOpexWithoutDepreciation;
      const operatingResult = operatingIncome - operatingExpenses;
      const netResult = operatingResult + month.financial + month.taxes;
      const values: Record<(typeof definitions)[number][0], number> = {
        revenue: month.turnover,
        other_operating_income: month.otherOperatingIncome,
        material_purchases: materialPurchases,
        payroll,
        depreciation,
        other_opex: otherOpex,
        operating_expenses: operatingExpenses,
        result_before_depreciation: resultBeforeDepreciation,
        operating_result: operatingResult,
        financial_result: month.financial,
        taxes: -month.taxes,
        net_result: netResult,
      };
      const periodStart = new Date(
        Date.UTC(fiscalStart.getUTCFullYear(), fiscalStart.getUTCMonth() + monthNumber - 1, 1),
      );
      return definitions.map(([metric, label]) => ({
        metric,
        label,
        periodStart,
        amount: new Prisma.Decimal(round(values[metric])),
      }));
    });
}

export function allocateMonthlyBudgetPerCalendarDay(
  month: Date,
  budget: { revenue: number | null; operatingResult: number | null },
) {
  const days = endOfMonth(month).getUTCDate();
  return {
    revenue: budget.revenue == null ? null : round(budget.revenue / days),
    operatingResult: budget.operatingResult == null ? null : round(budget.operatingResult / days),
  };
}

export function resolveFinanceSiteDataScope(input: {
  siteId?: string;
  activeSalesSiteIds: string[];
  directAccountingSourceIds: string[];
  globalAccountingSourceIds: string[];
  budgetSiteId?: string | null;
  hasBudget: boolean;
}) {
  if (!input.siteId) {
    return {
      accountingMode: 'consolidated' as FinanceSiteDataScopeMode,
      accountingSourceIds: [
        ...new Set([...input.directAccountingSourceIds, ...input.globalAccountingSourceIds]),
      ],
      budgetMode: input.hasBudget
        ? ('consolidated' as FinanceSiteDataScopeMode)
        : ('unavailable' as FinanceSiteDataScopeMode),
      includeBudget: input.hasBudget,
    };
  }

  const exclusiveSite =
    input.activeSalesSiteIds.length === 1 && input.activeSalesSiteIds[0] === input.siteId;
  const accountingSourceIds = [...input.directAccountingSourceIds];
  let accountingMode: FinanceSiteDataScopeMode = accountingSourceIds.length
    ? 'direct'
    : 'unavailable';
  if (!accountingSourceIds.length && exclusiveSite && input.globalAccountingSourceIds.length) {
    accountingSourceIds.push(...input.globalAccountingSourceIds);
    accountingMode = 'exclusive_site_fallback';
  }

  const budgetIsDirect = input.hasBudget && input.budgetSiteId === input.siteId;
  const budgetCanFollowExclusiveSite =
    input.hasBudget && input.budgetSiteId == null && exclusiveSite;
  return {
    accountingMode,
    accountingSourceIds,
    budgetMode: budgetIsDirect
      ? ('direct' as FinanceSiteDataScopeMode)
      : budgetCanFollowExclusiveSite
        ? ('exclusive_site_fallback' as FinanceSiteDataScopeMode)
        : ('unavailable' as FinanceSiteDataScopeMode),
    includeBudget: budgetIsDirect || budgetCanFollowExclusiveSite,
  };
}

const OPTIONAL_KPIS = [
  {
    id: 'result_before_depreciation',
    label: 'Résultat avant amortissements',
    unit: 'currency',
    help: 'Résultat comptable de l’activité avant les dotations aux amortissements.',
  },
  {
    id: 'accounting_operating_result',
    label: 'Résultat d’exploitation comptable',
    unit: 'currency',
    help: 'Produits d’exploitation diminués de toutes les charges d’exploitation, amortissements inclus.',
  },
  {
    id: 'net_result',
    label: 'Résultat net',
    unit: 'currency',
    help: 'Résultat final après amortissements, résultat financier et impôts.',
  },
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
  'result_before_depreciation',
  'accounting_operating_result',
  'net_result',
  'average_ticket',
  'transactions',
  'cash',
  'fixed_costs',
  'break_even_day',
  'break_even_week',
  'break_even_month',
];

const REVENUE_PERCENT_KPI_IDS = new Set([
  'revenue',
  'operating_expenses',
  'payroll',
  'result_before_depreciation',
  'accounting_operating_result',
  'net_result',
  'contribution_margin',
  'fixed_costs',
]);

export function revenuePercentOf(id: string, value: number | null, revenue: number | null) {
  if (!REVENUE_PERCENT_KPI_IDS.has(id) || value == null || revenue == null || revenue === 0)
    return null;
  return round((value / revenue) * 100, 1);
}

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

export function countMonths(from: Date, to: Date) {
  return Math.max(
    1,
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1,
  );
}

function metricIsDisplayable(id: string, value: number | null) {
  if (value == null || !Number.isFinite(value)) return false;
  const absolute = Math.abs(value);
  if (
    id === 'result_before_depreciation' ||
    id === 'accounting_operating_result' ||
    id === 'net_result'
  )
    return absolute <= 1_000_000_000_000;
  if (value === 0) return false;
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

export function resolveFinanceAsOfDate(input: {
  requestedAsOf?: Date | null;
  latestSaleDate?: Date | null;
  latestCoverage?: Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const requestedAsOf = input.requestedAsOf;
  const selectedDate =
    requestedAsOf && !Number.isNaN(requestedAsOf.getTime())
      ? requestedAsOf
      : input.latestSaleDate && input.latestSaleDate <= now
        ? input.latestSaleDate
        : input.latestCoverage && input.latestCoverage <= now
          ? input.latestCoverage
          : now;
  return endOfUtcDay(selectedDate);
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

export function buildFinanceMonthlyComparisonRanges(
  monthStart: Date,
  monthlyActualTo: Date,
  monthlyIsComplete: boolean,
) {
  return [
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
      detail: 'Mois précédent complet',
      from: shiftMonth(monthStart, -1),
      to: endOfMonth(shiftMonth(monthStart, -1)),
      isCurrent: false,
    },
  ];
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

export function resolveFinanceStatementCategory(
  code: string,
  storedCategory: FinanceAccountCategory,
  countryCode?: string | null,
) {
  if (String(countryCode ?? '').toUpperCase() !== 'FI') return storedCategory;
  const accountNumber = Number.parseInt(code.replace(/\D/g, '').slice(0, 4), 10);
  if (accountNumber >= 1900 && accountNumber <= 1999) return FinanceAccountCategory.CASH;
  if (accountNumber >= 3000 && accountNumber <= 3999) return FinanceAccountCategory.REVENUE;
  if (accountNumber >= 4000 && accountNumber <= 4999)
    return FinanceAccountCategory.MATERIAL_PURCHASES;
  if (accountNumber >= 5000 && accountNumber <= 6799) return FinanceAccountCategory.PAYROLL;
  if (accountNumber >= 6800 && accountNumber <= 8999) return FinanceAccountCategory.OTHER_OPEX;
  if (accountNumber >= 9000 && accountNumber <= 9799) return FinanceAccountCategory.FINANCIAL;
  if (accountNumber >= 9800 && accountNumber <= 9999) return FinanceAccountCategory.TAX;
  return storedCategory;
}

export function deriveAccountingResults(input: {
  accountingRevenue: number | null;
  otherOperatingIncome?: number | null;
  operatingExpenses: number | null;
  depreciation: number | null;
  financialExpenses: number | null;
  taxes: number | null;
}) {
  if (input.accountingRevenue == null || input.operatingExpenses == null) {
    return {
      resultBeforeDepreciation: null,
      accountingOperatingResult: null,
      netResult: null,
    };
  }
  const accountingOperatingResult =
    input.accountingRevenue + numeric(input.otherOperatingIncome) - input.operatingExpenses;
  return {
    resultBeforeDepreciation: round(accountingOperatingResult + numeric(input.depreciation)),
    accountingOperatingResult: round(accountingOperatingResult),
    netResult: round(
      accountingOperatingResult - numeric(input.financialExpenses) - numeric(input.taxes),
    ),
  };
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

function normalizedRevenueText(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeRevenueChannel(value: string | null | undefined) {
  const normalized = normalizedRevenueText(value).replace(/[\s_-]+/g, '');
  if (!normalized || normalized === 'generic' || normalized === 'fennoa') return null;
  if (normalized.includes('flatpay')) return 'FLATPAY';
  if (
    normalized.includes('paypal') ||
    normalized.includes('zettle') ||
    normalized.includes('izettle')
  )
    return 'PAYPAL_POS';
  if (normalized.includes('loyverse') || normalized.includes('loysverse')) return 'LOYVERSE';
  if (normalized.includes('sumup')) return 'SUMUP';
  if (normalized.includes('stripe')) return 'STRIPE';
  if (normalized.includes('square')) return 'SQUARE';
  return null;
}

export function classifyAccountingRevenueEntry(
  entry: Pick<FinanceLedgerRevenueRow, 'description' | 'series' | 'entryType' | 'sourceEntityId'>,
): {
  kind: 'invoice' | 'pos_summary' | 'adjustment' | 'other';
  channel: string | null;
} {
  const series = normalizedRevenueText(entry.series).replace(/[\s_-]+/g, '');
  const description = normalizedRevenueText(entry.description);
  const sourceEntity = normalizedRevenueText(entry.sourceEntityId);
  const invoiceSeries = new Set(['in', 'inv', 'invoice', 'salesinvoice', 'si', 'ar']);
  if (
    invoiceSeries.has(series) ||
    /^\d+\s*-\s*\S+/.test(description) ||
    /\b(invoice|facture|sales invoice|myyntilasku|lasku)\b/.test(description) ||
    /\b(invoice|salesinvoice)\b/.test(sourceEntity)
  ) {
    return { kind: 'invoice', channel: null };
  }
  if (
    /tasmaytys|selvittamaton|reconciliation|rapprochement|adjustment|ajustement|rounding|arrondi|maksutapaero|payment method difference/.test(
      description,
    )
  ) {
    return { kind: 'adjustment', channel: null };
  }
  const channel = normalizeRevenueChannel(description);
  if (channel) return { kind: 'pos_summary', channel };
  return { kind: 'other', channel: null };
}

export function selectHybridFinanceRevenueForMonth({
  sales,
  accountingRows,
  periodEnd: _periodEnd,
  accountingLockedThrough: _accountingLockedThrough,
}: {
  sales: FinanceSalesRevenueRow[];
  accountingRows: FinanceLedgerRevenueRow[];
  periodEnd: Date;
  accountingLockedThrough: Date | null;
}): { value: number | null; basis: RevenueBasis; breakdown: FinanceRevenueBreakdown } {
  const directRevenue = sales.reduce((sum, item) => sum + numeric(item.netAmount), 0);
  const hasCashRegisterData = sales.some(
    (item) =>
      item.transactionCount !== 0 ||
      numeric(item.netAmount) !== 0 ||
      numeric(item.grossAmount) !== 0 ||
      numeric(item.vatAmount) !== 0,
  );
  const accountingRevenue = accountingRows.reduce(
    (sum, entry) => sum + numeric(entry.credit) - numeric(entry.debit),
    0,
  );
  const hasAccountingData = accountingRows.length > 0;
  const emptyBreakdown: FinanceRevenueBreakdown = {
    selectedCashRegisterRevenue: 0,
    selectedAccountingRevenue: 0,
    accountingInvoiceRevenue: 0,
    accountingFallbackRevenue: 0,
    accountingAdjustmentRevenue: 0,
    accountingOverlappingRevenue: 0,
    accountingOtherRevenue: 0,
  };
  // Une clôture rend les écritures immuables, mais ne garantit pas que tous les encaissements de
  // caisse y ont été intégrés. Dès que les tickets existent, ils restent donc la base opérationnelle
  // et seules les factures ou les caisses absentes sont ajoutées depuis la comptabilité.
  if (!hasCashRegisterData) {
    if (!hasAccountingData) return { value: null, basis: 'unavailable', breakdown: emptyBreakdown };
    return {
      value: round(accountingRevenue),
      basis: 'accounting',
      breakdown: { ...emptyBreakdown, selectedAccountingRevenue: round(accountingRevenue) },
    };
  }

  const directChannels = new Set<string>();
  for (const sale of sales) {
    const channel = normalizeRevenueChannel(sale.source?.provider ?? sale.paymentMethod);
    if (channel) directChannels.add(channel);
  }
  const breakdown = accountingRows.reduce<FinanceRevenueBreakdown>(
    (totals, entry) => {
      const amount = numeric(entry.credit) - numeric(entry.debit);
      const classification = classifyAccountingRevenueEntry(entry);
      if (classification.kind === 'invoice') totals.accountingInvoiceRevenue += amount;
      else if (classification.kind === 'adjustment') totals.accountingAdjustmentRevenue += amount;
      else if (classification.kind === 'pos_summary' && classification.channel) {
        if (directChannels.has(classification.channel))
          totals.accountingOverlappingRevenue += amount;
        else totals.accountingFallbackRevenue += amount;
      } else totals.accountingOtherRevenue += amount;
      return totals;
    },
    { ...emptyBreakdown, selectedCashRegisterRevenue: directRevenue },
  );
  const accountingAdditions =
    breakdown.accountingInvoiceRevenue + breakdown.accountingFallbackRevenue;
  const basis: RevenueBasis = accountingAdditions !== 0 ? 'mixed' : 'cash_register';
  return {
    value: round(directRevenue + accountingAdditions),
    basis,
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([key, value]) => [key, round(value)]),
    ) as FinanceRevenueBreakdown,
  };
}

type FinanceRevenueSelection = ReturnType<typeof selectHybridFinanceRevenueForMonth>;

export function applyAccountingRevenueControl({
  partial,
  fullMonth,
  accountingRevenue,
  accountingTruthAvailable,
  coversFullMonth,
}: {
  partial: FinanceRevenueSelection;
  fullMonth: FinanceRevenueSelection;
  accountingRevenue: number | null;
  accountingTruthAvailable: boolean;
  coversFullMonth: boolean;
}): FinanceRevenueSelection {
  if (!accountingTruthAvailable || accountingRevenue == null) return partial;
  const emptyBreakdown: FinanceRevenueBreakdown = {
    selectedCashRegisterRevenue: 0,
    selectedAccountingRevenue: 0,
    accountingInvoiceRevenue: 0,
    accountingFallbackRevenue: 0,
    accountingAdjustmentRevenue: 0,
    accountingOverlappingRevenue: 0,
    accountingOtherRevenue: 0,
  };
  if (coversFullMonth) {
    return {
      value: round(accountingRevenue),
      basis: 'accounting',
      breakdown: {
        ...emptyBreakdown,
        selectedAccountingRevenue: round(accountingRevenue),
      },
    };
  }

  const fullMonthValue = fullMonth.value;
  if (fullMonthValue == null || Math.abs(fullMonthValue) < 0.005) return partial;
  const controlledValue = round((numeric(partial.value) / fullMonthValue) * accountingRevenue);
  const scale =
    partial.value == null || Math.abs(partial.value) < 0.005 ? 0 : controlledValue / partial.value;
  return {
    value: controlledValue,
    basis: 'mixed',
    breakdown: Object.fromEntries(
      Object.entries(partial.breakdown).map(([key, value]) => [key, round(value * scale)]),
    ) as FinanceRevenueBreakdown,
  };
}

export function hasAccountingTruthForMonth({
  periodEnd,
  accountingLockedThrough,
  accountingCoverageThrough,
  hasAccountingRevenueRows,
}: {
  periodEnd: Date;
  accountingLockedThrough: Date | null;
  accountingCoverageThrough?: Date | null;
  hasAccountingRevenueRows: boolean;
}) {
  const coverageIsComplete = Boolean(
    accountingCoverageThrough && endOfUtcDay(accountingCoverageThrough) >= periodEnd,
  );
  const lockedMonthHasRevenueEntries = Boolean(
    hasAccountingRevenueRows &&
    accountingLockedThrough &&
    endOfUtcDay(accountingLockedThrough) >= periodEnd,
  );
  return coverageIsComplete || lockedMonthHasRevenueEntries;
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

type FinanceAccountingPeriodRange = {
  externalId: number;
  startDate: Date;
  endDate: Date;
};

export function resolveFinanceFiscalPeriod(
  periods: FinanceAccountingPeriodRange[],
  asOf: Date,
  fiscalYearStartMonth: number,
) {
  const selectedDay = startOfUtcDay(asOf);
  const accountingPeriod = periods
    .map((period) => ({
      ...period,
      startDate: startOfUtcDay(period.startDate),
      endDate: endOfUtcDay(period.endDate),
    }))
    .filter(({ startDate, endDate }) => startDate <= selectedDay && endDate >= selectedDay)
    .sort((left, right) => right.startDate.getTime() - left.startDate.getTime())[0];
  if (accountingPeriod) {
    return {
      ...accountingPeriod,
      source: 'accounting_period' as const,
    };
  }

  const fiscalStartMonth = Math.min(12, Math.max(1, fiscalYearStartMonth)) - 1;
  const fiscalStartYear =
    asOf.getUTCMonth() < fiscalStartMonth ? asOf.getUTCFullYear() - 1 : asOf.getUTCFullYear();
  const startDate = new Date(Date.UTC(fiscalStartYear, fiscalStartMonth, 1));
  return {
    externalId: null,
    startDate,
    endDate: new Date(
      Date.UTC(startDate.getUTCFullYear() + 1, startDate.getUTCMonth(), 0, 23, 59, 59, 999),
    ),
    source: 'settings' as const,
  };
}

export function alignFinanceAccountingPeriods(
  periods: FinanceAccountingPeriodRange[],
  selected: ReturnType<typeof resolveFinanceFiscalPeriod>,
  actualTo: Date,
  limit = 4,
) {
  if (selected.source !== 'accounting_period') return [];
  const elapsedDays = Math.max(
    0,
    Math.floor(
      (startOfUtcDay(actualTo).getTime() - startOfUtcDay(selected.startDate).getTime()) /
        86_400_000,
    ),
  );
  return periods
    .map((period) => ({
      ...period,
      startDate: startOfUtcDay(period.startDate),
      endDate: endOfUtcDay(period.endDate),
    }))
    .filter(({ startDate }) => startDate <= selected.startDate)
    .sort((left, right) => right.startDate.getTime() - left.startDate.getTime())
    .slice(0, limit)
    .map((period) => ({
      ...period,
      from: period.startDate,
      to: new Date(
        Math.min(
          period.endDate.getTime(),
          endOfUtcDay(shiftDays(period.startDate, elapsedDays)).getTime(),
        ),
      ),
    }));
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
    const [accounts, sources, settings, budgetPlans, fennoaBudgetLines, organization, periods] =
      await Promise.all([
        this.prisma.financeAccount.findMany({ where: { organizationId } }),
        this.prisma.financeDataSource.findMany({ where: { organizationId } }),
        this.prisma.financeSettings.findUnique({ where: { organizationId } }),
        this.prisma.financeBudgetPlan.findMany({
          where: { organizationId },
          include: {
            lines: { orderBy: { periodStart: 'asc' } },
            site: { select: { id: true, name: true } },
            importBatch: {
              select: { source: { select: { siteId: true } } },
            },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.financeBudgetLine.findMany({
          where: { organizationId },
          orderBy: [
            { accountingPeriodExternalId: 'asc' },
            { externalBudgetId: 'desc' },
            { month: 'asc' },
          ],
        }),
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { mistralApiKey: true, regulatoryCountryCode: true },
        }),
        this.prisma.financeAccountingPeriod.findMany({
          where: { organizationId },
          orderBy: { startDate: 'asc' },
        }),
      ]);
    const scopedSources = query.siteId
      ? sources.filter(({ siteId }) => siteId === query.siteId)
      : sources;
    const allContributingSalesSourceIds = resolveContributingSalesSourceIds(
      sources.filter(({ sourceType }) => sourceType !== 'ACCOUNTING_API'),
    );
    const contributingSalesSourceIds = resolveContributingSalesSourceIds(
      scopedSources.filter(({ sourceType }) => sourceType !== 'ACCOUNTING_API'),
    );
    const contributingSalesSourceIdSet = new Set(contributingSalesSourceIds);
    const latestContributingSale = contributingSalesSourceIds.length
      ? await this.prisma.financeDailySales.findFirst({
          where: {
            organizationId,
            sourceId: { in: contributingSalesSourceIds },
            saleDate: { lte: now },
            isRevenueRecord: true,
            OR: [{ transactionCount: { gt: 0 } }, { netAmount: { not: 0 } }],
          },
          select: { saleDate: true },
          orderBy: { saleDate: 'desc' },
        })
      : null;
    const latestCoverage = scopedSources
      .map(({ coverageEnd }) => coverageEnd)
      .filter((value): value is Date => Boolean(value && value <= now))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    let earliestRelevantCoverage = scopedSources
      .filter(
        ({ id, sourceType }) =>
          contributingSalesSourceIdSet.has(id) || sourceType === 'ACCOUNTING_API',
      )
      .map(({ coverageStart }) => coverageStart)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => left.getTime() - right.getTime())[0];
    const requestedAsOf = query.to ? new Date(query.to) : null;
    const asOf = resolveFinanceAsOfDate({
      requestedAsOf,
      latestSaleDate: latestContributingSale?.saleDate,
      latestCoverage,
      now,
    });
    const fiscalPeriod = resolveFinanceFiscalPeriod(periods, asOf, fiscalYearStartMonth);
    const fiscalStart = fiscalPeriod.startDate;
    const fiscalEnd = fiscalPeriod.endDate;
    const fennoaSource = sources.find(({ provider }) => provider === 'FENNOA');
    const configuredSalesSiteIds = [
      ...new Set(
        sources
          .filter(({ sourceType }) => sourceType !== 'ACCOUNTING_API')
          .map(({ siteId }) => siteId)
          .filter((siteId): siteId is string => Boolean(siteId)),
      ),
    ];
    const globalBudgetCanFollowSelectedSite = Boolean(
      query.siteId &&
      configuredSalesSiteIds.length === 1 &&
      configuredSalesSiteIds[0] === query.siteId,
    );
    const budgetCandidates: FinanceBudgetCandidate[] = [
      ...listFennoaBudgets(fennoaBudgetLines, fiscalPeriod.externalId)
        .filter(
          () =>
            !query.siteId ||
            globalBudgetCanFollowSelectedSite ||
            fennoaSource?.siteId === query.siteId,
        )
        .map((budget) => ({
          id: `fennoa:${fiscalPeriod.externalId}:${budget.externalBudgetId ?? 'sans-id'}`,
          siteId: fennoaSource?.siteId ?? null,
          site: null,
          name: budget.name,
          scenario: 'Fennoa',
          currency: settings?.defaultCurrency ?? 'EUR',
          startDate: fiscalStart,
          endDate: fiscalEnd,
          source: 'FENNOA',
          isReference: false,
          lines: fennoaBudgetMetricLines(budget.lines, fiscalStart),
        })),
      ...budgetPlans
        .filter(({ startDate, endDate, siteId }) => {
          if (startDate > fiscalEnd || endDate < fiscalStart) return false;
          if (query.siteId)
            return siteId === query.siteId || (!siteId && globalBudgetCanFollowSelectedSite);
          if (configuredSalesSiteIds.length > 1) return siteId == null;
          return !siteId || siteId === configuredSalesSiteIds[0];
        })
        .map((budget) => ({
          id: budget.id,
          siteId: budget.siteId,
          site: budget.site,
          name: budget.name,
          scenario: budget.scenario,
          currency: budget.currency,
          startDate: budget.startDate,
          endDate: budget.endDate,
          source: budget.source,
          isReference: budget.isReference,
          lines: budget.lines,
        })),
    ];
    const selectionKey = financeBudgetSelectionKey(fiscalStart, fiscalEnd, query.siteId);
    const storedSelections =
      settings?.budgetSelections &&
      typeof settings.budgetSelections === 'object' &&
      !Array.isArray(settings.budgetSelections)
        ? (settings.budgetSelections as Record<string, unknown>)
        : {};
    const selectedBudgetId =
      typeof storedSelections[selectionKey] === 'string' ? storedSelections[selectionKey] : null;
    const budgetPlan =
      budgetCandidates.find(({ id }) => id === selectedBudgetId) ??
      budgetCandidates.find(({ isReference, source }) => isReference && source !== 'FENNOA') ??
      budgetCandidates[0] ??
      null;
    const annualBudgetTo = endOfMonth(asOf) > fiscalEnd ? fiscalEnd : endOfMonth(asOf);
    const annualActualTo = asOf > fiscalEnd ? fiscalEnd : asOf;
    const alignedAccountingPeriods = alignFinanceAccountingPeriods(
      periods,
      fiscalPeriod,
      annualActualTo,
    );
    const fallbackReadFrom = shiftYear(fiscalStart, -3);
    const earliestComparisonStart = alignedAccountingPeriods.at(-1)?.startDate;
    const readFrom =
      earliestComparisonStart && earliestComparisonStart < fallbackReadFrom
        ? earliestComparisonStart
        : fallbackReadFrom;
    const [allLedger, importedSales, activeSalesSources] = await Promise.all([
      this.prisma.financeLedgerEntry.findMany({
        where: {
          organizationId,
          entryDate: { gte: readFrom, lte: annualBudgetTo },
        },
        orderBy: { entryDate: 'asc' },
      }),
      this.prisma.financeDailySales.findMany({
        where: {
          organizationId,
          saleDate: { gte: readFrom, lte: annualBudgetTo },
          isRevenueRecord: true,
          sourceId: { in: contributingSalesSourceIds },
        },
        include: { source: { select: { isPrimaryPos: true, provider: true, siteId: true } } },
        orderBy: { saleDate: 'asc' },
      }),
      this.prisma.financeDataSource.findMany({
        where: {
          organizationId,
          id: { in: allContributingSalesSourceIds },
          siteId: { not: null },
          dailySales: {
            some: {
              saleDate: { gte: fiscalStart, lte: annualActualTo },
              isRevenueRecord: true,
            },
          },
        },
        select: { siteId: true },
      }),
    ]);
    const activeSalesSiteIds = [
      ...new Set(
        activeSalesSources
          .map(({ siteId }) => siteId)
          .filter((siteId): siteId is string => Boolean(siteId)),
      ),
    ];
    const ledgerSourceIds = new Set(allLedger.map(({ sourceId }) => sourceId));
    const directAccountingSourceIds = query.siteId
      ? sources
          .filter(
            ({ id, siteId, sourceType }) =>
              siteId === query.siteId &&
              (sourceType === 'ACCOUNTING_API' || ledgerSourceIds.has(id)),
          )
          .map(({ id }) => id)
      : sources
          .filter(
            ({ id, sourceType }) => sourceType === 'ACCOUNTING_API' || ledgerSourceIds.has(id),
          )
          .map(({ id }) => id);
    const globalAccountingSourceIds = sources
      .filter(
        ({ id, siteId, sourceType }) =>
          !siteId && (sourceType === 'ACCOUNTING_API' || ledgerSourceIds.has(id)),
      )
      .map(({ id }) => id);
    const dataScope = resolveFinanceSiteDataScope({
      siteId: query.siteId,
      activeSalesSiteIds,
      directAccountingSourceIds,
      globalAccountingSourceIds,
      budgetSiteId: budgetPlan?.siteId,
      hasBudget: Boolean(budgetPlan),
    });
    const accountingSourceIdSet = new Set(dataScope.accountingSourceIds);
    const ledger = query.siteId
      ? allLedger.filter(({ sourceId }) => accountingSourceIdSet.has(sourceId))
      : allLedger;
    if (query.siteId && dataScope.accountingSourceIds.length) {
      const accountingSources = sources.filter(({ id }) => accountingSourceIdSet.has(id));
      earliestRelevantCoverage = [...scopedSources, ...accountingSources]
        .filter(
          ({ id, sourceType }) =>
            contributingSalesSourceIdSet.has(id) || sourceType === 'ACCOUNTING_API',
        )
        .map(({ coverageStart }) => coverageStart)
        .filter((value): value is Date => Boolean(value))
        .sort((left, right) => left.getTime() - right.getTime())[0];
    }
    const sales = deduplicateCrossSourceSales(importedSales).rows;
    const statementCountryCode = sources.some(({ provider }) => provider === 'FENNOA')
      ? 'FI'
      : organization?.regulatoryCountryCode;
    const selectedAccountingSourceIds = query.siteId
      ? dataScope.accountingSourceIds
      : directAccountingSourceIds;
    const selectedAccountingSources = sources.filter(({ id }) =>
      selectedAccountingSourceIds.includes(id),
    );
    const accountingCoverageThrough =
      selectedAccountingSources.length > 0 &&
      selectedAccountingSources.every(({ coverageEnd }) => Boolean(coverageEnd))
        ? selectedAccountingSources
            .map(({ coverageEnd }) => coverageEnd!)
            .sort((left, right) => left.getTime() - right.getTime())[0]
        : null;
    const categoryByCode = new Map(
      accounts.map(({ code, category, categoryOverride }) => [
        code,
        categoryOverride
          ? category
          : resolveFinanceStatementCategory(code, category, statementCountryCode),
      ]),
    );
    const statementOptions = {
      finnishChart: statementCountryCode === 'FI',
      accountingCoverageThrough,
    };
    const accountingLockedThrough = this.accountingLockedThrough(periods);
    const cash =
      query.siteId && dataScope.accountingMode === 'unavailable'
        ? null
        : await this.cashBalanceFor(
            organizationId,
            accounts,
            annualActualTo,
            query.siteId ? dataScope.accountingSourceIds : undefined,
          );
    const annualActual = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      fiscalStart,
      annualActualTo,
      accountingLockedThrough,
      statementOptions,
    );
    const previousAccountingPeriod = alignedAccountingPeriods[1];
    const annualPrevious = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      previousAccountingPeriod?.from ?? shiftYear(fiscalStart, -1),
      previousAccountingPeriod?.to ?? shiftYear(annualActualTo, -1),
      accountingLockedThrough,
      statementOptions,
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
      statementOptions,
    );
    const monthlyPrevious = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      shiftYear(monthStart, -1),
      shiftYear(monthlyActualTo, -1),
      accountingLockedThrough,
      statementOptions,
    );
    const dailyActual = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      startOfUtcDay(asOf),
      endOfUtcDay(asOf),
      accountingLockedThrough,
      statementOptions,
    );
    const dailyPrevious = this.aggregate(
      ledger,
      sales,
      categoryByCode,
      shiftYear(startOfUtcDay(asOf), -1),
      shiftYear(endOfUtcDay(asOf), -1),
      accountingLockedThrough,
      statementOptions,
    );
    const budgetMatchesFiscalPeriod = Boolean(
      budgetPlan && budgetPlan.startDate <= fiscalEnd && budgetPlan.endDate >= fiscalStart,
    );
    const budgetLines =
      dataScope.includeBudget && budgetMatchesFiscalPeriod ? (budgetPlan?.lines ?? []) : [];
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
      fiscalEnd,
      ledger,
      sales,
      categoryByCode,
      budgetLines,
      accountingLockedThrough,
      statementOptions,
    );
    const dailySeries = this.dailySeries(
      monthStart,
      monthlyActualTo,
      sales,
      allocateMonthlyBudgetPerCalendarDay(monthStart, monthlyBudget),
    );
    const elapsedMonths = Math.max(
      0,
      series.filter(({ periodStart }) => sameOrBeforeMonth(new Date(periodStart), annualBudgetTo))
        .length,
    );
    const totalMonths = series.length || 12;
    const health = this.health([...annual.core, ...annual.optional]);
    const selectedKpis = settings?.dashboardKpis?.length ? settings.dashboardKpis : DEFAULT_KPI_IDS;
    const period = resolveFinancePeriod(query, fiscalYearStartMonth, asOf);
    const legacyMetrics = [...annual.core, ...annual.optional].map((metric) =>
      this.legacyMetric(metric, asOf, provisional),
    );
    const annualComparisonRanges = alignedAccountingPeriods.length
      ? alignedAccountingPeriods.map((accountingPeriod, index) => {
          const startYear = accountingPeriod.startDate.getUTCFullYear();
          const endYear = accountingPeriod.endDate.getUTCFullYear();
          const exactPeriod = `${accountingPeriod.startDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} → ${accountingPeriod.endDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`;
          return {
            id: index === 0 ? 'current' : `period_${accountingPeriod.externalId}`,
            label: startYear === endYear ? String(startYear) : `${startYear}–${endYear}`,
            detail:
              index === 0
                ? `Exercice comptable sélectionné · ${exactPeriod}`
                : `Même avancement · exercice comptable ${exactPeriod}`,
            from: accountingPeriod.from,
            to: accountingPeriod.to,
            isCurrent: index === 0,
          };
        })
      : Array.from({ length: 4 }, (_, offset) => {
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
        });
    const annualComparison = this.historicalComparison(
      'annual',
      annualComparisonRanges,
      ledger,
      sales,
      categoryByCode,
      accountingLockedThrough,
      statementOptions,
    );
    const monthlyComparison = this.historicalComparison(
      'monthly',
      buildFinanceMonthlyComparisonRanges(monthStart, monthlyActualTo, monthlyIsComplete),
      ledger,
      sales,
      categoryByCode,
      accountingLockedThrough,
      statementOptions,
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
      statementOptions,
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
          resultBeforeDepreciation: monthlyActual.resultBeforeDepreciation,
          accountingOperatingResult: monthlyActual.accountingOperatingResult,
          depreciation: monthlyActual.depreciation,
          financialExpenses: monthlyActual.financialExpenses,
          netResult: monthlyActual.netResult,
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
            ? `Du ${earliestRelevantCoverage.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au ${asOf.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`
            : `Données disponibles jusqu’au ${asOf.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`,
          dataCoverageStart: earliestRelevantCoverage ?? null,
          coverageComplete: Boolean(
            earliestRelevantCoverage &&
            earliestRelevantCoverage <= fiscalStart &&
            annualActual.operatingExpenses != null,
          ),
          budgetCoverageLabel: dataScope.includeBudget
            ? budgetPlan && budgetMatchesFiscalPeriod
              ? `${elapsedMonths} mois comparés aux ${elapsedMonths} mêmes mois budgétés`
              : `Aucun budget pour l’exercice ${fiscalStart.getUTCFullYear()}–${fiscalEnd.getUTCFullYear()}`
            : 'Budget non affecté à cet établissement',
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
          label: `Exercice comptable · ${elapsedMonths}/${totalMonths} mois`,
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
          budgetPlan && dataScope.includeBudget
            ? {
                id: budgetPlan.id,
                siteId: budgetPlan.siteId,
                site: budgetPlan.site,
                name: budgetPlan.name,
                scenario: budgetPlan.scenario,
                currency: budgetPlan.currency,
                source: budgetPlan.source,
                startDate: budgetPlan.startDate,
                endDate: budgetPlan.endDate,
                isReference: true,
                totals: this.budgetAggregate(budgetLines, budgetPlan.startDate, budgetPlan.endDate),
                targets: this.budgetTargets(budgetLines, asOf),
                series,
              }
            : null,
        budgetOptions: budgetCandidates.map((candidate) => ({
          id: candidate.id,
          siteId: candidate.siteId,
          site: candidate.site,
          name: candidate.name,
          scenario: candidate.scenario,
          currency: candidate.currency,
          source: candidate.source,
          startDate: candidate.startDate,
          endDate: candidate.endDate,
          selected: candidate.id === budgetPlan?.id,
          totals: this.budgetAggregate(candidate.lines, candidate.startDate, candidate.endDate),
        })),
        preferences: { selected: selectedKpis, available: OPTIONAL_KPIS },
        mistral: { configured: Boolean(organization?.mistralApiKey) },
      },
      dataScope: {
        ...dataScope,
        activeSalesSiteIds,
      },
    };
  }

  private aggregate(
    ledger: FinanceLedgerRevenueRow[],
    sales: FinanceSalesRevenueRow[],
    categories: Map<string, FinanceAccountCategory>,
    from: Date,
    to: Date,
    accountingLockedThrough: Date | null,
    options: FinanceAggregateOptions = {},
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
    const allLedgerRevenueRows = ledger.filter(
      ({ accountCode }) =>
        (categories.get(accountCode) ?? FinanceAccountCategory.OTHER) ===
        FinanceAccountCategory.REVENUE,
    );
    const ledgerRevenueRows = allLedgerRevenueRows.filter(
      ({ entryDate }) => entryDate >= from && entryDate <= to,
    );
    const isOtherOperatingIncomeAccount = ({ accountCode }: { accountCode: string }) => {
      if (!options.finnishChart) return false;
      const accountNumber = Number.parseInt(accountCode.replace(/\D/g, '').slice(0, 4), 10);
      return accountNumber >= 3900 && accountNumber <= 3999;
    };
    const otherOperatingIncomeRows = options.finnishChart
      ? ledgerRevenueRows.filter(isOtherOperatingIncomeAccount)
      : [];
    const ledgerTurnoverRows = ledgerRevenueRows.filter(
      (entry) => !isOtherOperatingIncomeAccount(entry),
    );
    const allLedgerTurnoverRows = allLedgerRevenueRows.filter(
      (entry) => !isOtherOperatingIncomeAccount(entry),
    );
    const accountingRevenue = ledgerTurnoverRows.length
      ? ledgerTurnoverRows.reduce(
          (sum, entry) => sum + numeric(entry.credit) - numeric(entry.debit),
          0,
        )
      : null;
    const otherOperatingIncome = otherOperatingIncomeRows.reduce(
      (sum, entry) => sum + numeric(entry.credit) - numeric(entry.debit),
      0,
    );
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
    const revenueSelections: Array<ReturnType<typeof selectHybridFinanceRevenueForMonth>> = [];
    let cursor = from;
    while (cursor <= to) {
      const fullMonthStart = startOfMonth(cursor);
      const fullMonthEnd = endOfMonth(cursor);
      const sliceEnd = new Date(Math.min(fullMonthEnd.getTime(), to.getTime()));
      const sliceLedgerRevenueRows = ledgerTurnoverRows.filter(
        ({ entryDate }) => entryDate >= cursor && entryDate <= sliceEnd,
      );
      const sliceSales = selectedSales.filter(
        ({ saleDate }) => saleDate >= cursor && saleDate <= sliceEnd,
      );
      const fullMonthLedgerRevenueRows = allLedgerTurnoverRows.filter(
        ({ entryDate }) => entryDate >= fullMonthStart && entryDate <= fullMonthEnd,
      );
      const fullMonthSales = sales.filter(
        ({ saleDate }) => saleDate >= fullMonthStart && saleDate <= fullMonthEnd,
      );
      const partialSelection = selectHybridFinanceRevenueForMonth({
        sales: sliceSales,
        accountingRows: sliceLedgerRevenueRows,
        periodEnd: sliceEnd,
        accountingLockedThrough,
      });
      const fullMonthSelection = selectHybridFinanceRevenueForMonth({
        sales: fullMonthSales,
        accountingRows: fullMonthLedgerRevenueRows,
        periodEnd: fullMonthEnd,
        accountingLockedThrough,
      });
      const accountingTruthAvailable = hasAccountingTruthForMonth({
        periodEnd: fullMonthEnd,
        accountingLockedThrough,
        accountingCoverageThrough: options.accountingCoverageThrough,
        hasAccountingRevenueRows: fullMonthLedgerRevenueRows.length > 0,
      });
      const fullMonthAccountingRevenue =
        accountingTruthAvailable || fullMonthLedgerRevenueRows.length
          ? fullMonthLedgerRevenueRows.reduce(
              (sum, entry) => sum + numeric(entry.credit) - numeric(entry.debit),
              0,
            )
          : null;
      revenueSelections.push(
        applyAccountingRevenueControl({
          partial: partialSelection,
          fullMonth: fullMonthSelection,
          accountingRevenue: fullMonthAccountingRevenue,
          accountingTruthAvailable,
          coversFullMonth: cursor <= fullMonthStart && sliceEnd >= fullMonthEnd,
        }),
      );
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    const selectedRevenue = revenueSelections.filter(
      (selection): selection is typeof selection & { value: number } => selection.value != null,
    );
    const operationalRevenue = selectedRevenue.length
      ? selectedRevenue.reduce((sum, selection) => sum + selection.value, 0)
      : null;
    const selectedBases = new Set(
      selectedRevenue.map(({ basis }) => basis).filter((basis) => basis !== 'unavailable'),
    );
    const operationalRevenueBasis: RevenueBasis =
      selectedBases.size > 1
        ? 'mixed'
        : (([...selectedBases][0] as RevenueBasis | undefined) ?? 'unavailable');
    const revenue = options.revenuePolicy === 'accounting' ? accountingRevenue : operationalRevenue;
    const revenueBasis: RevenueBasis =
      options.revenuePolicy === 'accounting'
        ? accountingRevenue == null
          ? 'unavailable'
          : 'accounting'
        : operationalRevenueBasis;
    const operationalRevenueBreakdown = revenueSelections.reduce<FinanceRevenueBreakdown>(
      (totals, selection) => {
        for (const key of Object.keys(totals) as Array<keyof FinanceRevenueBreakdown>) {
          totals[key] += selection.breakdown[key];
        }
        return totals;
      },
      {
        selectedCashRegisterRevenue: 0,
        selectedAccountingRevenue: 0,
        accountingInvoiceRevenue: 0,
        accountingFallbackRevenue: 0,
        accountingAdjustmentRevenue: 0,
        accountingOverlappingRevenue: 0,
        accountingOtherRevenue: 0,
      },
    );
    const revenueBreakdown: FinanceRevenueBreakdown =
      options.revenuePolicy === 'accounting'
        ? {
            selectedCashRegisterRevenue: 0,
            selectedAccountingRevenue: round(numeric(accountingRevenue)),
            accountingInvoiceRevenue: 0,
            accountingFallbackRevenue: 0,
            accountingAdjustmentRevenue: 0,
            accountingOverlappingRevenue: 0,
            accountingOtherRevenue: 0,
          }
        : (Object.fromEntries(
            Object.entries(operationalRevenueBreakdown).map(([key, value]) => [key, round(value)]),
          ) as FinanceRevenueBreakdown);
    const materialPurchases = hasLedger
      ? (buckets.get(FinanceAccountCategory.MATERIAL_PURCHASES) ?? 0)
      : null;
    const payroll = hasLedger ? (buckets.get(FinanceAccountCategory.PAYROLL) ?? 0) : null;
    const otherOpex = hasLedger ? (buckets.get(FinanceAccountCategory.OTHER_OPEX) ?? 0) : null;
    const operatingExpenses = hasLedger
      ? numeric(materialPurchases) + numeric(payroll) + numeric(otherOpex)
      : null;
    const selectedOperatingIncome = revenue == null ? null : revenue + otherOperatingIncome;
    const operatingResult =
      selectedOperatingIncome != null && operatingExpenses != null
        ? selectedOperatingIncome - operatingExpenses
        : null;
    const depreciation = hasLedger
      ? selectedLedger
          .filter(({ accountCode }) => {
            const accountNumber = Number.parseInt(accountCode.replace(/\D/g, '').slice(0, 4), 10);
            return accountNumber >= 6800 && accountNumber <= 6899;
          })
          .reduce((sum, entry) => sum + numeric(entry.debit) - numeric(entry.credit), 0)
      : null;
    const financialExpenses = hasLedger
      ? (buckets.get(FinanceAccountCategory.FINANCIAL) ?? 0)
      : null;
    const taxes = hasLedger ? (buckets.get(FinanceAccountCategory.TAX) ?? 0) : null;
    const accountingResults = deriveAccountingResults({
      accountingRevenue,
      otherOperatingIncome,
      operatingExpenses,
      depreciation,
      financialExpenses,
      taxes,
    });
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
      otherOperatingIncome: round(otherOperatingIncome),
      depreciation: depreciation == null ? null : round(depreciation),
      financialExpenses: financialExpenses == null ? null : round(financialExpenses),
      taxes: taxes == null ? null : round(taxes),
      ...accountingResults,
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
      accountingRevenue: accountingRevenue == null ? null : round(accountingRevenue),
      revenueDifference:
        hasCashRegisterData && accountingRevenue != null
          ? round(accountingRevenue - salesNet)
          : null,
      revenueBasis,
      revenueBreakdown,
      metricSources: {
        revenue: revenueBasis,
        operating_expenses: operatingExpenses == null ? 'unavailable' : 'accounting',
        payroll: payroll == null ? 'unavailable' : 'accounting',
        operating_result: blendedSource(operatingResult),
        result_before_depreciation:
          accountingResults.resultBeforeDepreciation == null ? 'unavailable' : 'accounting',
        accounting_operating_result:
          accountingResults.accountingOperatingResult == null ? 'unavailable' : 'accounting',
        net_result: accountingResults.netResult == null ? 'unavailable' : 'accounting',
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
      otherOperatingIncome: get('other_operating_income'),
      materialPurchases: get('material_purchases'),
      payroll: get('payroll'),
      depreciation: get('depreciation'),
      otherOpex: get('other_opex'),
      operatingExpenses: get('operating_expenses'),
      resultBeforeDepreciation: get('result_before_depreciation'),
      operatingResult: get('operating_result'),
      financialResult: get('financial_result'),
      taxes: get('taxes'),
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
      this.comparisonMetric(
        'result_before_depreciation',
        'Résultat avant amortissements',
        actual.resultBeforeDepreciation,
        budget.resultBeforeDepreciation,
        previous.resultBeforeDepreciation,
        false,
        'currency',
        'Résultat comptable de l’activité avant les dotations aux amortissements.',
        provisional,
      ),
      this.comparisonMetric(
        'accounting_operating_result',
        'Résultat d’exploitation comptable',
        actual.accountingOperatingResult,
        budget.operatingResult,
        previous.accountingOperatingResult,
        false,
        'currency',
        'Produits d’exploitation diminués de toutes les charges d’exploitation, amortissements inclus.',
        provisional,
      ),
      this.comparisonMetric(
        'net_result',
        'Résultat net',
        actual.netResult,
        budget.netResult,
        previous.netResult,
        false,
        'currency',
        'Résultat final après amortissements, résultat financier et impôts.',
        provisional,
      ),
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
    const withRevenuePercent = (metric: DashboardMetric): DashboardMetric => ({
      ...metric,
      revenuePercent: revenuePercentOf(metric.id, metric.value, actual.revenue),
    });
    return {
      kind,
      core: core.map(withRevenuePercent),
      optional:
        kind === 'daily'
          ? optional
              .filter(({ id }) => id !== 'break_even_week' && id !== 'break_even_month')
              .map(withRevenuePercent)
          : optional.map(withRevenuePercent),
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
    options: FinanceAggregateOptions = {},
  ) {
    return {
      modeLabel:
        kind === 'annual'
          ? 'Exercices comparés au même stade'
          : kind === 'monthly'
            ? 'Comparaison mensuelle sur les périodes indiquées'
            : 'Jours de semaine équivalents',
      periods: ranges.map((range) => {
        const actual = this.aggregate(
          ledger,
          sales,
          categories,
          range.from,
          range.to,
          accountingLockedThrough,
          options,
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
    options: FinanceAggregateOptions = {},
  ) {
    const result = [];
    let cursor = startOfMonth(start);
    let cumulativeActual = 0;
    let cumulativeBudget = 0;
    while (cursor <= endOfMonth(end)) {
      const monthEnd = endOfMonth(cursor);
      const periodFrom = cursor < start ? start : cursor;
      const periodTo = monthEnd > end ? end : monthEnd;
      const actual = this.aggregate(
        ledger,
        sales,
        categories,
        periodFrom,
        periodTo,
        accountingLockedThrough,
        options,
      );
      const budget = this.budgetAggregate(budgetLines, periodFrom, periodTo);
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
    dailyBudget?: { revenue: number | null; operatingResult: number | null },
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
    const result: Array<{
      date: string;
      revenue: number;
      transactions: number;
      budgetRevenue: number | null;
      budgetResult: number | null;
    }> = [];
    for (let cursor = startOfUtcDay(start); cursor <= end; cursor = shiftDays(cursor, 1)) {
      const date = utcDateKey(cursor);
      const values = byDay.get(date) ?? { revenue: 0, transactions: 0 };
      result.push({
        date,
        revenue: round(values.revenue),
        transactions: values.transactions,
        budgetRevenue: dailyBudget?.revenue ?? null,
        budgetResult: dailyBudget?.operatingResult ?? null,
      });
    }
    return result;
  }

  private async cashBalanceFor(
    organizationId: string,
    accounts: Array<{ code: string; category: FinanceAccountCategory }>,
    to: Date,
    sourceIds?: string[],
  ) {
    const cashCodes = accounts
      .filter(({ category }) => category === FinanceAccountCategory.CASH)
      .map(({ code }) => code);
    if (!cashCodes.length) return null;
    const rows = await this.prisma.financeLedgerEntry.findMany({
      where: {
        organizationId,
        accountCode: { in: cashCodes },
        entryDate: { lte: to },
        ...(sourceIds ? { sourceId: { in: sourceIds } } : {}),
      },
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
    const result = core.find(({ id }) => id === 'accounting_operating_result');
    const requiredIds = new Set([
      'revenue',
      'operating_expenses',
      'payroll',
      'accounting_operating_result',
    ]);
    if (core.some(({ id, value }) => requiredIds.has(id) && value == null))
      return {
        level: 'unknown',
        label: 'Lecture incomplète',
        summary:
          'Les ventes visibles sont réelles, mais les données comptables enregistrées ne couvrent pas encore ce périmètre. Vérifiez la période synchronisée ou l’affectation aux établissements avant de conclure sur la rentabilité.',
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
      breakdown: actual.revenueBreakdown,
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
