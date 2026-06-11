export const CORE_MODULES = [
  'organizations',
  'users',
  'catalog',
  'suppliers',
  'stocks',
  'lots',
] as const;

export type CoreModule = (typeof CORE_MODULES)[number];

export const STOCK_MOVEMENT_TYPES = [
  'RECEPTION',
  'PRODUCTION',
  'LOSS',
  'CORRECTION',
  'INVENTORY',
] as const;

export type StockMovementTypeValue = (typeof STOCK_MOVEMENT_TYPES)[number];

export function isPositiveQuantity(quantity: number): boolean {
  return Number.isFinite(quantity) && quantity > 0;
}
