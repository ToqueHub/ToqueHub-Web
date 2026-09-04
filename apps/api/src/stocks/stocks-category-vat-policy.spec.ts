import { isStockCategoryVatRateAllowed, stockCategoryVatPolicy } from './stocks-category-vat-policy';

describe('stockCategoryVatPolicy', () => {
  it('exposes the 2026 Finnish food and general rates', () => {
    const policy = stockCategoryVatPolicy('FI');

    expect(policy.defaultRate).toBe(13.5);
    expect(policy.options.map((option) => option.rate)).toEqual([13.5, 25.5]);
    expect(isStockCategoryVatRateAllowed(policy, 25.5)).toBe(true);
  });

  it('exposes the relevant metropolitan French food, restaurant and general rates', () => {
    const policy = stockCategoryVatPolicy('FR');

    expect(policy.defaultRate).toBe(5.5);
    expect(policy.options.map((option) => option.rate)).toEqual([5.5, 10, 20]);
    expect(isStockCategoryVatRateAllowed(policy, 13.5)).toBe(false);
  });
});
