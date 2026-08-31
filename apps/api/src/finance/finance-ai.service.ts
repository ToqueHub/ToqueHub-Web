import { BadRequestException, Injectable } from '@nestjs/common';
import { FinanceAccountCategory, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { MistralClientService } from '../mistral/mistral-client.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AcceptFinanceBudgetSuggestionDto,
  FinanceAiAnalysisDto,
  SuggestFinanceBudgetDto,
} from './dto/finance.dto';
import {
  FinanceAnalyticsService,
  countMonths,
  financeBudgetSelectionKey,
} from './finance-analytics.service';
import {
  FINANCE_ANALYSIS_SKILL,
  FINANCE_BUDGET_SKILL,
  financeMistralOptions,
} from './finance-ai-skills';
import { FinancePolicy } from './finance.policy';
import { FinanceSalesInsightsService } from './finance-sales-insights.service';

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'strengths', 'risks', 'actions', 'dataLimits'],
  properties: {
    status: { type: 'string', enum: ['favorable', 'attention', 'critical', 'insufficient_data'] },
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    risks: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    actions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['priority', 'title', 'detail'],
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    dataLimits: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
} as const;

type SuggestedBudgetMonth = {
  month: number;
  revenue: number;
  otherOperatingIncome: number;
  materialPurchases: number;
  payroll: number;
  depreciation: number;
  otherOpex: number;
  financialResult: number;
  taxes: number;
  rationale: string;
};

type NormalizedBudgetProposal = {
  name: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  assumptions: string[];
  startDate: string;
  endDate: string;
  currency: string;
  months: Array<
    SuggestedBudgetMonth & {
      periodStart: string;
      operatingExpenses: number;
      resultBeforeDepreciation: number;
      operatingResult: number;
      netResult: number;
    }
  >;
  totals: Record<string, number>;
};

type HistoricalBudgetMonth = {
  periodStart: string;
  revenue: number;
  otherOperatingIncome: number;
  materialPurchases: number;
  payroll: number;
  depreciation: number;
  otherOpex: number;
  financialResult: number;
  taxes: number;
};

export type BudgetReference = {
  startDate: string;
  endDate: string;
  months: number;
  expectedMonths: number;
  complete: boolean;
  totals: Record<string, number>;
  ratios: {
    operatingExpenses: number | null;
    materialPurchases: number | null;
    payroll: number | null;
    netMargin: number | null;
  };
  monthly: HistoricalBudgetMonth[];
};

export type FinanceBudgetAssessment = {
  canAccept: boolean;
  confidence: 'low' | 'medium' | 'high';
  checks: Array<{
    id: string;
    severity: 'pass' | 'warning' | 'blocking';
    label: string;
    detail: string;
    proposed: number | null;
    reference: number | null;
    unit: 'percentage' | 'percentage_points' | 'count';
  }>;
};

function roundBudget(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateAtMonth(start: Date, month: number) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + month - 1, 1));
}

function ratioToRevenue(value: number, revenue: number) {
  return revenue === 0 ? null : roundBudget((value / revenue) * 100);
}

function totalsFromBudgetMonths(
  months: Array<
    Pick<
      HistoricalBudgetMonth,
      | 'revenue'
      | 'otherOperatingIncome'
      | 'materialPurchases'
      | 'payroll'
      | 'depreciation'
      | 'otherOpex'
      | 'financialResult'
      | 'taxes'
    >
  >,
) {
  const primitiveKeys = [
    'revenue',
    'otherOperatingIncome',
    'materialPurchases',
    'payroll',
    'depreciation',
    'otherOpex',
    'financialResult',
    'taxes',
  ] as const;
  const totals = Object.fromEntries(
    primitiveKeys.map((key) => [
      key,
      roundBudget(months.reduce((sum, month) => sum + month[key], 0)),
    ]),
  ) as Record<(typeof primitiveKeys)[number], number>;
  const operatingExpenses = roundBudget(
    totals.materialPurchases + totals.payroll + totals.depreciation + totals.otherOpex,
  );
  const resultBeforeDepreciation = roundBudget(
    totals.revenue +
      totals.otherOperatingIncome -
      totals.materialPurchases -
      totals.payroll -
      totals.otherOpex,
  );
  const operatingResult = roundBudget(resultBeforeDepreciation - totals.depreciation);
  const netResult = roundBudget(operatingResult + totals.financialResult - totals.taxes);
  return {
    ...totals,
    operatingExpenses,
    resultBeforeDepreciation,
    operatingResult,
    netResult,
  };
}

function budgetReference(
  period: { startDate: Date; endDate: Date },
  history: HistoricalBudgetMonth[],
): BudgetReference {
  const monthly = history.filter((month) => {
    const date = new Date(month.periodStart);
    return date >= period.startDate && date <= period.endDate;
  });
  const totals = totalsFromBudgetMonths(monthly);
  const expectedMonths = countMonths(period.startDate, period.endDate);
  return {
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    months: monthly.length,
    expectedMonths,
    complete: monthly.length >= expectedMonths,
    totals,
    ratios: {
      operatingExpenses: ratioToRevenue(totals.operatingExpenses, totals.revenue),
      materialPurchases: ratioToRevenue(totals.materialPurchases, totals.revenue),
      payroll: ratioToRevenue(totals.payroll, totals.revenue),
      netMargin: ratioToRevenue(totals.netResult, totals.revenue),
    },
    monthly,
  };
}

export function assessFinanceBudgetProposal(
  proposal: NormalizedBudgetProposal,
  reference: BudgetReference,
  history: { months: number; periods: number },
): FinanceBudgetAssessment {
  const proposedRevenue = proposal.totals.revenue;
  const referenceRevenue = reference.totals.revenue;
  const revenueChange =
    referenceRevenue === 0
      ? null
      : roundBudget(((proposedRevenue - referenceRevenue) / Math.abs(referenceRevenue)) * 100);
  const proposedExpenseRatio = ratioToRevenue(
    proposal.totals.operatingExpenses,
    proposedRevenue,
  );
  const proposedMaterialRatio = ratioToRevenue(
    proposal.totals.materialPurchases,
    proposedRevenue,
  );
  const proposedPayrollRatio = ratioToRevenue(proposal.totals.payroll, proposedRevenue);
  const proposedNetMargin = ratioToRevenue(proposal.totals.netResult, proposedRevenue);
  const expenseRatioChange =
    proposedExpenseRatio == null || reference.ratios.operatingExpenses == null
      ? null
      : roundBudget(proposedExpenseRatio - reference.ratios.operatingExpenses);
  const netMarginChange =
    proposedNetMargin == null || reference.ratios.netMargin == null
      ? null
      : roundBudget(proposedNetMargin - reference.ratios.netMargin);
  const categoryDeviation = Math.max(
    proposedMaterialRatio == null || reference.ratios.materialPurchases == null
      ? 0
      : Math.abs(proposedMaterialRatio - reference.ratios.materialPurchases),
    proposedPayrollRatio == null || reference.ratios.payroll == null
      ? 0
      : Math.abs(proposedPayrollRatio - reference.ratios.payroll),
  );
  const comparableMonths = Math.min(proposal.months.length, reference.monthly.length);
  const monthlyRevenueOutliers = proposal.months.slice(0, comparableMonths).filter((month, index) => {
    const historicalRevenue = reference.monthly[index]?.revenue ?? 0;
    if (historicalRevenue <= 0) return false;
    return Math.abs(month.revenue - historicalRevenue) / historicalRevenue > 0.5;
  }).length;

  const checks: FinanceBudgetAssessment['checks'] = [];
  const add = (
    id: string,
    severity: FinanceBudgetAssessment['checks'][number]['severity'],
    label: string,
    detail: string,
    proposed: number | null,
    referenceValue: number | null,
    unit: FinanceBudgetAssessment['checks'][number]['unit'],
  ) => checks.push({ id, severity, label, detail, proposed, reference: referenceValue, unit });

  const revenueSeverity =
    revenueChange == null || Math.abs(revenueChange) > 25
      ? 'blocking'
      : Math.abs(revenueChange) > 15
        ? 'warning'
        : 'pass';
  add(
    'revenue_change',
    revenueSeverity,
    'Évolution du chiffre d’affaires',
    revenueChange == null
      ? 'Le chiffre d’affaires de référence ne permet pas de calculer une évolution fiable.'
      : `La proposition évolue de ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)} % par rapport au dernier exercice.`,
    revenueChange,
    0,
    'percentage',
  );

  const expenseSeverity =
    expenseRatioChange == null || expenseRatioChange < -7.5
      ? 'blocking'
      : expenseRatioChange < -4 || expenseRatioChange > 12
        ? 'warning'
        : 'pass';
  add(
    'operating_expense_ratio',
    expenseSeverity,
    'Charges d’exploitation / CA',
    expenseRatioChange == null
      ? 'Le ratio de charges ne peut pas être rapproché du dernier exercice.'
      : `Le ratio proposé est de ${proposedExpenseRatio?.toFixed(1)} %, contre ${reference.ratios.operatingExpenses?.toFixed(1)} % sur le dernier exercice.`,
    proposedExpenseRatio,
    reference.ratios.operatingExpenses,
    'percentage_points',
  );

  const marginSeverity =
    netMarginChange == null || netMarginChange > 7.5
      ? 'blocking'
      : netMarginChange > 4 || netMarginChange < -12
        ? 'warning'
        : 'pass';
  add(
    'net_margin',
    marginSeverity,
    'Marge nette',
    netMarginChange == null
      ? 'La marge nette ne peut pas être rapprochée du dernier exercice.'
      : `La marge nette proposée est de ${proposedNetMargin?.toFixed(1)} %, contre ${reference.ratios.netMargin?.toFixed(1)} % sur le dernier exercice.`,
    proposedNetMargin,
    reference.ratios.netMargin,
    'percentage_points',
  );

  add(
    'cost_structure',
    categoryDeviation > 12 ? 'blocking' : categoryDeviation > 7.5 ? 'warning' : 'pass',
    'Structure achats et masse salariale',
    categoryDeviation > 7.5
      ? 'La répartition des achats ou de la masse salariale s’écarte fortement de l’exercice de référence.'
      : 'La structure des principaux coûts reste proche de l’exercice de référence.',
    roundBudget(categoryDeviation),
    0,
    'percentage_points',
  );

  add(
    'monthly_seasonality',
    monthlyRevenueOutliers > 2 ? 'blocking' : monthlyRevenueOutliers > 0 ? 'warning' : 'pass',
    'Saisonnalité mensuelle',
    monthlyRevenueOutliers
      ? `${monthlyRevenueOutliers} mois s’écartent de plus de 50 % du mois comparable du dernier exercice.`
      : 'La saisonnalité mensuelle reste cohérente avec le dernier exercice.',
    monthlyRevenueOutliers,
    0,
    'count',
  );

  add(
    'history_coverage',
    reference.months < Math.min(12, reference.expectedMonths)
      ? 'blocking'
      : history.months < 24 || history.periods < 2 || !reference.complete
        ? 'warning'
        : 'pass',
    'Couverture historique',
    `${history.months} mois répartis sur ${history.periods} exercice(s), dont ${reference.months}/${reference.expectedMonths} mois sur l’exercice de référence.`,
    history.months,
    reference.expectedMonths,
    'count',
  );

  const canAccept = checks.every(({ severity }) => severity !== 'blocking');
  const confidence = !canAccept
    ? 'low'
    : checks.some(({ severity }) => severity === 'warning')
      ? 'medium'
      : 'high';
  return { canAccept, confidence, checks };
}

function suggestionSchema(totalMonths: number) {
  const amount = { type: 'number', minimum: 0 } as const;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'summary', 'confidence', 'assumptions', 'months'],
    properties: {
      name: { type: 'string', maxLength: 120 },
      summary: { type: 'string', maxLength: 800 },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      assumptions: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 240 } },
      months: {
        type: 'array',
        minItems: totalMonths,
        maxItems: totalMonths,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'month',
            'revenue',
            'otherOperatingIncome',
            'materialPurchases',
            'payroll',
            'depreciation',
            'otherOpex',
            'financialResult',
            'taxes',
            'rationale',
          ],
          properties: {
            month: { type: 'integer', minimum: 1, maximum: totalMonths },
            revenue: amount,
            otherOperatingIncome: amount,
            materialPurchases: amount,
            payroll: amount,
            depreciation: amount,
            otherOpex: amount,
            financialResult: { type: 'number' },
            taxes: amount,
            rationale: { type: 'string', maxLength: 240 },
          },
        },
      },
    },
  } as const;
}

export function normalizeFinanceBudgetProposal(
  raw: unknown,
  target: { startDate: Date; endDate: Date; currency: string },
  maximumMonthlyAmount = 1_000_000_000,
): NormalizedBudgetProposal {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const totalMonths = countMonths(target.startDate, target.endDate);
  const rawMonths = Array.isArray(value.months) ? value.months : [];
  if (rawMonths.length !== totalMonths) {
    throw new BadRequestException(`La proposition doit contenir exactement ${totalMonths} mois.`);
  }
  const seen = new Set<number>();
  const number = (input: unknown, label: string, allowNegative = false) => {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) {
      throw new BadRequestException(`Montant invalide pour ${label}.`);
    }
    if (Math.abs(parsed) > maximumMonthlyAmount) {
      throw new BadRequestException(`Montant anormalement élevé pour ${label}.`);
    }
    return roundBudget(parsed);
  };
  const months = rawMonths
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}))
    .map((month) => {
      const monthNumber = Number(month.month);
      if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > totalMonths) {
        throw new BadRequestException('Numéro de mois budgétaire invalide.');
      }
      if (seen.has(monthNumber)) throw new BadRequestException('Un mois budgétaire est dupliqué.');
      seen.add(monthNumber);
      const revenue = number(month.revenue, 'chiffre d’affaires');
      const otherOperatingIncome = number(month.otherOperatingIncome, 'autres produits');
      const materialPurchases = number(month.materialPurchases, 'achats');
      const payroll = number(month.payroll, 'masse salariale');
      const depreciation = number(month.depreciation, 'amortissements');
      const otherOpex = number(month.otherOpex, 'autres charges');
      const financialResult = number(month.financialResult, 'résultat financier', true);
      const taxes = number(month.taxes, 'impôts');
      const operatingExpenses = roundBudget(
        materialPurchases + payroll + depreciation + otherOpex,
      );
      const resultBeforeDepreciation = roundBudget(
        revenue + otherOperatingIncome - materialPurchases - payroll - otherOpex,
      );
      const operatingResult = roundBudget(resultBeforeDepreciation - depreciation);
      const netResult = roundBudget(operatingResult + financialResult - taxes);
      return {
        month: monthNumber,
        periodStart: dateAtMonth(target.startDate, monthNumber).toISOString(),
        revenue,
        otherOperatingIncome,
        materialPurchases,
        payroll,
        depreciation,
        otherOpex,
        financialResult,
        taxes,
        operatingExpenses,
        resultBeforeDepreciation,
        operatingResult,
        netResult,
        rationale: String(month.rationale ?? '').trim().slice(0, 240),
      };
    })
    .sort((left, right) => left.month - right.month);
  const totalKeys = [
    'revenue',
    'otherOperatingIncome',
    'materialPurchases',
    'payroll',
    'depreciation',
    'otherOpex',
    'operatingExpenses',
    'resultBeforeDepreciation',
    'operatingResult',
    'financialResult',
    'taxes',
    'netResult',
  ] as const;
  const totals = Object.fromEntries(
    totalKeys.map((key) => [
      key,
      roundBudget(months.reduce((sum, month) => sum + month[key], 0)),
    ]),
  );
  return {
    name: String(value.name || `Budget suggéré ${target.startDate.getUTCFullYear()}`).slice(0, 120),
    summary: String(value.summary ?? '').trim().slice(0, 800),
    confidence: ['low', 'medium', 'high'].includes(String(value.confidence))
      ? (String(value.confidence) as NormalizedBudgetProposal['confidence'])
      : 'low',
    assumptions: (Array.isArray(value.assumptions) ? value.assumptions : [])
      .map((item) => String(item).trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 6),
    startDate: target.startDate.toISOString(),
    endDate: target.endDate.toISOString(),
    currency: target.currency,
    months,
    totals,
  };
}

@Injectable()
export class FinanceAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: FinancePolicy,
    private readonly analytics: FinanceAnalyticsService,
    private readonly mistral: MistralClientService,
    private readonly salesInsights: FinanceSalesInsightsService,
  ) {}

  async analyze(organizationId: string, actor: AuthenticatedUser, dto: FinanceAiAnalysisDto) {
    this.policy.assertPermission(actor, 'finance.read');
    const settings = await this.prisma.financeSettings.findUnique({ where: { organizationId } });
    const [result, sales] = await Promise.all([
      this.analytics.build(
        organizationId,
        {
          ...(dto.asOf ? { to: dto.asOf, from: dto.asOf } : {}),
          ...(dto.siteId ? { siteId: dto.siteId } : {}),
        },
        settings?.fiscalYearStartMonth ?? 1,
      ),
      this.salesInsights.build(organizationId, {
        from: dto.from,
        to: dto.asOf,
        siteId: dto.siteId,
      }),
    ]);
    const view = dto.view ?? 'annual';
    const selected = result.dashboard[view === 'sales' ? 'monthly' : view];
    const snapshot = {
      view,
      scope: { siteId: dto.siteId ?? null },
      context: result.dashboard.context,
      health: result.dashboard.health,
      period: { label: selected.label, from: selected.from, to: selected.to },
      core: selected.core,
      optional: selected.optional,
      budget: result.dashboard.budget
        ? { name: result.dashboard.budget.name, scenario: result.dashboard.budget.scenario }
        : null,
      salesOperations: {
        period: sales.period,
        summary: sales.summary,
        comparisons: sales.comparisons,
        peakHours: sales.hourly
          .filter(({ transactions }) => transactions > 0)
          .sort((left, right) => right.transactions - left.transactions)
          .slice(0, 5),
        weekdays: sales.weekdays,
        topProducts: sales.topProducts.slice(0, 10),
        lowProducts: sales.lowProducts.slice(0, 5),
        categories: sales.categories.slice(0, 10),
        staffing: sales.staffing,
        quality: sales.quality,
      },
      qualityRules: [
        'Une valeur null signifie donnée indisponible et ne doit jamais être interprétée comme zéro.',
        'Les écarts annuels comparent le réalisé cumulé au budget des mêmes mois uniquement.',
        'Le résultat est provisoire tant que la période comptable n’est pas verrouillée.',
        'Les classements produit ne doivent être commentés que si leur couverture est suffisante.',
        'Les heures d’affluence proviennent des horodatages des tickets des caisses incluses.',
        'La marge produit n’est commentée que lorsqu’une fiche technique fournit un coût par portion.',
        'Le rapprochement affluence/effectif n’est commenté que lorsque staffing.available vaut true.',
        'Quand scope.siteId est défini, ne jamais extrapoler les charges, la trésorerie ou le budget global à cet établissement.',
      ],
    };
    return this.mistral.chatJson<{
      status: 'favorable' | 'attention' | 'critical' | 'insufficient_data';
      summary: string;
      strengths: string[];
      risks: string[];
      actions: Array<{ priority: 'P1' | 'P2' | 'P3'; title: string; detail: string }>;
      dataLimits: string[];
    }>(
      organizationId,
      [
        {
          role: 'system',
          content: FINANCE_ANALYSIS_SKILL,
        },
        {
          role: 'user',
          content: `Analyse cette situation financière ToqueHub : ${JSON.stringify(snapshot)}`,
        },
      ],
      'finance_management_analysis',
      ANALYSIS_SCHEMA,
      {
        temperature: 0,
        fallbackToJsonObject: true,
        ...financeMistralOptions(),
      },
    );
  }

  async suggestBudget(
    organizationId: string,
    actor: AuthenticatedUser,
    dto: SuggestFinanceBudgetDto,
  ) {
    this.policy.assertPermission(actor, 'finance.budget');
    const [settings, site] = await Promise.all([
      this.prisma.financeSettings.findUnique({ where: { organizationId } }),
      this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, isArchived: false },
        select: { id: true, name: true },
      }),
    ]);
    if (!site) throw new BadRequestException('Établissement introuvable.');
    const analytics = await this.analytics.build(
      organizationId,
      { to: dto.asOf, siteId: dto.siteId },
      settings?.fiscalYearStartMonth ?? 1,
    );
    if (analytics.dataScope.accountingMode === 'unavailable') {
      throw new BadRequestException(
        'La comptabilité de cet établissement ne permet pas encore de générer un budget fiable.',
      );
    }
    const targetStart = analytics.dashboard.context.fiscalStart;
    const targetEnd = analytics.dashboard.context.fiscalEnd;
    const historicalPeriods = (
      await this.prisma.financeAccountingPeriod.findMany({
        where: { organizationId, endDate: { lt: targetStart } },
        orderBy: { endDate: 'desc' },
        take: 3,
      })
    ).reverse();
    if (!historicalPeriods.length) {
      throw new BadRequestException(
        'Mistral a besoin d’au moins un exercice comptable antérieur pour proposer un budget.',
      );
    }
    const historyFrom = historicalPeriods[0].startDate;
    const historyTo = historicalPeriods.at(-1)!.endDate;
    const [entries, accounts, accountingSources] = await Promise.all([
      this.prisma.financeLedgerEntry.findMany({
        where: {
          organizationId,
          sourceId: { in: analytics.dataScope.accountingSourceIds },
          entryDate: { gte: historyFrom, lte: historyTo },
        },
        orderBy: { entryDate: 'asc' },
      }),
      this.prisma.financeAccount.findMany({ where: { organizationId } }),
      this.prisma.financeDataSource.findMany({
        where: { id: { in: analytics.dataScope.accountingSourceIds } },
        select: { provider: true },
      }),
    ]);
    const finnishChart = accountingSources.some(({ provider }) => provider === 'FENNOA');
    const categories = new Map(accounts.map(({ code, category }) => [code, category]));
    const historyByMonth = new Map<string, HistoricalBudgetMonth>();
    for (const entry of entries) {
      const periodStart = new Date(
        Date.UTC(entry.entryDate.getUTCFullYear(), entry.entryDate.getUTCMonth(), 1),
      );
      const key = periodStart.toISOString().slice(0, 7);
      const month = historyByMonth.get(key) ?? {
        periodStart: periodStart.toISOString(),
        revenue: 0,
        otherOperatingIncome: 0,
        materialPurchases: 0,
        payroll: 0,
        depreciation: 0,
        otherOpex: 0,
        financialResult: 0,
        taxes: 0,
      };
      const account = Number.parseInt(entry.accountCode.replace(/\D/g, '').slice(0, 4), 10);
      const debitMinusCredit = Number(entry.debit) - Number(entry.credit);
      const category = categories.get(entry.accountCode) ?? FinanceAccountCategory.OTHER;
      if (category === FinanceAccountCategory.REVENUE) {
        if (finnishChart && account >= 3900 && account <= 3999)
          month.otherOperatingIncome += -debitMinusCredit;
        else month.revenue += -debitMinusCredit;
      } else if (category === FinanceAccountCategory.MATERIAL_PURCHASES) {
        month.materialPurchases += debitMinusCredit;
      } else if (category === FinanceAccountCategory.PAYROLL || (finnishChart && account >= 5000 && account <= 6799)) {
        month.payroll += debitMinusCredit;
      } else if (finnishChart && account >= 6800 && account <= 6899) {
        month.depreciation += debitMinusCredit;
      } else if (category === FinanceAccountCategory.OTHER_OPEX || (finnishChart && account >= 6900 && account <= 8999)) {
        month.otherOpex += debitMinusCredit;
      } else if (category === FinanceAccountCategory.FINANCIAL || (finnishChart && account >= 9000 && account <= 9799)) {
        month.financialResult += -debitMinusCredit;
      } else if (category === FinanceAccountCategory.TAX || (finnishChart && account >= 9800 && account <= 9999)) {
        month.taxes += debitMinusCredit;
      }
      historyByMonth.set(key, month);
    }
    const history = [...historyByMonth.values()].map((month) => ({
      periodStart: month.periodStart,
      revenue: roundBudget(month.revenue),
      otherOperatingIncome: roundBudget(month.otherOperatingIncome),
      materialPurchases: roundBudget(month.materialPurchases),
      payroll: roundBudget(month.payroll),
      depreciation: roundBudget(month.depreciation),
      otherOpex: roundBudget(month.otherOpex),
      financialResult: roundBudget(month.financialResult),
      taxes: roundBudget(month.taxes),
    }));
    if (history.length < 12) {
      throw new BadRequestException(
        `Historique insuffisant : ${history.length} mois exploitables, 12 mois minimum requis.`,
      );
    }
    const totalMonths = countMonths(targetStart, targetEnd);
    const periodReferences = historicalPeriods.map((period) => budgetReference(period, history));
    const reference = [...periodReferences]
      .reverse()
      .find(({ months, expectedMonths }) => months >= Math.min(12, expectedMonths));
    if (!reference || reference.totals.revenue <= 0) {
      throw new BadRequestException(
        'Le dernier exercice ne contient pas assez de chiffre d’affaires comptable pour servir de référence.',
      );
    }
    const maximumHistoricalRevenue = Math.max(
      ...history.map((month) => Number(month.revenue) || 0),
      1,
    );
    const minimumOperatingExpenseRatio = Math.max(
      0,
      (reference.ratios.operatingExpenses ?? 0) - 4,
    );
    const maximumNetMargin = (reference.ratios.netMargin ?? 0) + 4;
    const raw = await this.mistral.chatJson<Record<string, unknown>>(
      organizationId,
      [
        {
          role: 'system',
          content: FINANCE_BUDGET_SKILL,
        },
        {
          role: 'user',
          content: JSON.stringify({
            target: {
              site: site.name,
              startDate: targetStart,
              endDate: targetEnd,
              months: totalMonths,
            },
            userGuidance: dto.guidance?.trim() || null,
            historicalPeriods: periodReferences.map(
              ({ startDate, endDate, months, expectedMonths, complete }) => ({
                startDate,
                endDate,
                months,
                expectedMonths,
                complete,
              }),
            ),
            latestReference: {
              startDate: reference.startDate,
              endDate: reference.endDate,
              totals: reference.totals,
              ratios: reference.ratios,
            },
            controlLimits: {
              maximumAbsoluteRevenueChangePercent: 15,
              minimumOperatingExpenseRatioPercent: roundBudget(
                minimumOperatingExpenseRatio,
              ),
              maximumNetMarginPercent: roundBudget(maximumNetMargin),
              maximumMonthlyRevenueChangePercentVersusComparableMonth: 50,
            },
            history,
          }),
        },
      ],
      'finance_budget_suggestion',
      suggestionSchema(totalMonths),
      {
        temperature: 0,
        fallbackToJsonObject: true,
        timeoutMs: 90_000,
        ...financeMistralOptions(),
      },
    );
    const normalizedProposal = normalizeFinanceBudgetProposal(
      raw,
      {
        startDate: targetStart,
        endDate: targetEnd,
        currency: settings?.defaultCurrency ?? 'EUR',
      },
      maximumHistoricalRevenue * 8,
    );
    const assessment = assessFinanceBudgetProposal(normalizedProposal, reference, {
      periods: historicalPeriods.length,
      months: history.length,
    });
    const revenueChange =
      reference.totals.revenue === 0
        ? 0
        : roundBudget(
            ((normalizedProposal.totals.revenue - reference.totals.revenue) /
              Math.abs(reference.totals.revenue)) *
              100,
          );
    const proposedExpenseRatio = ratioToRevenue(
      normalizedProposal.totals.operatingExpenses,
      normalizedProposal.totals.revenue,
    );
    const proposedNetMargin = ratioToRevenue(
      normalizedProposal.totals.netResult,
      normalizedProposal.totals.revenue,
    );
    const proposal = {
      ...normalizedProposal,
      confidence: assessment.confidence,
      summary: `Proposition construite sur ${history.length} mois comptables. Le chiffre d’affaires évolue de ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)} % par rapport au dernier exercice complet ; les charges représentent ${proposedExpenseRatio?.toFixed(1) ?? '—'} % du CA et la marge nette ${proposedNetMargin?.toFixed(1) ?? '—'} %.`,
      assumptions: [
        `Saisonnalité calculée à partir des exercices comptables du ${historicalPeriods[0].startDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au ${historicalPeriods.at(-1)!.endDate.toLocaleDateString('fr-FR', { timeZone: 'UTC' })}.`,
        `Exercice de référence : ${new Date(reference.startDate).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} → ${new Date(reference.endDate).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} (${reference.months}/${reference.expectedMonths} mois couverts).`,
        `Ratio de charges proposé : ${proposedExpenseRatio?.toFixed(1) ?? '—'} % du CA, contre ${reference.ratios.operatingExpenses?.toFixed(1) ?? '—'} % sur l’exercice de référence.`,
        `Marge nette proposée : ${proposedNetMargin?.toFixed(1) ?? '—'} %, contre ${reference.ratios.netMargin?.toFixed(1) ?? '—'} % sur l’exercice de référence.`,
        ...(dto.guidance?.trim()
          ? [`Hypothèse fournie par l’utilisateur : ${dto.guidance.trim().slice(0, 240)}`]
          : []),
      ],
    };
    return {
      proposal,
      assessment,
      reference: {
        ...reference,
        monthly: undefined,
      },
      history: {
        periods: historicalPeriods.length,
        months: history.length,
        from: historyFrom,
        to: historyTo,
        periodDetails: periodReferences.map(
          ({ startDate, endDate, months, expectedMonths, complete }) => ({
            startDate,
            endDate,
            months,
            expectedMonths,
            complete,
          }),
        ),
      },
    };
  }

  async acceptBudgetSuggestion(
    organizationId: string,
    actor: AuthenticatedUser,
    dto: AcceptFinanceBudgetSuggestionDto,
  ) {
    this.policy.assertPermission(actor, 'finance.budget');
    const [settings, site] = await Promise.all([
      this.prisma.financeSettings.findUnique({ where: { organizationId } }),
      this.prisma.site.findFirst({
        where: { id: dto.siteId, organizationId, isArchived: false },
        select: { id: true, name: true },
      }),
    ]);
    if (!site) throw new BadRequestException('Établissement introuvable.');
    const startDate = new Date(String(dto.proposal.startDate ?? ''));
    const endDate = new Date(String(dto.proposal.endDate ?? ''));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Période de proposition invalide.');
    }
    const normalizedStart = new Date(`${startDate.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const normalizedEnd = new Date(`${endDate.toISOString().slice(0, 10)}T23:59:59.999Z`);
    const analytics = await this.analytics.build(
      organizationId,
      { to: normalizedStart.toISOString(), siteId: site.id },
      settings?.fiscalYearStartMonth ?? 1,
    );
    const resolvedStart = new Date(analytics.dashboard.context.fiscalStart);
    const resolvedEnd = new Date(analytics.dashboard.context.fiscalEnd);
    if (
      resolvedStart.toISOString().slice(0, 10) !== normalizedStart.toISOString().slice(0, 10) ||
      resolvedEnd.toISOString().slice(0, 10) !== normalizedEnd.toISOString().slice(0, 10)
    ) {
      throw new BadRequestException(
        'La proposition ne correspond pas à l’exercice comptable calculé pour cet établissement.',
      );
    }
    const proposal = normalizeFinanceBudgetProposal(dto.proposal, {
      startDate: normalizedStart,
      endDate: normalizedEnd,
      currency: settings?.defaultCurrency ?? 'EUR',
    });
    if (analytics.dataScope.accountingMode === 'unavailable') {
      throw new BadRequestException(
        'La comptabilité de cet établissement ne permet pas de contrôler cette proposition.',
      );
    }
    const validationContext = await this.loadBudgetValidationReference(
      organizationId,
      normalizedStart,
      analytics.dataScope.accountingSourceIds,
    );
    const assessment = assessFinanceBudgetProposal(
      proposal,
      validationContext.reference,
      validationContext.history,
    );
    if (!assessment.canAccept) {
      const reasons = assessment.checks
        .filter(({ severity }) => severity === 'blocking')
        .map(({ detail }) => detail)
        .join(' ');
      throw new BadRequestException(
        `Cette proposition est incohérente avec l’historique et ne peut pas être validée. ${reasons}`,
      );
    }
    const metricDefinitions = [
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
    const currentSelections =
      settings?.budgetSelections &&
      typeof settings.budgetSelections === 'object' &&
      !Array.isArray(settings.budgetSelections)
        ? (settings.budgetSelections as Record<string, unknown>)
        : {};
    const created = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.financeBudgetPlan.create({
        data: {
          organizationId,
          siteId: site.id,
          name: proposal.name,
          scenario: 'Suggestion Mistral validée',
          currency: proposal.currency,
          startDate: normalizedStart,
          endDate: normalizedEnd,
          source: 'MISTRAL_SUGGESTION',
          isReference: false,
          metadata: {
            generatedBy: 'mistral',
            validatedBy: actor.id,
            validatedAt: new Date().toISOString(),
            summary: proposal.summary,
            assumptions: proposal.assumptions,
            assessment,
          },
        },
      });
      await tx.financeBudgetPlanLine.createMany({
        data: proposal.months.flatMap((month) => {
          const values = {
            revenue: month.revenue,
            other_operating_income: month.otherOperatingIncome,
            material_purchases: month.materialPurchases,
            payroll: month.payroll,
            depreciation: month.depreciation,
            other_opex: month.otherOpex + month.depreciation,
            operating_expenses: month.operatingExpenses,
            result_before_depreciation: month.resultBeforeDepreciation,
            operating_result: month.operatingResult,
            financial_result: month.financialResult,
            taxes: month.taxes,
            net_result: month.netResult,
          };
          return metricDefinitions.map(([metric, label]) => ({
            organizationId,
            planId: plan.id,
            metric,
            label,
            periodStart: new Date(month.periodStart),
            amount: new Prisma.Decimal(roundBudget(values[metric])),
          }));
        }),
      });
      const selectionKey = financeBudgetSelectionKey(normalizedStart, normalizedEnd, site.id);
      const consolidatedSelectionKey = financeBudgetSelectionKey(normalizedStart, normalizedEnd);
      await tx.financeSettings.update({
        where: { organizationId },
        data: {
          budgetSelections: {
            ...currentSelections,
            [selectionKey]: plan.id,
            [consolidatedSelectionKey]: plan.id,
          } as Prisma.InputJsonObject,
        },
      });
      return plan;
    });
    return { accepted: true, budgetId: created.id, name: created.name };
  }

  private async loadBudgetValidationReference(
    organizationId: string,
    targetStart: Date,
    accountingSourceIds: string[],
  ) {
    const historicalPeriods = (
      await this.prisma.financeAccountingPeriod.findMany({
        where: { organizationId, endDate: { lt: targetStart } },
        orderBy: { endDate: 'desc' },
        take: 3,
      })
    ).reverse();
    if (!historicalPeriods.length) {
      throw new BadRequestException('Aucun exercice antérieur ne permet de contrôler ce budget.');
    }
    const historyFrom = historicalPeriods[0].startDate;
    const historyTo = historicalPeriods.at(-1)!.endDate;
    const [entries, accounts, accountingSources] = await Promise.all([
      this.prisma.financeLedgerEntry.findMany({
        where: {
          organizationId,
          sourceId: { in: accountingSourceIds },
          entryDate: { gte: historyFrom, lte: historyTo },
        },
        orderBy: { entryDate: 'asc' },
      }),
      this.prisma.financeAccount.findMany({ where: { organizationId } }),
      this.prisma.financeDataSource.findMany({
        where: { id: { in: accountingSourceIds } },
        select: { provider: true },
      }),
    ]);
    const finnishChart = accountingSources.some(({ provider }) => provider === 'FENNOA');
    const categories = new Map(accounts.map(({ code, category }) => [code, category]));
    const historyByMonth = new Map<string, HistoricalBudgetMonth>();
    for (const entry of entries) {
      const periodStart = new Date(
        Date.UTC(entry.entryDate.getUTCFullYear(), entry.entryDate.getUTCMonth(), 1),
      );
      const key = periodStart.toISOString().slice(0, 7);
      const month = historyByMonth.get(key) ?? {
        periodStart: periodStart.toISOString(),
        revenue: 0,
        otherOperatingIncome: 0,
        materialPurchases: 0,
        payroll: 0,
        depreciation: 0,
        otherOpex: 0,
        financialResult: 0,
        taxes: 0,
      };
      const account = Number.parseInt(entry.accountCode.replace(/\D/g, '').slice(0, 4), 10);
      const debitMinusCredit = Number(entry.debit) - Number(entry.credit);
      const category = categories.get(entry.accountCode) ?? FinanceAccountCategory.OTHER;
      if (category === FinanceAccountCategory.REVENUE) {
        if (finnishChart && account >= 3900 && account <= 3999)
          month.otherOperatingIncome += -debitMinusCredit;
        else month.revenue += -debitMinusCredit;
      } else if (category === FinanceAccountCategory.MATERIAL_PURCHASES) {
        month.materialPurchases += debitMinusCredit;
      } else if (
        category === FinanceAccountCategory.PAYROLL ||
        (finnishChart && account >= 5000 && account <= 6799)
      ) {
        month.payroll += debitMinusCredit;
      } else if (finnishChart && account >= 6800 && account <= 6899) {
        month.depreciation += debitMinusCredit;
      } else if (
        category === FinanceAccountCategory.OTHER_OPEX ||
        (finnishChart && account >= 6900 && account <= 8999)
      ) {
        month.otherOpex += debitMinusCredit;
      } else if (
        category === FinanceAccountCategory.FINANCIAL ||
        (finnishChart && account >= 9000 && account <= 9799)
      ) {
        month.financialResult += -debitMinusCredit;
      } else if (
        category === FinanceAccountCategory.TAX ||
        (finnishChart && account >= 9800 && account <= 9999)
      ) {
        month.taxes += debitMinusCredit;
      }
      historyByMonth.set(key, month);
    }
    const history = [...historyByMonth.values()].map((month) => ({
      ...month,
      revenue: roundBudget(month.revenue),
      otherOperatingIncome: roundBudget(month.otherOperatingIncome),
      materialPurchases: roundBudget(month.materialPurchases),
      payroll: roundBudget(month.payroll),
      depreciation: roundBudget(month.depreciation),
      otherOpex: roundBudget(month.otherOpex),
      financialResult: roundBudget(month.financialResult),
      taxes: roundBudget(month.taxes),
    }));
    const references = historicalPeriods.map((item) => budgetReference(item, history));
    const reference = [...references]
      .reverse()
      .find(({ months, expectedMonths }) => months >= Math.min(12, expectedMonths));
    if (!reference || reference.totals.revenue <= 0) {
      throw new BadRequestException(
        'Le dernier exercice ne contient pas assez de données pour contrôler ce budget.',
      );
    }
    return {
      reference,
      history: { months: history.length, periods: historicalPeriods.length },
    };
  }
}
