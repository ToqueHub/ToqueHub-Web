export const MENU_NUTRITION_FIELDS = [
  'energyKj',
  'energyKcal',
  'fatGrams',
  'saturatedFatGrams',
  'carbohydratesGrams',
  'sugarsGrams',
  'fiberGrams',
  'proteinGrams',
  'saltGrams',
] as const;

type NutritionField = (typeof MENU_NUTRITION_FIELDS)[number];
type ConvertQuantity = (
  quantity: number,
  fromUnitId?: string | null,
  toUnitId?: string | null,
) => number | null;

export type MenuCompositionResult = {
  allergens: {
    present: Array<{ name: string; products: string[] }>;
    traces: Array<{ name: string; products: string[] }>;
    unresolvedIngredients: string[];
  };
  nutrition: {
    referencePortions: number;
    total: Record<NutritionField, number | null>;
    perPortion: Record<NutritionField, number | null>;
    complete: boolean;
    missingProducts: string[];
  };
};

export function menuProductQuantityGrams(product: any, quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const symbol = normalize(product?.unit?.symbol);
  const unitName = normalize(product?.unit?.name);
  if (
    ['g', 'gr', 'gramme', 'grammes', 'gram', 'grams'].includes(symbol) ||
    unitName === 'gramme'
  )
    return quantity;
  if (
    ['kg', 'kilogramme', 'kilogrammes', 'kilogram', 'kilograms'].includes(symbol) ||
    unitName === 'kilogramme'
  )
    return quantity * 1_000;
  if (
    ['mg', 'milligramme', 'milligrammes', 'milligram', 'milligrams'].includes(symbol) ||
    unitName === 'milligramme'
  )
    return quantity / 1_000;

  const unitWeight = Number(product?.unitWeightGrams);
  if (Number.isFinite(unitWeight) && unitWeight > 0) return quantity * unitWeight;
  const netWeight = Number(product?.netWeightGrams);
  if (product?.unit?.type === 'PACKAGE' && Number.isFinite(netWeight) && netWeight > 0)
    return quantity * netWeight;
  const unitsPerPackage = Number(product?.unitsPerPackage);
  if (
    product?.unit?.type === 'COUNT' &&
    Number.isFinite(netWeight) &&
    netWeight > 0 &&
    Number.isFinite(unitsPerPackage) &&
    unitsPerPackage > 0
  )
    return quantity * (netWeight / unitsPerPackage);
  return null;
}

export function calculateProductComposition(
  product: any,
  quantityInProductUnit: number,
  referencePortions: number,
) {
  const composition = newComposition();
  addProductComposition(composition, product, quantityInProductUnit);
  return serializeComposition(composition, referencePortions);
}

export function calculateSheetComposition(input: {
  sheetsById: Map<string, any>;
  convert: ConvertQuantity;
  sheetId: string;
  requiredOutput: number;
  referencePortions: number;
}) {
  const composition = newComposition();
  collectSheetComposition(
    composition,
    input.sheetsById,
    input.convert,
    input.sheetId,
    input.requiredOutput,
  );
  return serializeComposition(composition, input.referencePortions);
}

function newComposition() {
  return {
    present: new Map<string, { name: string; products: Set<string> }>(),
    traces: new Map<string, { name: string; products: Set<string> }>(),
    nutrition: Object.fromEntries(
      MENU_NUTRITION_FIELDS.map((field) => [
        field,
        { value: 0, seen: false, missingProducts: new Set<string>() },
      ]),
    ) as Record<
      NutritionField,
      { value: number; seen: boolean; missingProducts: Set<string> }
    >,
    unresolvedIngredients: new Set<string>(),
  };
}

function addProductComposition(
  composition: ReturnType<typeof newComposition>,
  product: any,
  quantityInProductUnit: number | null,
) {
  const productName = product?.name || 'Produit non renseigné';
  for (const name of product?.allergensPresent ?? [])
    addAllergen(composition.present, String(name), productName);
  for (const name of product?.possibleTraces ?? [])
    addAllergen(composition.traces, String(name), productName);
  const grams =
    quantityInProductUnit == null
      ? null
      : menuProductQuantityGrams(product, quantityInProductUnit);
  for (const field of MENU_NUTRITION_FIELDS) {
    const metric = composition.nutrition[field];
    const rawValue = product?.[field];
    const value = rawValue == null ? Number.NaN : Number(rawValue);
    if (grams == null || !Number.isFinite(value)) {
      metric.missingProducts.add(productName);
      continue;
    }
    metric.value += value * (grams / 100);
    metric.seen = true;
  }
}

function collectSheetComposition(
  composition: ReturnType<typeof newComposition>,
  sheetsById: Map<string, any>,
  convert: ConvertQuantity,
  sheetId: string,
  requiredOutput: number,
  visited: string[] = [],
) {
  const sheet = sheetsById.get(sheetId);
  if (!sheet || visited.includes(sheetId) || requiredOutput <= 0) {
    if (!sheet) composition.unresolvedIngredients.add('Fiche technique introuvable');
    return;
  }
  const factor = requiredOutput / Math.max(Number(sheet.referencePortions ?? 1), 0.001);
  for (const line of sheet.ingredients ?? []) {
    const requiredInLineUnit = Number(line.quantity) * factor;
    if (line.sourceTechnicalSheetId) {
      const source = sheetsById.get(line.sourceTechnicalSheetId);
      const requiredYield =
        source?.yieldUnitId != null
          ? convert(requiredInLineUnit, line.unitId, source.yieldUnitId)
          : null;
      if (!source || requiredYield == null) {
        composition.unresolvedIngredients.add(source?.name ?? line.product?.name ?? 'Sous-recette');
        continue;
      }
      collectSheetComposition(
        composition,
        sheetsById,
        convert,
        source.id,
        requiredYield,
        [...visited, sheetId],
      );
      continue;
    }
    const requiredProductUnit = convert(
      requiredInLineUnit,
      line.unitId,
      line.product?.unitId,
    );
    const declaredAllergens = (line.allergens ?? [])
      .map((entry: any) => entry.allergen?.name)
      .filter(Boolean);
    const product = declaredAllergens.length
      ? {
          ...line.product,
          allergensPresent: [
            ...(line.product?.allergensPresent ?? []),
            ...declaredAllergens,
          ],
        }
      : line.product;
    addProductComposition(composition, product, requiredProductUnit);
    if (requiredProductUnit == null)
      composition.unresolvedIngredients.add(line.product?.name ?? 'Produit');
  }
}

function serializeComposition(
  composition: ReturnType<typeof newComposition>,
  referencePortions: number,
): MenuCompositionResult {
  const presentKeys = new Set(composition.present.keys());
  const serializeAllergens = (
    values: Map<string, { name: string; products: Set<string> }>,
    removePresent: boolean,
  ) =>
    [...values.entries()]
      .filter(([key]) => !removePresent || !presentKeys.has(key))
      .map(([, value]) => ({ name: value.name, products: [...value.products].sort() }))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr'));
  const total = {} as Record<NutritionField, number | null>;
  const perPortion = {} as Record<NutritionField, number | null>;
  const missingProducts = new Set<string>(composition.unresolvedIngredients);
  for (const field of MENU_NUTRITION_FIELDS) {
    const metric = composition.nutrition[field];
    for (const productName of metric.missingProducts) missingProducts.add(productName);
    total[field] =
      metric.seen && metric.missingProducts.size === 0
        ? Math.round(metric.value * 1_000) / 1_000
        : null;
    perPortion[field] =
      total[field] != null && referencePortions > 0
        ? Math.round((total[field]! / referencePortions) * 1_000) / 1_000
        : null;
  }
  return {
    allergens: {
      present: serializeAllergens(composition.present, false),
      traces: serializeAllergens(composition.traces, true),
      unresolvedIngredients: [...composition.unresolvedIngredients].sort(),
    },
    nutrition: {
      referencePortions,
      total,
      perPortion,
      complete: MENU_NUTRITION_FIELDS.every((field) => total[field] != null),
      missingProducts: [...missingProducts].sort(),
    },
  };
}

function addAllergen(
  target: Map<string, { name: string; products: Set<string> }>,
  name: string,
  productName: string,
) {
  const key = normalize(name);
  if (!key) return;
  const current = target.get(key) ?? { name: name.trim(), products: new Set<string>() };
  current.products.add(productName);
  target.set(key, current);
}

function normalize(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
