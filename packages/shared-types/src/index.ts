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
}

export interface StockLevel {
  productId: string;
  productName: string;
  unitSymbol: string;
  quantity: number;
}
