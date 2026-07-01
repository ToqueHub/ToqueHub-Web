export enum UserRoleName {
  Administrator = 'Administrateur',
  Chef = 'Chef',
  SousChef = 'Second',
  Storekeeper = 'Magasinier',
  ReadOnly = 'Lecture seule',
}

export enum StockMovementType {
  Reception = 'RECEPTION',
  Production = 'PRODUCTION',
  Loss = 'LOSS',
  Correction = 'CORRECTION',
  Inventory = 'INVENTORY',
}

export interface OrganizationScoped {
  organizationId: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: UserRoleName | string;
}

export interface ProductSummary {
  id: string;
  name: string;
  sku?: string | null;
  unitId: string;
  categoryId?: string | null;
  primarySupplierId?: string | null;
  averagePrice?: string | number | null;
  minimumStock?: string | number | null;
  gtin?: string | null;
  originCountry?: string | null;
  packageLabel?: string | null;
  unitsPerPackage?: string | number | null;
  unitWeightGrams?: string | number | null;
  netWeightGrams?: string | number | null;
  ingredients?: string | null;
  allergensPresent?: string[];
  possibleTraces?: string[];
  dietaryTags?: string[];
  energyKj?: string | number | null;
  energyKcal?: string | number | null;
  fatGrams?: string | number | null;
  saturatedFatGrams?: string | number | null;
  carbohydratesGrams?: string | number | null;
  sugarsGrams?: string | number | null;
  fiberGrams?: string | number | null;
  proteinGrams?: string | number | null;
  saltGrams?: string | number | null;
  storageType?: string | null;
  shelfLifeAfterOpening?: string | null;
  storageInstructions?: string | null;
  preparationInstructions?: string | null;
}

export interface StockLevel {
  productId: string;
  productName: string;
  unitSymbol: string;
  quantity: number;
}
