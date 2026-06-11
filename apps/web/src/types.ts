export type EstablishmentType = 'Restaurant' | 'EHPAD' | 'Collectivité' | 'Hôtel' | 'Traiteur' | 'Cuisine centrale' | 'Autre';
export type TeamSize = '1-5' | '6-10' | '11-20' | '20+';

export interface CompleteOnboardingPayload {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organizationName: string;
  establishmentType?: EstablishmentType;
  teamSize?: TeamSize;
  logoDataUrl?: string;
}

export interface SystemStatus {
  initialized: boolean;
  hasOrganization: boolean;
  hasAdmin: boolean;
}

export interface BootstrapAdminResponse {
  user: {
    id: string;
    username?: string | null;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
  };
  next: string;
}

export type StockMovementType = 'RECEPTION' | 'IN' | 'ENTRY' | 'OUT' | 'EXIT' | 'PRODUCTION' | 'LOSS' | 'CORRECTION' | 'INVENTORY' | 'TRANSFER';

export interface UserSession {
  accessToken: string;
  user: {
    id: string;
    username?: string | null;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    organizationId: string | null;
    organizationName: string | null;
    organizationType?: EstablishmentType | null;
    teamSize?: TeamSize | null;
    logoUrl?: string | null;
    logoDataUrl?: string | null;
    mainSiteName?: string | null;
    installedApplications?: string[];
    role: string;
  };
}

export interface DashboardSummary {
  user: UserSession['user'];
  organization: {
    id: string | null;
    name: string;
    establishmentType?: EstablishmentType | null;
    teamSize?: TeamSize | null;
    logoDataUrl?: string | null;
    mainSiteName?: string | null;
  };
  installedApplications: string[];
  counts: { products: number; suppliers: number; stockMovements: number };
  progress: {
    percent: number;
    checklist: {
      applicationInstalled: boolean;
      firstProductCreated: boolean;
      supplierAdded: boolean;
      stockMovementCreated: boolean;
    };
  };
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  archivedAt?: string | null;
  isArchived?: boolean;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  type?: string | null;
  unitType?: string | null;
  baseFactor?: string | number | null;
  archivedAt?: string | null;
  isArchived?: boolean;
}

export interface Product {
  id: string;
  name: string;
  sku?: string | null;
  reference?: string | null;
  description?: string | null;
  categoryId?: string | null;
  unitId: string;
  supplierId?: string | null;
  primarySupplierId?: string | null;
  averagePurchasePrice?: string | number | null;
  weightedAveragePrice?: string | number | null;
  minimumStock?: string | number | null;
  minStock?: string | number | null;
  archivedAt?: string | null;
  isArchived?: boolean;
  category?: Category | null;
  unit?: Unit;
  supplier?: Supplier | null;
  primarySupplier?: Supplier | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  archivedAt?: string | null;
  isArchived?: boolean;
}

export interface Site {
  id: string;
  name: string;
  description?: string | null;
  archivedAt?: string | null;
  isArchived?: boolean;
  locations?: Location[];
}

export interface Location {
  id: string;
  name: string;
  siteId?: string | null;
  description?: string | null;
  archivedAt?: string | null;
  isArchived?: boolean;
  site?: Site | null;
}

export interface Lot {
  id: string;
  lotNumber: string;
  productId?: string;
  supplierId?: string | null;
  receivedAt?: string | null;
  expiresAt?: string | null;
  expirationDate?: string | null;
  site?: Site | null;
  location?: Location | null;
  product?: Product | null;
  supplier?: Supplier | null;
  projectedQuantity?: string | number | null;
}

export interface Stock {
  id: string;
  quantity: string;
  currentQuantity?: string | number;
  value?: string | number | null;
  status?: string | null;
  product: Product & { unit: Unit; category?: Category | null };
  lot?: { id: string; lotNumber: string; expiresAt?: string | null; expirationDate?: string | null } | null;
  site?: Site | null;
  location?: Location | null;
}

export interface StockMovement {
  id: string;
  type: StockMovementType;
  quantity: string;
  reason?: string | null;
  comment?: string | null;
  createdAt: string;
  date?: string | null;
  product: Product & { unit: Unit };
  supplier?: Supplier | null;
  lot?: { id: string; lotNumber: string } | null;
  sourceSite?: Site | null;
  sourceLocation?: Location | null;
  destinationSite?: Site | null;
  destinationLocation?: Location | null;
  createdBy?: { email: string; firstName?: string | null; lastName?: string | null } | null;
}

export interface InventoryLine {
  id?: string;
  productId: string;
  product?: Product;
  theoreticalQuantity?: string | number;
  countedQuantity?: string | number | null;
  variance?: string | number | null;
}

export interface Inventory {
  id: string;
  name: string;
  date?: string | null;
  status?: string | null;
  comment?: string | null;
  site?: Site | null;
  location?: Location | null;
  lines?: InventoryLine[];
  createdAt?: string;
  validatedAt?: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  user?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  createdAt: string;
  details?: string | Record<string, unknown> | null;
}

export interface StocksDashboard {
  products?: number;
  productCount?: number;
  suppliers?: number;
  supplierCount?: number;
  stockValue: number;
  movementsThisMonth: number;
  latestMovements: StockMovement[];
  topConsumedProducts: Array<{ productId?: string; productName?: string; product?: Product; quantity: number; unit?: string }>;
}
