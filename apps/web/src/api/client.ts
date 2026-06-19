import type {
  BootstrapAdminResponse,
  CompleteOnboardingPayload,
  DashboardSummary,
  ModularDashboard,
  ModularDashboardPreferences,
  Category,
  AuditEntry,
  ArchitectureAnalysis,
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
  CoreUser,
  CoreRole,
  CorePermission,
  UsersRepositoryResponse,
  DevSwitchConfig,
  RnmFavorite,
  RnmHistoryResponse,
  RnmProductDetail,
  RnmProductsResponse,
  HrCollaborator,
  HrCollaboratorPayload,
  HrDepartment,
  HrPosition,
  HrReferencePayload,
  HrSummary,
  HrRotation,
  HrRotationPayload,
  PlanningAlert,
  PlanningAssignment,
  PlanningBootstrap,
  PlanningGenerationResult,
  HrRotationAssignment,
  TechnicalSheetAllergen,
  TechnicalSheetCategory,
  TechnicalSheetDashboard,
  TechnicalSheetHistoryEntry,
  TechnicalSheetRecipe,
  TechnicalSheetRecipePayload,
  TechnicalSheetRecipesResponse,
  TechnicalSheetSimulation,
  TechnicalSheetSimulationPayload,
  ProductionDashboard,
  ProductionOrder,
  ProductionOrdersResponse,
  ProductionOrderPayload,
  ProductionOrderUpdatePayload,
  ProductionQuery,
  ProductionStatusPayload,
  ProductionAssignmentPayload,
  ProductionRealizationPayload,
  ProductionDestockingProposal,
  ProductionDestockingConfirmPayload,
  ProductionMaterialRequirement,
  ProductionHistoryEntry,
  ProductionExport,
  ProductionExportPayload,
  MenuCalendarView,
  MenuCycle,
  MenuCyclePayload,
  MenuDiet,
  MenuExport,
  MenuExportPayload,
  MenuGuestGroup,
  MenuGuestForecast,
  MenuHistoryEntry,
  MenuItemPayload,
  MenuModuleDashboard,
  MenuPlan,
  MenuPlanPayload,
  MenuProductionGenerationPayload,
  MenuProductionGenerationResult,
  MenuStatus,
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

function normalizeMenuPayload(payload: Partial<MenuPlanPayload>) {
  return {
    ...payload,
    siteId: payload.siteId || undefined,
    items: payload.items?.map((item, index) => {
      const extended = item as MenuItemPayload & { position?: number; portionsOverride?: number; notes?: string };
      return {
        section: item.section,
        technicalSheetId: item.technicalSheetId,
        position: extended.position ?? item.order ?? index,
        portionsOverride: extended.portionsOverride,
        notes: extended.notes,
      };
    }),
  };
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
  me(token: string) {
    return request<UserSession['user']>('/auth/me', {}, token);
  },
  dashboardSummary(token: string) {
    return request<DashboardSummary>('/auth/dashboard-summary', {}, token);
  },
  modularDashboard(token: string) {
    return request<ModularDashboard>('/dashboard', {}, token);
  },
  updateDashboardPreferences(token: string, preferences: Partial<ModularDashboardPreferences>) {
    return request<ModularDashboard>('/dashboard/preferences', { method: 'PATCH', body: JSON.stringify(preferences) }, token);
  },
  resetDashboardPreferences(token: string) {
    return request<ModularDashboard>('/dashboard/preferences/reset', { method: 'POST' }, token);
  },
  installStocks(token: string) {
    return request<DashboardSummary>('/auth/apps/stocks/install', { method: 'POST' }, token);
  },
  installRnmPrices(token: string) {
    return request<DashboardSummary>('/auth/apps/rnm-prices/install', { method: 'POST' }, token);
  },
  installHr(token: string) {
    return request<DashboardSummary>('/auth/apps/hr/install', { method: 'POST' }, token);
  },
  installPlanning(token: string) {
    return request<DashboardSummary>('/auth/apps/planning/install', { method: 'POST' }, token);
  },
  installTechnicalSheets(token: string) {
    return request<DashboardSummary>('/technical-sheets/install', { method: 'POST' }, token);
  },
  installProduction(token: string) {
    return request<DashboardSummary | { installed: boolean; installedApplications: string[] }>('/production/install', { method: 'POST' }, token);
  },
  installMenus(token: string) {
    return request<DashboardSummary | { installed: boolean; installedApplications: string[] }>('/menus/install', { method: 'POST' }, token);
  },
  uninstallMenus(token: string) {
    return request<DashboardSummary | { installed: boolean; installedApplications: string[] }>('/menus/uninstall', { method: 'POST' }, token);
  },
  menusDashboard(token: string) {
    return request<MenuModuleDashboard>('/menus/dashboard', {}, token);
  },
  menusList(token: string, params: { status?: string; startDate?: string; endDate?: string; dateFrom?: string; dateTo?: string; siteId?: string } = {}) {
    const qs = new URLSearchParams();
    const normalized = { ...params, startDate: params.startDate ?? params.dateFrom, endDate: params.endDate ?? params.dateTo };
    delete (normalized as Record<string, unknown>).dateFrom;
    delete (normalized as Record<string, unknown>).dateTo;
    Object.entries(normalized).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<{ items: MenuPlan[] }>(`/menus/menus${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token).then((result) => result.items ?? []);
  },
  menuCalendar(token: string, params: { view?: MenuCalendarView; startDate?: string; endDate?: string; siteId?: string } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<{ items: MenuPlan[] }>(`/menus/calendar${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token).then((result) => result.items ?? []);
  },
  createMenu(token: string, payload: MenuPlanPayload) {
    return request<MenuPlan>('/menus/menus', { method: 'POST', body: JSON.stringify(normalizeMenuPayload(payload)) }, token);
  },
  updateMenu(token: string, id: string, payload: Partial<MenuPlanPayload>) {
    return request<MenuPlan>(`/menus/menus/${id}`, { method: 'PATCH', body: JSON.stringify(normalizeMenuPayload(payload)) }, token);
  },
  changeMenuStatus(token: string, id: string, status: MenuStatus) {
    return request<MenuPlan>(`/menus/menus/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }, token);
  },
  generateMenuProductions(token: string, id: string, payload: MenuProductionGenerationPayload) {
    return request<MenuProductionGenerationResult>(`/menus/menus/${id}/generate-productions`, { method: 'POST', body: JSON.stringify({ mode: payload.mode, force: payload.confirmRegeneration }) }, token);
  },
  menuCycles(token: string) {
    return request<MenuCycle[]>('/menus/cycles', {}, token);
  },
  createMenuCycle(token: string, payload: MenuCyclePayload) {
    return request<MenuCycle>('/menus/cycles', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  replicateMenuCycle(token: string, id: string, payload: { startDate: string; endDate?: string; weeks?: number; siteId?: string }) {
    const endDate = payload.endDate ?? (() => {
      const date = new Date(payload.startDate);
      date.setDate(date.getDate() + ((payload.weeks ?? 4) * 7) - 1);
      return date.toISOString().slice(0, 10);
    })();
    return request<{ created: number }>(`/menus/cycles/${id}/replicate`, { method: 'POST', body: JSON.stringify({ startDate: payload.startDate, endDate, siteId: payload.siteId }) }, token)
      .then((result) => ({ createdMenus: result.created }));
  },
  resyncMenuCycle(token: string, id: string, payload: { fromDate?: string; toDate?: string; confirmPublished?: boolean } = {}) {
    return request<{ updatedMenus: number }>(`/menus/cycles/${id}/resync`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  menuDiets(token: string) {
    return request<MenuDiet[]>('/menus/diets', {}, token);
  },
  createMenuDiet(token: string, payload: { name: string; description?: string }) {
    return request<MenuDiet>('/menus/diets', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  menuGuestGroups(token: string) {
    return request<MenuGuestGroup[]>('/menus/guest-groups', {}, token);
  },
  upsertMenuGuestForecast(token: string, menuId: string, payload: { guestGroupId: string; dietId?: string; count: number }) {
    return request<MenuPlan>(`/menus/menus/${menuId}/guests`, { method: 'POST', body: JSON.stringify({ forecasts: [payload] }) }, token);
  },
  menuExports(token: string) {
    return request<MenuExport[]>('/menus/exports', {}, token);
  },
  prepareMenuExport(token: string, payload: MenuExportPayload) {
    const format = payload.format === 'XLSX' || payload.kind === 'EXCEL' ? 'EXCEL' : payload.format;
    const audience = payload.kind === 'EXCEL' ? 'PUBLIC_DISPLAY' : payload.kind;
    return request<MenuExport>('/menus/exports', { method: 'POST', body: JSON.stringify({ menuId: payload.menuId, format, audience, startDate: payload.fromDate, endDate: payload.toDate }) }, token);
  },
  menuHistory(token: string, params: { menuId?: string; cycleId?: string } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<MenuHistoryEntry[]>(`/menus/history${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  uninstallProduction(token: string) {
    return request<DashboardSummary | { installed: boolean; installedApplications: string[] }>('/production/uninstall', { method: 'POST' }, token);
  },
  productionDashboard(token: string) {
    return request<ProductionDashboard>('/production/dashboard', {}, token);
  },
  productionOrders(token: string, params: ProductionQuery = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<ProductionOrdersResponse>(`/production/orders${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  productionOrder(token: string, id: string) {
    return request<ProductionOrder>(`/production/orders/${id}`, {}, token);
  },
  createProductionOrder(token: string, payload: ProductionOrderPayload) {
    return request<ProductionOrder>('/production/orders', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateProductionOrder(token: string, id: string, payload: ProductionOrderUpdatePayload) {
    return request<ProductionOrder>(`/production/orders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  changeProductionStatus(token: string, id: string, payload: ProductionStatusPayload) {
    return request<ProductionOrder>(`/production/orders/${id}/status`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  recalculateProductionOrder(token: string, id: string) {
    return request<ProductionOrder>(`/production/orders/${id}/recalculate`, { method: 'POST' }, token);
  },
  assignProductionEmployee(token: string, orderId: string, payload: ProductionAssignmentPayload) {
    return request<ProductionOrder['assignments'][number]>(`/production/orders/${orderId}/assignments`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  removeProductionAssignment(token: string, orderId: string, assignmentId: string) {
    return request<{ deleted: boolean }>(`/production/orders/${orderId}/assignments/${assignmentId}`, { method: 'DELETE' }, token);
  },
  closeProductionRealization(token: string, orderId: string, payload: ProductionRealizationPayload) {
    return request<ProductionOrder['realization']>(`/production/orders/${orderId}/realization`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  proposeProductionDestocking(token: string, orderId: string) {
    return request<ProductionDestockingProposal>(`/production/orders/${orderId}/destocking/propose`, { method: 'POST' }, token);
  },
  confirmProductionDestocking(token: string, proposalId: string, payload: ProductionDestockingConfirmPayload = {}) {
    return request<ProductionDestockingProposal>(`/production/destocking/${proposalId}/confirm`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  productionMaterials(token: string, params: ProductionQuery = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<ProductionMaterialRequirement[]>(`/production/materials${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  productionToday(token: string, params: ProductionQuery = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<ProductionOrdersResponse>(`/production/today${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  productionCalendar(token: string, params: ProductionQuery = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<ProductionOrder[]>(`/production/calendar${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  productionHistory(token: string, params: ProductionQuery = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<ProductionHistoryEntry[]>(`/production/history${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  productionExports(token: string, params: ProductionQuery = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<ProductionExport[]>(`/production/exports${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  prepareProductionExport(token: string, payload: ProductionExportPayload) {
    return request<ProductionExport>('/production/exports', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  uninstallTechnicalSheets(token: string) {
    return request<DashboardSummary>('/technical-sheets/uninstall', { method: 'POST' }, token);
  },
  technicalSheetsDashboard(token: string) {
    return request<TechnicalSheetDashboard>('/technical-sheets/dashboard', {}, token);
  },
  technicalSheetCategories(token: string) {
    return request<TechnicalSheetCategory[]>('/technical-sheets/categories?includeArchived=true', {}, token);
  },
  createTechnicalSheetCategory(token: string, payload: { name: string; description?: string }) {
    return request<TechnicalSheetCategory>('/technical-sheets/categories', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  archiveTechnicalSheetCategory(token: string, id: string) {
    return request<TechnicalSheetCategory>(`/technical-sheets/categories/${id}/archive`, { method: 'POST' }, token);
  },
  technicalSheetAllergens(token: string) {
    return request<TechnicalSheetAllergen[]>('/technical-sheets/allergens?includeArchived=true', {}, token);
  },
  createTechnicalSheetAllergen(token: string, payload: { name: string; icon?: string }) {
    return request<TechnicalSheetAllergen>('/technical-sheets/allergens', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  archiveTechnicalSheetAllergen(token: string, id: string) {
    return request<TechnicalSheetAllergen>(`/technical-sheets/allergens/${id}/archive`, { method: 'POST' }, token);
  },
  technicalSheetRecipes(token: string, params: { search?: string; status?: string; includeArchived?: boolean; page?: number; pageSize?: number } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<TechnicalSheetRecipesResponse>(`/technical-sheets/recipes${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  createTechnicalSheetRecipe(token: string, payload: TechnicalSheetRecipePayload) {
    return request<TechnicalSheetRecipe>('/technical-sheets/recipes', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateTechnicalSheetRecipe(token: string, id: string, payload: Partial<TechnicalSheetRecipePayload>) {
    return request<TechnicalSheetRecipe>(`/technical-sheets/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveTechnicalSheetRecipe(token: string, id: string) {
    return request<TechnicalSheetRecipe>(`/technical-sheets/recipes/${id}/archive`, { method: 'POST' }, token);
  },
  duplicateTechnicalSheetRecipe(token: string, id: string, payload: { name?: string; copyGeneral?: boolean; copyPhoto?: boolean; copyIngredients?: boolean; copySteps?: boolean; copyAllergens?: boolean; copyCategory?: boolean; resetToDraft?: boolean }) {
    return request<TechnicalSheetRecipe>(`/technical-sheets/recipes/${id}/duplicate`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  recalculateTechnicalSheetRecipe(token: string, id: string) {
    return request<TechnicalSheetRecipe>(`/technical-sheets/recipes/${id}/recalculate-cost`, { method: 'POST' }, token);
  },
  technicalSheetRecipeHistory(token: string, id: string) {
    return request<TechnicalSheetHistoryEntry[]>(`/technical-sheets/recipes/${id}/history`, {}, token);
  },
  technicalSheetCosts(token: string) {
    return request<TechnicalSheetRecipe[]>('/technical-sheets/costs', {}, token);
  },
  simulateTechnicalSheetProduction(token: string, payload: TechnicalSheetSimulationPayload) {
    return request<TechnicalSheetSimulation>('/technical-sheets/production/simulate', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  async exportTechnicalSheetProductionCsv(token: string, id: string) {
    const response = await fetch(`${API_URL}/api/technical-sheets/production/${id}/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    return response.blob();
  },
  async exportTechnicalSheetProductionPdf(token: string, id: string) {
    const response = await fetch(`${API_URL}/api/technical-sheets/production/${id}/export.pdf`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    return response.blob();
  },
  planningBootstrap(token: string) {
    return request<PlanningBootstrap>('/planning/bootstrap', {}, token);
  },
  createPlanningAssignment(token: string, payload: Partial<PlanningAssignment>) {
    return request<PlanningAssignment>('/planning/assignments', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  movePlanningAssignment(token: string, id: string, payload: Partial<PlanningAssignment>) {
    return request<PlanningAssignment>(`/planning/assignments/${id}/move`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  generatePlanning(token: string, payload: { startDate: string; endDate: string; siteId?: string; apply?: boolean }) {
    return request<PlanningGenerationResult>('/planning/generate', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  prefillStocks(token: string, payload: { categories?: boolean; units?: boolean; sites?: boolean; locations?: boolean; examples?: boolean }) {
    return request<DashboardSummary | { ok: boolean }>('/auth/apps/stocks/prefill', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  uninstallStocks(token: string) {
    return request<DashboardSummary>('/auth/apps/stocks/uninstall', { method: 'POST' }, token);
  },
  uninstallRnmPrices(token: string) {
    return request<DashboardSummary>('/auth/apps/rnm-prices/uninstall', { method: 'POST' }, token);
  },
  rnmStats(token: string) {
    return request<{
      productCount?: number;
      sectorCount?: number;
      marketCount?: number;
      latestQuotationDate?: string | null;
      topRisers?: unknown[];
      topFallers?: unknown[];
    }>('/rnm-prices/stats', {}, token);
  },
  rnmProducts(token: string, params: { search?: string; sector?: string; category?: string; page?: number; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    const limit = params.limit || 12;
    const offset = params.offset ?? (params.page && params.page > 1 ? (params.page - 1) * limit : undefined);
    Object.entries({ ...params, limit, offset }).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    qs.delete('page');
    return request<RnmProductsResponse>(`/rnm-prices/products?${qs.toString()}`, {}, token).then((data) => ({
      ...data,
      page: data.page ?? params.page ?? (offset !== undefined ? Math.floor(offset / limit) + 1 : 1),
      pages: data.pages ?? Math.max(1, Math.ceil((data.total ?? data.items?.length ?? 0) / (data.pageSize || limit))),
      filters: data.filters ?? { sectors: data.sectors, categories: data.categories },
      stats: data.stats ?? { products: data.total, sectors: data.sectors?.length, lastQuotationDate: data.items?.map((p) => p.latestQuotationDate ?? p.lastQuotationDate).filter(Boolean).sort().at(-1) ?? null },
    }));
  },
  rnmProduct(token: string, id: string) {
    return request<RnmProductDetail>(`/rnm-prices/products/${encodeURIComponent(id)}`, {}, token).then((data) => ({ ...data, lastQuotationDate: data.lastQuotationDate ?? data.latestQuotationDate, quotes: data.quotes ?? data.quotations ?? [] }));
  },
  rnmHistory(token: string, params: { productId?: string; period?: string; market?: string; stage?: string; dateStart?: string; dateEnd?: string; page?: number; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    const limit = params.limit || 20;
    const offset = params.offset ?? (params.page && params.page > 1 ? (params.page - 1) * limit : undefined);
    Object.entries({ product: params.productId, period: params.period, market: params.market, stage: params.stage, dateFrom: params.dateStart, dateTo: params.dateEnd, limit, offset }).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<RnmHistoryResponse>(`/rnm-prices/history?${qs.toString()}`, {}, token).then((data) => ({ ...data, page: data.page ?? params.page ?? (offset !== undefined ? Math.floor(offset / limit) + 1 : 1), pages: data.pages ?? Math.max(1, Math.ceil((data.total ?? data.items?.length ?? 0) / (data.pageSize || limit))) }));
  },
  rnmFavorites(token: string) {
    return request<Array<RnmFavorite & { rnmProductId?: string }>>('/rnm-prices/favorites', {}, token).then((items) => items.map((item) => ({ ...item, productId: item.productId ?? item.rnmProductId })));
  },
  addRnmFavorite(token: string, payload: { productId: string; productName?: string; category?: string | null; sector?: string | null }) {
    return request<RnmFavorite>('/rnm-prices/favorites', { method: 'POST', body: JSON.stringify({ rnmProductId: payload.productId, productName: payload.productName ?? payload.productId, category: payload.category, sector: payload.sector }) }, token);
  },
  removeRnmFavorite(token: string, productId: string) {
    return request<{ removed: boolean }>(`/rnm-prices/favorites/${encodeURIComponent(productId)}`, { method: 'DELETE' }, token);
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
  architecture(token: string) {
    return request<ArchitectureAnalysis>('/architecture', {}, token);
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
  users(token: string) {
    return request<CoreUser[] | UsersRepositoryResponse>('/users', {}, token);
  },
  createUser(token: string, payload: { firstName: string; lastName: string; email: string; role: string; temporaryPassword: string }) {
    return request<CoreUser>('/users', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateUser(token: string, id: string, payload: { firstName?: string; lastName?: string; email?: string; role?: string; status?: string }) {
    return request<CoreUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  disableUser(token: string, id: string) {
    return request<CoreUser>(`/users/${id}/disable`, { method: 'POST' }, token);
  },
  roles(token: string) {
    return request<CoreRole[] | { roles: CoreRole[]; permissions?: CorePermission[] }>('/roles', {}, token);
  },
  updateRolePermissions(token: string, roleName: string, permissions: string[]) {
    return request<{ roles: CoreRole[]; permissions?: CorePermission[] }>(`/roles/${encodeURIComponent(roleName)}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissionKeys: permissions }) }, token);
  },
  devSwitchConfig(token: string) {
    return request<DevSwitchConfig>('/dev-switch/config', {}, token);
  },
  devSwitch(token: string, userId: string) {
    return request<UserSession>('/dev-switch', { method: 'POST', body: JSON.stringify({ userId }) }, token);
  },
  async hrBootstrap(token: string) {
    const [rawSummary, collaborators, departments, positions, rotations, availableUsers] = await Promise.all([
      request<any>('/hr/dashboard', {}, token),
      request<HrCollaborator[]>('/hr/employees?includeArchived=true&pageSize=200', {}, token),
      request<HrDepartment[]>('/hr/departments?includeArchived=true&pageSize=200', {}, token),
      request<HrPosition[]>('/hr/positions?includeArchived=true&pageSize=200', {}, token),
      request<HrRotation[]>('/hr/rotations?includeArchived=true&pageSize=200', {}, token).catch(() => []),
      request<CoreUser[]>('/hr/users/available', {}, token).catch(() => []),
    ]);
    const summary: HrSummary = {
      counts: {
        collaborators: rawSummary.counts?.collaborators ?? rawSummary.employeeCount ?? 0,
        departments: rawSummary.counts?.departments ?? rawSummary.departmentCount ?? 0,
        positions: rawSummary.counts?.positions ?? rawSummary.positionCount ?? 0,
        linkedCollaborators: rawSummary.counts?.linkedCollaborators ?? rawSummary.linkedCount ?? 0,
        activeRotations: rawSummary.counts?.activeRotations ?? rawSummary.activeRotations ?? rotations.filter((rotation) => !(rotation.isArchived || rotation.archivedAt)).length,
        collaboratorsWithRotation: rawSummary.counts?.collaboratorsWithRotation ?? rawSummary.collaboratorsWithRotation ?? collaborators.filter((collaborator) => collaborator.activeRotationAssignment || collaborator.rotationAssignment || collaborator.activeRotation).length,
        collaboratorsWithoutRotation: rawSummary.counts?.collaboratorsWithoutRotation ?? rawSummary.collaboratorsWithoutRotation,
        averageWeeklyRotationMinutes: rawSummary.counts?.averageWeeklyRotationMinutes ?? rawSummary.averageWeeklyRotationMinutes,
      },
      latestCollaborators: rawSummary.latestCollaborators ?? rawSummary.latestEmployees ?? [],
      departmentDistribution: rawSummary.departmentDistribution,
    };
    return { summary, collaborators, departments, positions, rotations, availableUsers };
  },
  createHrCollaborator(token: string, payload: HrCollaboratorPayload) {
    return request<HrCollaborator>('/hr/employees', { method: 'POST', body: JSON.stringify(toHrEmployeePayload(payload)) }, token);
  },
  updateHrCollaborator(token: string, id: string, payload: Partial<HrCollaboratorPayload>) {
    return request<HrCollaborator>(`/hr/employees/${id}`, { method: 'PATCH', body: JSON.stringify(toHrEmployeePayload(payload)) }, token);
  },
  archiveHrCollaborator(token: string, id: string) {
    return request<HrCollaborator>(`/hr/employees/${id}/archive`, { method: 'POST' }, token);
  },
  createHrDepartment(token: string, payload: HrReferencePayload) {
    return request<HrDepartment>('/hr/departments', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateHrDepartment(token: string, id: string, payload: HrReferencePayload) {
    return request<HrDepartment>(`/hr/departments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveHrDepartment(token: string, id: string) {
    return request<HrDepartment>(`/hr/departments/${id}/archive`, { method: 'POST' }, token);
  },
  createHrPosition(token: string, payload: HrReferencePayload) {
    return request<HrPosition>('/hr/positions', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateHrPosition(token: string, id: string, payload: HrReferencePayload) {
    return request<HrPosition>(`/hr/positions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveHrPosition(token: string, id: string) {
    return request<HrPosition>(`/hr/positions/${id}/archive`, { method: 'POST' }, token);
  },
  listHrRotations(token: string) {
    return request<HrRotation[]>('/hr/rotations?includeArchived=true&pageSize=200', {}, token);
  },
  createHrRotation(token: string, payload: HrRotationPayload) {
    return request<HrRotation>('/hr/rotations', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateHrRotation(token: string, id: string, payload: Partial<HrRotationPayload>) {
    return request<HrRotation>(`/hr/rotations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveHrRotation(token: string, id: string) {
    return request<HrRotation>(`/hr/rotations/${id}/archive`, { method: 'POST' }, token);
  },
  hrRotationAssignments(token: string, rotationId: string) {
    return request<HrRotationAssignment[]>(`/hr/rotations/${rotationId}/assignments`, {}, token);
  },
  assignHrRotation(token: string, rotationId: string, payload: { employeeId: string; startDate?: string }) {
    return request<HrRotationAssignment>(`/hr/rotations/${rotationId}/assignments`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  removeHrRotationAssignment(token: string, rotationId: string, employeeId: string, payload: { endDate?: string } = {}) {
    return request<{ ok?: boolean }>(`/hr/rotations/${rotationId}/assignments/${employeeId}/remove`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  availableHrRotationEmployees(token: string, rotationId: string) {
    return request<HrCollaborator[]>(`/hr/rotations/available-employees?rotationId=${encodeURIComponent(rotationId)}`, {}, token);
  },
  setHrCollaboratorRotation(token: string, employeeId: string, payload: { rotationId: string; startDate?: string }) {
    return request<HrCollaborator>(`/hr/employees/${employeeId}/rotation`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  removeHrCollaboratorRotation(token: string, employeeId: string) {
    return request<HrCollaborator>(`/hr/employees/${employeeId}/rotation`, { method: 'DELETE' }, token);
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

function toHrEmployeePayload(payload: Partial<HrCollaboratorPayload>) {
  const { photoUrl, siteId, ...rest } = payload;
  return { ...rest, photoDataUrl: payload.photoDataUrl ?? photoUrl, mainSiteId: payload.mainSiteId ?? siteId };
}

