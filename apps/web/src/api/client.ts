import type {
  BootstrapAdminResponse,
  CompleteOnboardingPayload,
  DashboardSummary,
  Category,
  AuditEntry,
  Inventory,
  Location,
  Lot,
  Product,
  Site,
  Stock,
  StocksDashboard,
  StockMovement,
  StockMovementType,
  Supplier,
  SystemStatus,
  Unit,
  UserSession,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `Erreur API ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      // Keep default message.
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const api = {
  status() {
    return request<SystemStatus>('/system/status');
  },
  bootstrapAdmin(payload: {
    username: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    return request<BootstrapAdminResponse>('/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  completeOnboarding(payload: CompleteOnboardingPayload) {
    return request<UserSession>('/auth/complete-onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  setupOrganization(token: string, payload: {
    name: string;
    code?: string;
    establishmentType?: string;
    teamSize?: string;
    logoDataUrl?: string;
  }) {
    return request<UserSession>('/auth/setup-organization', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },
  login(email: string, password: string) {
    return request<UserSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  dashboardSummary(token: string) {
    return request<DashboardSummary>('/auth/dashboard-summary', {}, token);
  },
  installStocks(token: string) {
    return request<DashboardSummary>('/auth/apps/stocks/install', { method: 'POST' }, token);
  },
  prefillStocks(token: string, payload: { categories?: boolean; units?: boolean; sites?: boolean; locations?: boolean; examples?: boolean }) {
    return request<DashboardSummary | { ok: boolean }>('/auth/apps/stocks/prefill', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  uninstallStocks(token: string) {
    return request<DashboardSummary>('/auth/apps/stocks/uninstall', { method: 'POST' }, token);
  },
  categories(token: string) {
    return request<Category[]>('/categories', {}, token);
  },
  createCategory(token: string, payload: { name: string; description?: string }) {
    return request<Category>('/categories', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateCategory(token: string, id: string, payload: { name?: string; description?: string }) {
    return request<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveCategory(token: string, id: string) {
    return request<Category>(`/categories/${id}/archive`, { method: 'POST' }, token);
  },
  units(token: string) {
    return request<Unit[]>('/units', {}, token);
  },
  createUnit(token: string, payload: { name: string; symbol: string; type?: string; baseFactor?: number }) {
    return request<Unit>('/units', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateUnit(token: string, id: string, payload: { name?: string; symbol?: string; type?: string; baseFactor?: number }) {
    return request<Unit>(`/units/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveUnit(token: string, id: string) {
    return request<Unit>(`/units/${id}/archive`, { method: 'POST' }, token);
  },
  products(token: string) {
    return request<Product[]>('/products', {}, token);
  },
  createProduct(
    token: string,
    payload: { name: string; sku?: string; description?: string; unitId: string; categoryId?: string; supplierId?: string; primarySupplierId?: string; averagePurchasePrice?: number; minimumStock?: number },
  ) {
    const { supplierId, averagePurchasePrice: _averagePurchasePrice, ...rest } = payload;
    return request<Product>('/products', { method: 'POST', body: JSON.stringify({ ...rest, primarySupplierId: payload.primarySupplierId ?? supplierId }) }, token);
  },
  updateProduct(
    token: string,
    id: string,
    payload: { name?: string; sku?: string; description?: string; unitId?: string; categoryId?: string; supplierId?: string; primarySupplierId?: string; averagePurchasePrice?: number; minimumStock?: number },
  ) {
    const { supplierId, averagePurchasePrice: _averagePurchasePrice, ...rest } = payload;
    return request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify({ ...rest, primarySupplierId: payload.primarySupplierId ?? supplierId }) }, token);
  },
  archiveProduct(token: string, id: string) {
    return request<Product>(`/products/${id}/archive`, { method: 'POST' }, token);
  },
  suppliers(token: string) {
    return request<Supplier[]>('/suppliers', {}, token);
  },
  createSupplier(
    token: string,
    payload: { name: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string },
  ) {
    return request<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateSupplier(
    token: string,
    id: string,
    payload: { name?: string; contactName?: string; email?: string; phone?: string; address?: string; notes?: string },
  ) {
    return request<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveSupplier(token: string, id: string) {
    return request<Supplier>(`/suppliers/${id}/archive`, { method: 'POST' }, token);
  },
  sites(token: string) {
    return request<Site[]>('/sites', {}, token);
  },
  createSite(token: string, payload: { name: string; description?: string }) {
    return request<Site>('/sites', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  archiveSite(token: string, id: string) {
    return request<Site>(`/sites/${id}/archive`, { method: 'POST' }, token);
  },
  locations(token: string) {
    return request<Location[]>('/locations', {}, token);
  },
  createLocation(token: string, payload: { name: string; siteId: string; description?: string }) {
    return request<Location>('/locations', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  archiveLocation(token: string, id: string) {
    return request<Location>(`/locations/${id}/archive`, { method: 'POST' }, token);
  },
  lots(token: string) {
    return request<Lot[]>('/lots', {}, token);
  },
  stocks(token: string) {
    return request<Stock[]>('/stocks', {}, token);
  },
  movements(token: string) {
    return request<StockMovement[]>('/stock-movements', {}, token);
  },
  stocksDashboard(token: string) {
    return request<StocksDashboard>('/stocks/dashboard', {}, token);
  },
  inventories(token: string) {
    return request<Inventory[]>('/inventories', {}, token);
  },
  createInventory(token: string, payload: { name: string; date?: string; inventoryDate?: string; comment?: string; siteId?: string; locationId?: string }) {
    const { date, ...rest } = payload;
    return request<Inventory>('/inventories', { method: 'POST', body: JSON.stringify({ ...rest, inventoryDate: payload.inventoryDate ?? date }) }, token);
  },
  updateInventoryCounts(token: string, id: string, lines: Array<{ productId: string; countedQuantity: number; lotId?: string }>) {
    return request<Inventory>(`/inventories/${id}/counts`, { method: 'PATCH', body: JSON.stringify({ lines }) }, token);
  },
  validateInventory(token: string, id: string, lines?: Array<{ productId: string; countedQuantity: number; lotId?: string }>) {
    const update = lines?.length ? api.updateInventoryCounts(token, id, lines) : Promise.resolve(undefined);
    return update.then(() => request<Inventory>(`/inventories/${id}/validate`, { method: 'POST' }, token));
  },
  audit(token: string) {
    return request<AuditEntry[]>('/audit', {}, token);
  },
  auditCsv(token: string) {
    return fetch(`${API_URL}/api/audit.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(await response.text(), response.status);
      return { csv: await response.text() };
    });
  },
  createMovement(
    token: string,
    payload: {
      productId: string;
      supplierId?: string;
      type: StockMovementType;
      quantity: number;
      unitId?: string;
      lotId?: string;
      sourceSiteId?: string;
      sourceLocationId?: string;
      destinationSiteId?: string;
      destinationLocationId?: string;
      movementDate?: string;
      date?: string;
      reason?: string;
    },
  ) {
    const { date, type, ...rest } = payload;
    const normalizedType = type === 'ENTRY' ? 'IN' : type === 'EXIT' ? 'OUT' : type;
    return request<StockMovement>(
      '/stock-movements',
      { method: 'POST', body: JSON.stringify({ ...rest, type: normalizedType, movementDate: payload.movementDate ?? date }) },
      token,
    );
  },
};
