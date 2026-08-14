import {
  assessFinanceBudgetProposal,
  normalizeFinanceBudgetProposal,
  type BudgetReference,
} from './finance-ai.service';

describe('Finance Mistral budget proposal safeguards', () => {
  const target = {
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-07-31T23:59:59.999Z'),
    currency: 'EUR',
  };

  it('recalculates every result from the proposed primitive amounts', () => {
    const proposal = normalizeFinanceBudgetProposal(
      {
        name: 'Budget prudent',
        summary: 'Saisonnalité conservée.',
        confidence: 'medium',
        assumptions: ['Croissance modérée'],
        months: [
          {
            month: 1,
            revenue: 40_000,
            otherOperatingIncome: 100,
            materialPurchases: 10_000,
            payroll: 12_000,
            depreciation: 1_000,
            otherOpex: 9_000,
            financialResult: -500,
            taxes: 300,
            rationale: 'Juin historique.',
          },
          {
            month: 2,
            revenue: 50_000,
            otherOperatingIncome: 0,
            materialPurchases: 12_000,
            payroll: 12_000,
            depreciation: 1_000,
            otherOpex: 9_500,
            financialResult: -500,
            taxes: 500,
            rationale: 'Juillet plus actif.',
          },
        ],
      },
      target,
    );

    expect(proposal.months[0]).toMatchObject({
      operatingExpenses: 32_000,
      resultBeforeDepreciation: 9_100,
      operatingResult: 8_100,
      netResult: 7_300,
    });
    expect(proposal.totals).toMatchObject({
      revenue: 90_000,
      operatingExpenses: 66_500,
      operatingResult: 23_600,
      netResult: 21_800,
    });
  });

  it('rejects missing, duplicated or implausibly large monthly values', () => {
    const month = {
      month: 1,
      revenue: 40_000,
      otherOperatingIncome: 0,
      materialPurchases: 10_000,
      payroll: 12_000,
      depreciation: 1_000,
      otherOpex: 9_000,
      financialResult: -500,
      taxes: 0,
      rationale: '',
    };
    expect(() =>
      normalizeFinanceBudgetProposal(
        { months: [month, { ...month, revenue: 50_000 }] },
        target,
      ),
    ).toThrow('dupliqué');
    expect(() =>
      normalizeFinanceBudgetProposal(
        { months: [month, { ...month, month: 2, revenue: 2_000_000 }] },
        target,
        100_000,
      ),
    ).toThrow('anormalement élevé');
  });

  it('blocks a proposal whose profitability is disconnected from the latest actual period', () => {
    const annualTarget = {
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2027-05-31T23:59:59.999Z'),
      currency: 'EUR',
    };
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      revenue: 328_240 / 12,
      otherOperatingIncome: 700 / 12,
      materialPurchases: 72_000 / 12,
      payroll: 98_000 / 12,
      depreciation: 15_712 / 12,
      otherOpex: 66_031 / 12,
      financialResult: -6_000 / 12,
      taxes: 0,
      rationale: 'Saisonnalité historique.',
    }));
    const proposal = normalizeFinanceBudgetProposal(
      { name: 'Budget trop optimiste', summary: '', confidence: 'medium', assumptions: [], months },
      annualTarget,
    );
    const referenceMonthly = Array.from({ length: 12 }, (_, index) => ({
      periodStart: new Date(Date.UTC(2025, 5 + index, 1)).toISOString(),
      revenue: 331_166.28 / 12,
      otherOperatingIncome: 995.4 / 12,
      materialPurchases: 72_000 / 12,
      payroll: 101_976.47 / 12,
      depreciation: 15_711.72 / 12,
      otherOpex: 121_621.12 / 12,
      financialResult: -5_490.51 / 12,
      taxes: 0,
    }));
    const reference: BudgetReference = {
      startDate: '2025-06-01T00:00:00.000Z',
      endDate: '2026-05-31T23:59:59.999Z',
      months: 12,
      expectedMonths: 12,
      complete: true,
      totals: {
        revenue: 331_166.28,
        otherOperatingIncome: 995.4,
        materialPurchases: 72_000,
        payroll: 101_976.47,
        depreciation: 15_711.72,
        otherOpex: 121_621.12,
        financialResult: -5_490.51,
        taxes: 0,
        operatingExpenses: 311_309.31,
        resultBeforeDepreciation: 36_564.09,
        operatingResult: 20_852.37,
        netResult: 15_361.86,
      },
      ratios: {
        operatingExpenses: 94.0,
        materialPurchases: 21.74,
        payroll: 30.79,
        netMargin: 4.64,
      },
      monthly: referenceMonthly,
    };

    const assessment = assessFinanceBudgetProposal(proposal, reference, {
      months: 41,
      periods: 3,
    });

    expect(assessment.canAccept).toBe(false);
    expect(assessment.confidence).toBe('low');
    expect(
      assessment.checks
        .filter(({ severity }) => severity === 'blocking')
        .map(({ id }) => id),
    ).toEqual(expect.arrayContaining(['operating_expense_ratio', 'net_margin']));
  });
});
