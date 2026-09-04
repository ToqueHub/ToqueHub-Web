import { technicalSheetSalesTaxPolicy } from './technical-sheet-tax-policy';

describe('technicalSheetSalesTaxPolicy', () => {
  it('uses the French restaurant rate from the regulatory country', () => {
    expect(technicalSheetSalesTaxPolicy('FR')).toEqual(expect.objectContaining({ countryCode: 'FR', rate: 10, configured: true }));
  });

  it('uses the Finnish 2026 restaurant rate from the regulatory country', () => {
    expect(technicalSheetSalesTaxPolicy('FI')).toEqual(expect.objectContaining({ countryCode: 'FI', rate: 13.5, configured: true, effectiveFrom: '2026-01-01' }));
  });

  it('never invents a rate when the regulatory country is missing', () => {
    expect(technicalSheetSalesTaxPolicy(null)).toEqual(expect.objectContaining({ countryCode: null, rate: null, configured: false }));
  });
});
