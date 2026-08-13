import {
  allocateMonthlyBudgetPerCalendarDay,
  computeBudgetTransactionPacing,
  resolveFinanceAsOfDate,
  resolveFinanceSiteDataScope,
  resolveMonthlyActualTo,
  selectFinanceBudgetPlan,
} from './finance-analytics.service';

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
