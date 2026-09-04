export type StockCategoryVatOption = {
  rate: number;
  label: string;
  description: string;
};

export type StockCategoryVatPolicy = {
  countryCode: string | null;
  countryLabel: string | null;
  defaultRate: number | null;
  options: StockCategoryVatOption[];
};

const POLICIES: Record<string, Omit<StockCategoryVatPolicy, 'countryCode'>> = {
  FI: {
    countryLabel: 'Finlande',
    defaultRate: 13.5,
    options: [
      {
        rate: 13.5,
        label: 'Alimentation et restauration',
        description: 'Denrées, ingrédients, boissons sans alcool et services de repas.',
      },
      {
        rate: 25.5,
        label: 'Alcool et taux général',
        description: 'Boissons alcooliques, produits non alimentaires et services au taux normal.',
      },
    ],
  },
  FR: {
    countryLabel: 'France métropolitaine',
    defaultRate: 5.5,
    options: [
      {
        rate: 5.5,
        label: 'Denrées alimentaires',
        description: 'Aliments, ingrédients et boissons sans alcool sans consommation immédiate.',
      },
      {
        rate: 10,
        label: 'Restauration',
        description: 'Repas servis sur place ou produits préparés pour consommation immédiate.',
      },
      {
        rate: 20,
        label: 'Alcool et taux général',
        description: 'Boissons alcooliques, produits non alimentaires et services au taux normal.',
      },
    ],
  },
};

export function stockCategoryVatPolicy(countryCode?: string | null): StockCategoryVatPolicy {
  const normalized = String(countryCode ?? '').trim().toUpperCase();
  const policy = POLICIES[normalized];
  return policy
    ? { countryCode: normalized, ...policy }
    : { countryCode: normalized || null, countryLabel: null, defaultRate: null, options: [] };
}

export function isStockCategoryVatRateAllowed(policy: StockCategoryVatPolicy, rate: number) {
  return policy.options.some((option) => Math.abs(option.rate - rate) < 0.001);
}
