import {
  computeBudgetTransactionPacing,
  resolveMonthlyActualTo,
} from './finance-analytics.service';

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
