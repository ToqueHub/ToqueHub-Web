export type TechnicalSheetSalesTaxPolicy = {
  countryCode: string | null;
  countryLabel: string | null;
  rate: number | null;
  configured: boolean;
  scopeLabel: string;
  effectiveFrom: string | null;
};

const RESTAURANT_SALES_TAX_POLICIES: Record<string, Omit<TechnicalSheetSalesTaxPolicy, 'countryCode' | 'configured'>> = {
  FR: {
    countryLabel: 'France',
    rate: 10,
    scopeLabel: 'Restauration et consommation immédiate, hors boissons alcooliques',
    effectiveFrom: '2014-01-01',
  },
  FI: {
    countryLabel: 'Finlande',
    rate: 13.5,
    scopeLabel: 'Alimentation, restauration et services de repas, hors boissons alcooliques',
    effectiveFrom: '2026-01-01',
  },
};

export function technicalSheetSalesTaxPolicy(countryCode?: string | null): TechnicalSheetSalesTaxPolicy {
  const normalized = String(countryCode || '').trim().toUpperCase();
  const policy = RESTAURANT_SALES_TAX_POLICIES[normalized];
  if (!policy) {
    return {
      countryCode: normalized || null,
      countryLabel: null,
      rate: null,
      configured: false,
      scopeLabel: 'Taux de vente restauration non configuré',
      effectiveFrom: null,
    };
  }
  return { countryCode: normalized, configured: true, ...policy };
}
