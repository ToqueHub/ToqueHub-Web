import { FinanceAccountCategory } from '@prisma/client';
import {
  aggregateFinancePayroll,
  alignFinanceAccountingPeriods,
  allocateMonthlyBudgetPerCalendarDay,
  buildFinanceMonthlyComparisonRanges,
  resolveHistoricalPayrollRange,
  countMonths,
  computeBudgetTransactionPacing,
  deriveAccountingResults,
  fennoaBudgetMetricLines,
  hasAccountingTruthForMonth,
  listFennoaBudgets,
  resolveFinanceAsOfDate,
  resolveFinanceFiscalPeriod,
  resolveFinanceSiteDataScope,
  resolveFinanceStatementCategory,
  resolveMonthlyActualTo,
  revenuePercentOf,
  selectFinanceBudgetPlan,
  selectFennoaBudget,
} from './finance-analytics.service';

describe('Finance KPI revenue percentages', () => {
  it('calculates comparable financial KPIs against revenue from the same period', () => {
    expect(revenuePercentOf('revenue', 331_166.28, 331_166.28)).toBe(100);
    expect(revenuePercentOf('operating_expenses', 311_309.31, 331_166.28)).toBe(94);
    expect(revenuePercentOf('net_result', 15_361.86, 331_166.28)).toBe(4.6);
    expect(revenuePercentOf('net_result', -5_000, 100_000)).toBe(-5);
  });

  it('does not create a CA ratio for non-comparable KPIs or a zero revenue period', () => {
    expect(revenuePercentOf('average_ticket', 26, 331_166.28)).toBeNull();
    expect(revenuePercentOf('cash', 7_094, 331_166.28)).toBeNull();
    expect(revenuePercentOf('payroll', 10_000, 0)).toBeNull();
  });
});

describe('Finance accounting periods', () => {
  const periods = [
    {
      externalId: 1,
      startDate: new Date('2022-12-20T00:00:00.000Z'),
      endDate: new Date('2024-05-31T00:00:00.000Z'),
    },
    {
      externalId: 2,
      startDate: new Date('2024-06-01T00:00:00.000Z'),
      endDate: new Date('2025-05-31T00:00:00.000Z'),
    },
    {
      externalId: 3,
      startDate: new Date('2025-06-01T00:00:00.000Z'),
      endDate: new Date('2026-05-31T00:00:00.000Z'),
    },
  ];

  it('selects the Fennoa period containing the requested closing day', () => {
    const selected = resolveFinanceFiscalPeriod(periods, new Date('2026-05-31T23:59:59.999Z'), 1);

    expect(selected).toMatchObject({
      externalId: 3,
      source: 'accounting_period',
      startDate: new Date('2025-06-01T00:00:00.000Z'),
      endDate: new Date('2026-05-31T23:59:59.999Z'),
    });
    expect(countMonths(selected.startDate, selected.endDate)).toBe(12);
  });

  it('keeps an exceptional first accounting period at its actual 18-month duration', () => {
    const selected = resolveFinanceFiscalPeriod(periods, new Date('2025-05-31T23:59:59.999Z'), 1);

    expect(selected.externalId).toBe(2);
    expect(countMonths(selected.startDate, selected.endDate)).toBe(12);

    const firstPeriod = resolveFinanceFiscalPeriod(
      periods,
      new Date('2024-05-31T23:59:59.999Z'),
      1,
    );
    expect(firstPeriod.externalId).toBe(1);
    expect(firstPeriod.startDate).toEqual(new Date('2022-12-20T00:00:00.000Z'));
    expect(countMonths(firstPeriod.startDate, firstPeriod.endDate)).toBe(18);
  });

  it('aligns prior Fennoa periods by elapsed accounting months', () => {
    const selected = resolveFinanceFiscalPeriod(periods, new Date('2026-05-31T23:59:59.999Z'), 1);
    const aligned = alignFinanceAccountingPeriods(
      periods,
      selected,
      new Date('2026-05-31T23:59:59.999Z'),
    );

    expect(aligned.map(({ externalId, from, to }) => ({ externalId, from, to }))).toEqual([
      {
        externalId: 3,
        from: new Date('2025-06-01T00:00:00.000Z'),
        to: new Date('2026-05-31T23:59:59.999Z'),
      },
      {
        externalId: 2,
        from: new Date('2024-06-01T00:00:00.000Z'),
        to: new Date('2025-05-31T23:59:59.999Z'),
      },
      {
        externalId: 1,
        from: new Date('2022-12-20T00:00:00.000Z'),
        to: new Date('2023-12-19T23:59:59.999Z'),
      },
    ]);
  });

  it('falls back to the configured 12-month fiscal year outside known Fennoa periods', () => {
    const selected = resolveFinanceFiscalPeriod([], new Date('2026-03-15T12:00:00.000Z'), 6);

    expect(selected).toMatchObject({
      externalId: null,
      source: 'settings',
      startDate: new Date('2025-06-01T00:00:00.000Z'),
      endDate: new Date('2026-05-31T23:59:59.999Z'),
    });
  });
});

describe('Finance monthly comparison periods', () => {
  it('keeps prior years at the same stage but shows the previous month in full', () => {
    const ranges = buildFinanceMonthlyComparisonRanges(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-15T23:59:59.999Z'),
      false,
    );

    expect(ranges.map(({ id, detail, from, to }) => ({ id, detail, from, to }))).toEqual([
      {
        id: 'current',
        detail: 'Mois en cours à date',
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-15T23:59:59.999Z'),
      },
      {
        id: 'n_1',
        detail: 'Même mois à date · N-1 · masse salariale sur le mois complet',
        from: new Date('2025-08-01T00:00:00.000Z'),
        to: new Date('2025-08-15T23:59:59.999Z'),
      },
      {
        id: 'n_2',
        detail: 'Même mois à date · N-2 · masse salariale sur le mois complet',
        from: new Date('2024-08-01T00:00:00.000Z'),
        to: new Date('2024-08-15T23:59:59.999Z'),
      },
      {
        id: 'm_1',
        detail: 'Mois précédent complet',
        from: new Date('2026-07-01T00:00:00.000Z'),
        to: new Date('2026-07-31T23:59:59.999Z'),
      },
    ]);
  });

  it('uses the complete realized month for prior-year payroll only', () => {
    const partialFrom = new Date('2025-08-01T00:00:00.000Z');
    const partialTo = new Date('2025-08-15T23:59:59.999Z');

    expect(resolveHistoricalPayrollRange('monthly', 'n_1', partialFrom, partialTo)).toEqual({
      from: partialFrom,
      to: new Date('2025-08-31T23:59:59.999Z'),
    });
    expect(resolveHistoricalPayrollRange('monthly', 'current', partialFrom, partialTo)).toEqual({
      from: partialFrom,
      to: partialTo,
    });
    expect(resolveHistoricalPayrollRange('monthly', 'm_1', partialFrom, partialTo)).toEqual({
      from: partialFrom,
      to: partialTo,
    });
  });

  it('aggregates full-month payroll without recomputing unrelated finance metrics', () => {
    const categories = new Map([
      ['6000', FinanceAccountCategory.MATERIAL_PURCHASES],
      ['6400', FinanceAccountCategory.PAYROLL],
    ]);
    const ledger = [
      {
        entryDate: new Date('2025-07-10T00:00:00.000Z'),
        accountCode: '6000',
        debit: 4_000,
        credit: 0,
      },
      {
        entryDate: new Date('2025-08-05T00:00:00.000Z'),
        accountCode: '6400',
        debit: 12_000,
        credit: 0,
      },
      {
        entryDate: new Date('2025-08-25T00:00:00.000Z'),
        accountCode: '6400',
        debit: 8_000,
        credit: 500,
      },
      {
        entryDate: new Date('2025-08-10T00:00:00.000Z'),
        accountCode: '6000',
        debit: 6_000,
        credit: 0,
      },
      {
        entryDate: new Date('2025-09-01T00:00:00.000Z'),
        accountCode: '6400',
        debit: 99_000,
        credit: 0,
      },
    ];

    expect(
      aggregateFinancePayroll(
        ledger,
        categories,
        new Date('2025-08-01T00:00:00.000Z'),
        new Date('2025-08-31T23:59:59.999Z'),
      ),
    ).toEqual({ payroll: 19_500, source: 'accounting' });
    expect(
      aggregateFinancePayroll(
        ledger,
        categories,
        new Date('2025-07-01T00:00:00.000Z'),
        new Date('2025-07-31T23:59:59.999Z'),
      ),
    ).toEqual({ payroll: 0, source: 'accounting' });
    expect(
      aggregateFinancePayroll(
        ledger,
        categories,
        new Date('2024-08-01T00:00:00.000Z'),
        new Date('2024-08-31T23:59:59.999Z'),
      ),
    ).toEqual({ payroll: null, source: 'unavailable' });
  });
});

describe('Finance accounting revenue coverage', () => {
  const monthEnd = new Date('2026-07-31T23:59:59.999Z');

  it('does not apply a global lock when the selected scope has no accounting revenue rows', () => {
    expect(
      hasAccountingTruthForMonth({
        periodEnd: monthEnd,
        accountingLockedThrough: monthEnd,
        accountingCoverageThrough: null,
        hasAccountingRevenueRows: false,
      }),
    ).toBe(false);
  });

  it('accepts a covered zero-revenue month and a locked month containing revenue entries', () => {
    expect(
      hasAccountingTruthForMonth({
        periodEnd: monthEnd,
        accountingLockedThrough: null,
        accountingCoverageThrough: monthEnd,
        hasAccountingRevenueRows: false,
      }),
    ).toBe(true);
    expect(
      hasAccountingTruthForMonth({
        periodEnd: monthEnd,
        accountingLockedThrough: monthEnd,
        accountingCoverageThrough: null,
        hasAccountingRevenueRows: true,
      }),
    ).toBe(true);
  });
});

describe('Finance accounting result lines', () => {
  it('reconciles the Fennoa operating and net results without using cash-register revenue', () => {
    expect(
      deriveAccountingResults({
        accountingRevenue: 331_166.28,
        otherOperatingIncome: 995.4,
        operatingExpenses: 311_309.31,
        depreciation: 15_711.72,
        financialExpenses: 5_490.51,
        taxes: 0,
      }),
    ).toEqual({
      resultBeforeDepreciation: 36_564.09,
      accountingOperatingResult: 20_852.37,
      netResult: 15_361.86,
    });
  });

  it('applies the Finnish chart of accounts while preserving other countries', () => {
    expect(resolveFinanceStatementCategory('6100', FinanceAccountCategory.OTHER_OPEX, 'FI')).toBe(
      FinanceAccountCategory.PAYROLL,
    );
    expect(resolveFinanceStatementCategory('6500', FinanceAccountCategory.OTHER_OPEX, 'FI')).toBe(
      FinanceAccountCategory.PAYROLL,
    );
    expect(resolveFinanceStatementCategory('8300', FinanceAccountCategory.FINANCIAL, 'FI')).toBe(
      FinanceAccountCategory.OTHER_OPEX,
    );
    expect(resolveFinanceStatementCategory('9250', FinanceAccountCategory.TAX, 'FI')).toBe(
      FinanceAccountCategory.FINANCIAL,
    );
    expect(resolveFinanceStatementCategory('8300', FinanceAccountCategory.FINANCIAL, 'FR')).toBe(
      FinanceAccountCategory.FINANCIAL,
    );
  });
});

describe('Fennoa accounting budget', () => {
  const row = (
    externalBudgetId: number,
    budgetName: string,
    accountCode: string,
    amount: number,
    month = 1,
    accountingPeriodExternalId = 3,
  ) => ({
    accountingPeriodExternalId,
    externalBudgetId,
    budgetName,
    accountCode,
    month,
    amount,
  });

  it('selects the latest Fennoa budget for the selected accounting period', () => {
    const rows = [
      row(5, 'Budjetti 2026', '3000', 334_165),
      row(8, 'Päivitetty budjetti 2026', '3000', 327_140.68),
      row(9, 'Budget 2027', '3000', 342_000, 1, 4),
    ];
    const selected = selectFennoaBudget(rows, 3);

    expect(selected).toMatchObject({
      externalBudgetId: 8,
      name: 'Päivitetty budjetti 2026',
    });
    expect(selected?.lines).toHaveLength(1);
    expect(listFennoaBudgets(rows, 3).map(({ externalBudgetId }) => externalBudgetId)).toEqual([
      8, 5,
    ]);
  });

  it('converts the updated Fennoa budget accounts into comparable annual KPIs', () => {
    const metricLines = fennoaBudgetMetricLines(
      [
        row(8, 'Päivitetty budjetti 2026', '3000', 327_140.68),
        row(8, 'Päivitetty budjetti 2026', '3990', 250.8),
        row(8, 'Päivitetty budjetti 2026', '4000', -88_825.48),
        row(8, 'Päivitetty budjetti 2026', '5000', -101_458.18),
        row(8, 'Päivitetty budjetti 2026', '6800', -8_906.88),
        row(8, 'Päivitetty budjetti 2026', '7000', -102_003.07),
        row(8, 'Päivitetty budjetti 2026', '9550', -5_555.35),
        row(8, 'Päivitetty budjetti 2026', '9900', -4_432.54),
      ],
      new Date('2025-06-01T00:00:00.000Z'),
    );
    const totals = Object.fromEntries(
      metricLines.map(({ metric, amount, periodStart }) => [
        metric,
        { amount: Number(amount), periodStart },
      ]),
    );

    expect(totals).toMatchObject({
      revenue: { amount: 327_140.68 },
      material_purchases: { amount: 88_825.48 },
      payroll: { amount: 101_458.18 },
      depreciation: { amount: 8_906.88 },
      operating_expenses: { amount: 301_193.61 },
      result_before_depreciation: { amount: 35_104.75 },
      operating_result: { amount: 26_197.87 },
      net_result: { amount: 16_209.98 },
    });
    expect(totals.revenue.periodStart).toEqual(new Date('2025-06-01T00:00:00.000Z'));
  });
});

describe('Finance automatic reference date', () => {
  const now = new Date('2026-08-07T21:55:00.000Z');

  it('uses the latest day containing real sales instead of stale source coverage', () => {
    expect(
      resolveFinanceAsOfDate({
        latestSaleDate: new Date('2026-08-07T09:19:00.000Z'),
        latestCoverage: new Date('2026-08-04T23:59:59.999Z'),
        now,
      }),
    ).toEqual(new Date('2026-08-07T23:59:59.999Z'));
  });

  it('falls back to source coverage when no sale is available', () => {
    expect(
      resolveFinanceAsOfDate({
        latestCoverage: new Date('2026-08-04T18:33:00.000Z'),
        now,
      }),
    ).toEqual(new Date('2026-08-04T23:59:59.999Z'));
  });

  it('keeps an explicitly selected day even when it has no sales', () => {
    expect(
      resolveFinanceAsOfDate({
        requestedAsOf: new Date('2026-08-08T00:00:00.000Z'),
        latestSaleDate: new Date('2026-08-07T09:19:00.000Z'),
        latestCoverage: new Date('2026-08-04T23:59:59.999Z'),
        now,
      }),
    ).toEqual(new Date('2026-08-08T23:59:59.999Z'));
  });
});

describe('Finance daily budget allocation', () => {
  it('uses the actual number of calendar days in the selected month', () => {
    expect(
      allocateMonthlyBudgetPerCalendarDay(new Date('2026-06-01T00:00:00.000Z'), {
        revenue: 28_060.67,
        operatingResult: 2_464.96,
      }),
    ).toEqual({ revenue: 935.36, operatingResult: 82.17 });

    expect(
      allocateMonthlyBudgetPerCalendarDay(new Date('2026-08-01T00:00:00.000Z'), {
        revenue: 30_315,
        operatingResult: 4_516,
      }),
    ).toEqual({ revenue: 977.9, operatingResult: 145.68 });
  });

  it('keeps missing budget metrics unavailable', () => {
    expect(
      allocateMonthlyBudgetPerCalendarDay(new Date('2026-06-01T00:00:00.000Z'), {
        revenue: null,
        operatingResult: null,
      }),
    ).toEqual({ revenue: null, operatingResult: null });
  });
});

describe('Finance transaction budget pacing', () => {
  it('derives daily, weekly and monthly targets from the revenue budget', () => {
    const pacing = computeBudgetTransactionPacing({
      budgetRevenue: 30_000,
      referenceTicket: 30,
      budgetActiveDays: 25,
      budgetMonths: 1,
      activeDaysPerWeek: 6,
      actualTransactions: 236,
      observedActiveDays: 5,
      observedMonths: 1,
    });
    expect(pacing).toMatchObject({
      targetDay: 40,
      targetWeek: 240,
      targetMonth: 1_000,
      actualDay: 47.2,
      actualMonth: 236,
    });
    expect(pacing.actualWeek).toBeCloseTo(283.2);
  });

  it('keeps the target unavailable without a budget or reference ticket', () => {
    expect(
      computeBudgetTransactionPacing({
        budgetRevenue: null,
        referenceTicket: 30,
        budgetActiveDays: 25,
        budgetMonths: 1,
        activeDaysPerWeek: 6,
        actualTransactions: 0,
        observedActiveDays: 0,
        observedMonths: 1,
      }),
    ).toEqual({
      targetDay: null,
      targetWeek: null,
      targetMonth: null,
      actualDay: null,
      actualWeek: null,
      actualMonth: null,
    });
  });
});

describe('Finance monthly display range', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');

  it('keeps the current month limited to the available date', () => {
    const asOf = new Date('2026-08-05T23:59:59.999Z');
    expect(resolveMonthlyActualTo(asOf, now)).toEqual(asOf);
  });

  it('expands a selected past month to its last day', () => {
    expect(resolveMonthlyActualTo(new Date('2026-07-09T23:59:59.999Z'), now)).toEqual(
      new Date('2026-07-31T23:59:59.999Z'),
    );
  });
});

describe('Finance site accounting and budget scope', () => {
  it('uses the stored global accounting data for the only active site', () => {
    expect(
      resolveFinanceSiteDataScope({
        siteId: 'kuusamo',
        activeSalesSiteIds: ['kuusamo'],
        directAccountingSourceIds: [],
        globalAccountingSourceIds: ['fennoa'],
        budgetSiteId: 'kuusamo',
        hasBudget: true,
      }),
    ).toEqual({
      accountingMode: 'exclusive_site_fallback',
      accountingSourceIds: ['fennoa'],
      budgetMode: 'direct',
      includeBudget: true,
    });
  });

  it('does not assign global accounting data when several sites are active', () => {
    expect(
      resolveFinanceSiteDataScope({
        siteId: 'kuusamo',
        activeSalesSiteIds: ['kuusamo', 'oulu'],
        directAccountingSourceIds: [],
        globalAccountingSourceIds: ['fennoa'],
        budgetSiteId: 'kuusamo',
        hasBudget: true,
      }),
    ).toEqual({
      accountingMode: 'unavailable',
      accountingSourceIds: [],
      budgetMode: 'direct',
      includeBudget: true,
    });
  });

  it('includes every stored source in the consolidated view without duplicates', () => {
    expect(
      resolveFinanceSiteDataScope({
        activeSalesSiteIds: ['kuusamo', 'oulu'],
        directAccountingSourceIds: ['fennoa', 'local-ledger'],
        globalAccountingSourceIds: ['fennoa'],
        budgetSiteId: null,
        hasBudget: true,
      }),
    ).toEqual({
      accountingMode: 'consolidated',
      accountingSourceIds: ['fennoa', 'local-ledger'],
      budgetMode: 'consolidated',
      includeBudget: true,
    });
  });
});

describe('Finance site budget selection', () => {
  const plans = [
    { id: 'kuusamo-budget', siteId: 'kuusamo' },
    { id: 'oulu-budget', siteId: 'oulu' },
    { id: 'legacy-budget', siteId: null },
  ];

  it('selects the budget explicitly assigned to the requested site', () => {
    expect(selectFinanceBudgetPlan(plans, 'kuusamo')?.id).toBe('kuusamo-budget');
    expect(selectFinanceBudgetPlan(plans, 'oulu')?.id).toBe('oulu-budget');
  });

  it('uses an unassigned legacy budget only as a migration fallback', () => {
    expect(selectFinanceBudgetPlan([plans[2]], 'kuusamo')?.id).toBe('legacy-budget');
  });

  it('does not leak another site budget into the requested site', () => {
    expect(selectFinanceBudgetPlan([plans[0]], 'oulu')).toBeNull();
  });
});
