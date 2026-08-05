import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { FinanceExportService } from './finance-export.service';

const metric = (
  id: string,
  label: string,
  value: number,
  budget: number,
  unit: 'currency' | 'percentage' | 'number' = 'currency',
) => ({
  id,
  label,
  value,
  unit,
  budget,
  variance: value - budget,
  variancePercent: budget ? ((value - budget) / Math.abs(budget)) * 100 : null,
  previous: value * 0.91,
  favorable: id.includes('expense') || id === 'payroll' ? value <= budget : value >= budget,
  status: 'provisional',
  help: `Définition claire de ${label.toLowerCase()}.`,
  displayable: true,
  availabilityReason: null,
});

const period = (kind: 'annual' | 'monthly' | 'daily') => {
  const annual = kind === 'annual';
  const monthly = kind === 'monthly';
  const count = annual ? 12 : monthly ? 31 : 1;
  const from = annual ? '2026-06-01' : monthly ? '2026-08-01' : '2026-08-05';
  const to = annual ? '2027-05-31' : monthly ? '2026-08-31' : '2026-08-05';
  return {
    kind,
    label: annual ? 'Exercice 2026-2027' : monthly ? 'Août 2026' : 'Mercredi 5 août 2026',
    from,
    to,
    status: 'provisional',
    core: [
      metric(
        'revenue',
        'Chiffre d’affaires',
        annual ? 218_450 : monthly ? 22_830 : 1_986,
        annual ? 232_000 : monthly ? 26_500 : 978,
      ),
      metric(
        'operating_expenses',
        'Charges d’exploitation',
        annual ? 177_240 : monthly ? 18_960 : 822,
        annual ? 184_000 : monthly ? 20_100 : 832,
      ),
      metric(
        'payroll',
        'Masse salariale',
        annual ? 68_400 : monthly ? 6_850 : 275,
        annual ? 72_000 : monthly ? 7_400 : 275,
      ),
      metric(
        'operating_result',
        'Résultat d’exploitation',
        annual ? 41_210 : monthly ? 3_870 : 1_164,
        annual ? 48_000 : monthly ? 6_400 : 146,
      ),
    ],
    optional: [
      metric('average_ticket', 'Ticket moyen', 28.7, 27.5),
      metric('transactions', 'Transactions', annual ? 7_612 : 796, annual ? 8_100 : 860, 'number'),
      metric(
        'contribution_margin',
        'Marge contributive',
        annual ? 142_800 : 14_970,
        annual ? 150_000 : 16_200,
      ),
      metric('contribution_margin_rate', 'Taux de marge contributive', 65.4, 64.6, 'percentage'),
      metric('cash_available', 'Trésorerie disponible', 74_170, 65_000),
      metric('fixed_costs', 'Charges fixes', annual ? 128_200 : 10_650, annual ? 125_000 : 10_400),
    ],
    series: Array.from({ length: count }, (_, index) => ({
      periodStart: annual ? `2026-${String(index + 1).padStart(2, '0')}-01` : undefined,
      date: !annual ? `2026-08-${String(index + 1).padStart(2, '0')}` : undefined,
      label: annual ? `M${index + 1}` : String(index + 1),
      actualRevenue: index % 7 === 1 ? 0 : 900 + index * 95,
      budgetRevenue: 1_050 + index * 80,
      actualResult: index % 5 === 0 ? -180 : 120 + index * 15,
      budgetResult: 160 + index * 10,
      transactions: 34 + index,
    })),
    comparison: {
      modeLabel: 'Périodes comparées au même stade',
      periods: [
        ['2026-2027', 'Période actuelle', true, 218_450],
        ['2025-2026', 'Même avancement N-1', false, 205_100],
        ['2024-2025', 'Même avancement N-2', false, 193_800],
      ].map(([label, detail, isCurrent, revenue], index) => ({
        id: `p-${index}`,
        label,
        detail,
        from,
        to,
        isCurrent,
        basis: 'mixed',
        sources: {
          revenue: 'cash_register',
          operating_expenses: 'accounting',
          payroll: 'accounting',
          operating_result: 'mixed',
          transactions: 'cash_register',
          average_ticket: 'cash_register',
          contribution_margin: 'mixed',
          contribution_margin_rate: 'mixed',
        },
        metrics: {
          revenue,
          operating_expenses: Number(revenue) * 0.78,
          payroll: Number(revenue) * 0.3,
          operating_result: Number(revenue) * 0.16,
          transactions: 7_200 - index * 300,
          average_ticket: 28 - index,
          contribution_margin: Number(revenue) * 0.64,
          contribution_margin_rate: 64 - index,
        },
      })),
    },
  };
};

const bootstrap = {
  installed: true,
  organizationId: 'org-1',
  permissions: ['finance.read'],
  settings: {
    defaultCurrency: 'EUR',
    fiscalYearStartMonth: 6,
    timezone: 'Europe/Helsinki',
    fennoa: null,
    flatpay: null,
    pos: { loyverse: {}, paypalPos: {} },
  },
  period: {
    preset: 'fiscal_year',
    label: 'Exercice 2026-2027',
    from: '2026-06-01',
    to: '2027-05-31',
  },
  metrics: [],
  analysis: {
    sales: { net: 218_450, gross: 245_000, vat: 26_550, transactions: 7_612, averageTicket: 28.7 },
    profitability: {
      revenue: 218_450,
      materialPurchases: 75_650,
      payroll: 68_400,
      otherExpenses: 33_190,
      operatingResult: 41_210,
      payrollRatio: 31.3,
      purchaseRatio: 34.6,
    },
    budget: { revenue: 232_000, expenses: 184_000, revenueVariance: -13_550 },
    series: [],
  },
  dashboard: {
    context: {
      asOf: '2026-08-05',
      fiscalStart: '2026-06-01',
      fiscalEnd: '2027-05-31',
      elapsedMonths: 3,
      totalMonths: 12,
      periodProgress: 25,
      actualCoverageLabel: 'Données disponibles jusqu’au 5 août 2026',
      dataCoverageStart: '2022-12-20',
      coverageComplete: false,
      budgetCoverageLabel: '12 mois budgétés',
    },
    health: {
      level: 'attention',
      label: 'Trajectoire à surveiller',
      summary:
        'Le chiffre d’affaires reste sous l’objectif, mais la maîtrise des charges protège le résultat.',
    },
    reconciliation: {
      lockedThrough: '2026-07-31',
      annual: {
        cashRegisterRevenue: 218_450,
        accountingRevenue: 217_940,
        difference: 510,
        selectedRevenue: 218_450,
        basis: 'mixed',
        status: 'attention',
      },
      monthly: {
        cashRegisterRevenue: 22_830,
        accountingRevenue: 22_790,
        difference: 40,
        selectedRevenue: 22_830,
        basis: 'mixed',
        status: 'matched',
      },
      daily: {
        cashRegisterRevenue: 1_986,
        accountingRevenue: null,
        difference: null,
        selectedRevenue: 1_986,
        basis: 'cash_register',
        status: 'partial',
      },
    },
    annual: period('annual'),
    monthly: period('monthly'),
    daily: period('daily'),
    budget: {
      id: 'budget-1',
      name: 'Budget 2026-2027',
      scenario: 'Central',
      currency: 'EUR',
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      isReference: true,
      totals: {
        revenue: 342_132,
        operatingExpenses: 311_155,
        payroll: 106_580,
        operatingResult: 30_977,
      },
      targets: {
        periodStart: '2026-08-01',
        label: 'Août 2026',
        days: 31,
        revenueMonth: 30_315,
        revenueWeek: 6_845,
        revenueDay: 978,
        breakEvenMonth: 24_060,
        breakEvenWeek: 5_433,
        breakEvenDay: 776,
        operatingResult: 4_516,
        pointMortDay: 25,
        pointMortDate: '2026-08-25',
      },
      series: [],
    },
    preferences: { selected: [], available: [] },
    mistral: { configured: true },
  },
  scope: {
    mode: 'consolidated',
    site: null,
    accountingAllocated: true,
    budgetAllocated: true,
    accountingMode: 'consolidated',
    budgetMode: 'consolidated',
    accountingSourceIds: ['source-1'],
    note: 'Tous les établissements et toutes les caisses incluses sont consolidés sans double comptage.',
  },
  sources: [
    {
      id: 'source-1',
      provider: 'FENNOA',
      name: 'Fennoa',
      sourceType: 'ACCOUNTING_API',
      status: 'READY',
      isPrimarySales: false,
      isPrimaryPos: false,
      lastSyncedAt: '2026-08-05T18:57:00Z',
      coverageStart: '2022-12-20',
      coverageEnd: '2026-08-05',
      site: null,
    },
    {
      id: 'source-2',
      provider: 'FLATPAY',
      name: 'FlatPay Kuusamo',
      sourceType: 'FILE_IMPORT',
      status: 'READY',
      isPrimarySales: true,
      isPrimaryPos: true,
      lastSyncedAt: '2026-08-05T19:00:00Z',
      coverageStart: '2026-03-01',
      coverageEnd: '2026-08-05',
      site: { id: 'site-1', name: 'Kuusamo' },
    },
    {
      id: 'source-3',
      provider: 'LOYVERSE',
      name: 'Loyverse Kuusamo',
      sourceType: 'POS_API',
      status: 'READY',
      isPrimarySales: true,
      isPrimaryPos: false,
      lastSyncedAt: '2026-08-05T19:00:00Z',
      coverageStart: '2023-08-04',
      coverageEnd: '2026-03-08',
      site: { id: 'site-1', name: 'Kuusamo' },
    },
  ],
  sites: [
    { id: 'site-1', name: 'Kuusamo' },
    { id: 'site-2', name: 'Oulu' },
  ],
  imports: [],
  quality: {
    level: 'ready',
    label: 'Données consolidées',
    connectedSourceCount: 3,
    sourceCount: 3,
    pendingReviewCount: 0,
    lastUpdatedAt: '2026-08-05T19:00:00Z',
  },
};

const sales = {
  period: {
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T23:59:59.999Z',
    days: 31,
    timeZone: 'Europe/Helsinki',
  },
  scope: { siteId: null },
  summary: {
    revenue: 28_640,
    netRevenue: 25_130,
    transactions: 988,
    averageTicket: 28.99,
    refunds: -186,
    discounts: 432,
    cancellations: 7,
    productCount: 68,
    categoryCount: 11,
    peakHour: null,
    peakWeekday: null,
  },
  comparisons: {
    previousPeriod: {
      from: '2026-07-01',
      to: '2026-07-31',
      revenue: 31_420,
      netRevenue: 27_560,
      transactions: 1_102,
      averageTicket: 28.51,
      refunds: -212,
      discounts: 510,
      cancellations: 9,
      revenueVariationPercent: -8.8,
      transactionVariationPercent: -10.3,
      averageTicketVariationPercent: 1.7,
    },
    previousYear: {
      from: '2025-08-01',
      to: '2025-08-31',
      revenue: 26_980,
      netRevenue: 23_670,
      transactions: 941,
      averageTicket: 28.67,
      refunds: -120,
      discounts: 390,
      cancellations: 5,
      revenueVariationPercent: 6.2,
      transactionVariationPercent: 5,
      averageTicketVariationPercent: 1.1,
    },
  },
  hourly: Array.from({ length: 17 }, (_, index) => ({
    hour: index + 6,
    label: `${String(index + 6).padStart(2, '0')}h`,
    revenue: index < 2 || index > 13 ? 0 : 540 + Math.sin(index) * 240,
    transactions: index < 2 || index > 13 ? 0 : 18 + index * 2,
    sharePercent: index < 2 || index > 13 ? 0 : 6.4,
    averageTicket: 27 + index / 5,
  })),
  weekdays: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(
    (label, index) => ({
      weekday: index + 1,
      label,
      revenue: 2_800 + index * 520,
      transactions: 95 + index * 18,
      sharePercent: 10 + index,
      averageTicket: 27 + index / 2,
    }),
  ),
  daily: Array.from({ length: 31 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    revenue: index % 7 === 1 ? 0 : 620 + ((index * 379) % 1_450),
    transactions: index % 7 === 1 ? 0 : 24 + ((index * 13) % 48),
  })),
  products: [],
  topProducts: Array.from({ length: 12 }, (_, index) => ({
    name: `Produit signature ${index + 1}`,
    category: index % 2 ? 'Boissons chaudes' : 'Pâtisserie artisanale',
    quantity: 130 - index * 7,
    gross: 1_250 - index * 64,
    net: 1_100 - index * 58,
    discount: index * 2,
    sharePercent: 9.8 - index * 0.5,
    previousQuantity: 118 - index * 6,
    quantityVariationPercent: index % 2 ? -4.5 : 8.2,
    margin: index % 3 ? 760 - index * 30 : null,
    marginRate: index % 3 ? 68 - index : null,
    unitCost: null,
    estimatedCost: null,
  })),
  lowProducts: Array.from({ length: 8 }, (_, index) => ({
    name: `Produit à surveiller ${index + 1}`,
    category: 'Épicerie',
    quantity: index + 1,
    gross: 8 + index * 7,
    net: 7 + index * 6,
    discount: 0,
    sharePercent: 0.1 + index / 20,
    previousQuantity: index + 3,
    quantityVariationPercent: -30,
    margin: null,
    marginRate: null,
    unitCost: null,
    estimatedCost: null,
  })),
  categories: Array.from({ length: 11 }, (_, index) => ({
    category: `Catégorie ${index + 1}`,
    quantity: 420 - index * 22,
    gross: 5_500 - index * 340,
    net: 4_820 - index * 300,
    sharePercent: 20 - index * 1.4,
  })),
  staffing: {
    available: true,
    assignments: 322,
    plannedHours: 2_463,
    revenuePerPlannedHour: 11.63,
    hourly: Array.from({ length: 15 }, (_, index) => ({
      hour: index + 7,
      plannedHours: 40 + index * 4,
      revenue: 420 + index * 65,
      transactions: 18 + index * 3,
      revenuePerPlannedHour: 10 + index / 3,
      transactionsPerPlannedHour: 0.5 + index / 25,
    })),
    pressureHours: [],
  },
  quality: {
    transactionRows: 988,
    crossSourceDuplicatesExcluded: 21,
    productRows: 4_284,
    productCoverageDays: 29,
    productCoveragePercent: 93.5,
    selectedProductReports: 5,
    overlappingProductReportsExcluded: 2,
    productPeriod: { from: '2026-08-01', to: '2026-08-29' },
    sources: [
      { id: 'source-2', name: 'FlatPay Kuusamo', provider: 'FLATPAY' },
      { id: 'source-3', name: 'Loyverse secours', provider: 'LOYVERSE' },
    ],
    limitations: [
      'Les coûts matières manquent encore pour 14 produits : leurs marges ne sont pas affichées.',
      'Deux jours de ventes produits sont absents, sans impact sur les transactions et le chiffre d’affaires consolidés.',
    ],
  },
  productComparisons: {
    previousPeriodCoveragePercent: 100,
    previousYearCoveragePercent: 87,
    previousYearProductCount: 64,
  },
};

describe('FinanceExportService', () => {
  const prisma = {
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: 'The French Café', logoDataUrl: null, mainSiteName: 'Kuusamo' }),
    },
    site: { findFirst: jest.fn().mockResolvedValue({ name: 'Kuusamo' }) },
    financeSettings: { findUnique: jest.fn().mockResolvedValue({ defaultCurrency: 'EUR' }) },
  };
  const finance = {
    assertReadable: jest.fn().mockResolvedValue(undefined),
    bootstrap: jest.fn().mockResolvedValue(bootstrap),
  };
  const insights = { build: jest.fn().mockResolvedValue(sales) };
  const service = new FinanceExportService(prisma as never, finance as never, insights as never);

  it.each([
    ['executive_annual', undefined],
    ['annual', undefined],
    ['monthly', undefined],
    ['daily', undefined],
    ['sales', 'daily'],
    ['sales', 'monthly'],
    ['sales', 'annual'],
    ['sales', 'custom'],
  ] as const)('génère un PDF lisible pour %s %s', async (report, exportPeriod) => {
    const result = await service.generate('org-1', { id: 'user-1' } as never, {
      report,
      period: exportPeriod,
      asOf: '2026-08-05',
      from: exportPeriod === 'custom' ? '2026-07-12' : undefined,
      to: exportPeriod === 'custom' ? '2026-08-05' : undefined,
    });
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
    const document = await PDFDocument.load(result.buffer);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(2);
    if (process.env.FINANCE_EXPORT_QA_DIR) {
      await mkdir(process.env.FINANCE_EXPORT_QA_DIR, { recursive: true });
      await writeFile(
        join(process.env.FINANCE_EXPORT_QA_DIR, `${report}-${exportPeriod ?? 'finance'}.pdf`),
        result.buffer,
      );
    }
  });
});
