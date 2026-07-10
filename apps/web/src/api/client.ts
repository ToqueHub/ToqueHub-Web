import type {
  BootstrapAdminResponse,
  CompleteOnboardingPayload,
  DashboardSummary,
  ModularDashboard,
  ModularDashboardPreferences,
  MyDocumentsResponse,
  MyDocument,
  Category,
  AuditEntry,
  ArchitectureAnalysis,
  Inventory,
  Location,
  Lot,
  Product,
  ProductImportCommitResult,
  ProductImportField,
  ProductImportPreview,
  ProductImportPreviewFields,
  Site,
  Stock,
  StockReception,
  StockProposal,
  StockConversation,
  StocksDashboard,
  MarginsDashboard,
  MarginProductDetail,
  MarginSupplierDetail,
  MarginAlert,
  MarginReport,
  MarginSettings,
  StockMovement,
  ArticlesResponse,
  StockMovementType,
  StocksOcrConfig,
  StocksOcrExtraction,
  StocksOcrStatus,
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
  HrDocument,
  HrPosition,
  HrReferencePayload,
  HrSummary,
  PlanningAlert,
  PlanningAssignment,
  PlanningAttendanceResponse,
  PlanningBootstrap,
  PlanningCodeDictionaryEntry,
  PlanningCounterAccount,
  PlanningCountersResponse,
  PlanningCrossSiteReplacement,
  PlanningDashboardResponse,
  PlanningDayPresetPayload,
  PlanningDayStatus,
  PlanningEmployeeTemplateAssignment,
  PlanningGenerationResult,
  PlanningPeriodActionPayload,
  PlanningPeriodActionResult,
  PlanningPolicyProfile,
  PlanningRequirement,
  PlanningTemplate,
  PlanningWeeklyRotationPayload,
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
  BackupInspection,
  BackupCloudStatus,
  BackupListResponse,
  BackupRestoreResult,
  BackupSchedule,
  BackupSummary,
  SystemChangelogResponse,
  SystemInstanceInfo,
  SystemUpdateApplyResult,
  SystemUpdateOperation,
  SystemUpdateStatus,
  OrganizationRemoteAccess,
  RemoteAccessStatus,
} from '../types';

type PlanningRangeParams = {
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
  siteId?: string;
  departmentId?: string;
  employeeId?: string;
  seasonalTemplateId?: string;
  page?: number;
  pageSize?: number;
};

type SitePayload = {
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  responsibleName?: string;
  responsiblePhone?: string;
  responsibleEmail?: string;
};

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';
const API_SOCKET_URL = API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

type ProductMutationPayload = {
  name?: string;
  sku?: string | null;
  description?: string | null;
  unitId?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  primarySupplierId?: string | null;
  averagePrice?: number;
  averagePurchasePrice?: number;
  minimumStock?: number;
  gtin?: string | null;
  originCountry?: string | null;
  packageLabel?: string | null;
  unitsPerPackage?: number | null;
  unitWeightGrams?: number | null;
  netWeightGrams?: number | null;
  ingredients?: string | null;
  allergensPresent?: string[];
  possibleTraces?: string[];
  dietaryTags?: string[];
  energyKj?: number | null;
  energyKcal?: number | null;
  fatGrams?: number | null;
  saturatedFatGrams?: number | null;
  carbohydratesGrams?: number | null;
  sugarsGrams?: number | null;
  fiberGrams?: number | null;
  proteinGrams?: number | null;
  saltGrams?: number | null;
  storageType?: string | null;
  shelfLifeAfterOpening?: string | null;
  storageInstructions?: string | null;
  preparationInstructions?: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function readApiErrorMessage(response: Response, fallback = `Erreur API ${response.status}`) {
  const raw = await response.text();
  if (!raw) return fallback;
  try {
    const body = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) return body.message;
  } catch {
    // Keep the raw response below.
  }
  return raw;
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

  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
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

function normalizeOcrCorrectionPayload(payload: StocksOcrExtraction['data']) {
  return {
    supplierName: payload.supplierName || payload.supplier?.name || undefined,
    supplierId: payload.supplierId || undefined,
    invoiceNumber: payload.invoiceNumber || payload.document?.invoiceNumber || undefined,
    deliveryNoteNumber: payload.deliveryNoteNumber || payload.document?.deliveryNoteNumber || undefined,
    purchaseOrderNumber: payload.purchaseOrderNumber || payload.document?.purchaseOrderNumber || undefined,
    documentDate: payload.documentDate || payload.document?.documentDate || undefined,
    deliveryDate: payload.deliveryDate || payload.document?.deliveryDate || undefined,
    totalExcludingTax: payload.totalExcludingTax ?? payload.totals?.totalExcludingTax ?? undefined,
    totalTax: payload.totalTax ?? payload.totals?.totalTax ?? undefined,
    totalIncludingTax: payload.totalIncludingTax ?? payload.totals?.totalIncludingTax ?? undefined,
    siteId: payload.siteId || undefined,
    locationId: payload.locationId || undefined,
    documentConfidence: payload.documentConfidence ?? payload.aiAnalysis?.confidence ?? undefined,
    warnings: payload.warnings ?? payload.aiAnalysis?.warnings ?? undefined,
    suggestedActions: payload.suggestedActions ?? payload.aiAnalysis?.suggestedActions ?? undefined,
    aiAnalysis: payload.aiAnalysis ?? undefined,
    lines: (payload.lines || []).map((line) => ({
      id: line.id,
      ignored: Boolean(line.ignored),
      productId: line.productId || undefined,
      createProduct: Boolean(line.createProduct && !line.productId),
      unitId: line.unitId || undefined,
      categoryId: line.categoryId || undefined,
      categoryName: line.categoryName || undefined,
      suggestedCategoryId: line.suggestedCategoryId || undefined,
      suggestedCategoryName: line.suggestedCategoryName || undefined,
      ocrLabel: line.ocrLabel || line.label || undefined,
      reference: line.reference || undefined,
      nameOriginal: line.nameOriginal || undefined,
      descriptionOriginal: line.descriptionOriginal || undefined,
      quantity: line.quantity ?? undefined,
      unit: line.unit || undefined,
      unitPrice: line.unitPrice ?? undefined,
      lineTotal: line.lineTotal ?? line.total ?? undefined,
      vatRate: line.vatRate ?? undefined,
      lotNumber: line.lotNumber || undefined,
      bestBeforeDate: line.bestBeforeDate || undefined,
      lineStatus: line.lineStatus || undefined,
      lineConfidence: line.lineConfidence ?? undefined,
      warnings: line.warnings ?? undefined,
      sourceText: line.sourceText || undefined,
      packageDescription: line.packageDescription || undefined,
    })),
  };
}

function uuidOrNullOrUndefined(value?: string | null) {
  if (value === null) return null;
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}

export const api = {
  status() {
    return request<SystemStatus>('/system/status');
  },
  systemInstance(token: string) {
    return request<SystemInstanceInfo>('/system/instance', {}, token);
  },
  remoteAccessStatus(token: string) {
    return request<RemoteAccessStatus>('/system/remote-access/status', {}, token);
  },
  activateRemoteAccess(token: string) {
    return request<RemoteAccessStatus>('/system/remote-access/activate', { method: 'POST' }, token);
  },
  refreshRemoteAccess(token: string) {
    return request<RemoteAccessStatus>('/system/remote-access/refresh', { method: 'POST' }, token);
  },
  systemUpdateStatus(token: string) {
    return request<SystemUpdateStatus>('/system/update/status', {}, token);
  },
  systemChangelog(token: string) {
    return request<SystemChangelogResponse>('/system/update/changelog', {}, token);
  },
  systemUpdateCheck(token: string) {
    return request<SystemUpdateStatus>('/system/update/check', { method: 'POST' }, token);
  },
  systemUpdateApply(token: string) {
    return request<SystemUpdateApplyResult>('/system/update/apply', { method: 'POST' }, token);
  },
  systemUpdateOperation(token: string, id: string) {
    return request<SystemUpdateOperation>(`/system/update/operations/${id}`, {}, token);
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
    regulatoryCountryCode?: 'FR' | 'FI';
    logoDataUrl?: string;
    primarySiteName?: string;
    secondarySiteNames?: string[];
    mistralApiKey?: string;
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
  organizationApiKeys(token: string) {
    return request<DashboardSummary['organization']['apiKeys']>('/auth/organization/api-keys', {}, token);
  },
  updateOrganizationApiKeys(token: string, payload: { mistralApiKey?: string; githubToken?: string }) {
    return request<DashboardSummary['organization']['apiKeys']>('/auth/organization/api-keys', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  organizationRemoteAccess(token: string) {
    return request<OrganizationRemoteAccess>('/auth/organization/remote-access', {}, token);
  },
  updateOrganizationRemoteAccess(token: string, payload: { enabled?: boolean; tailscaleHostname?: string | null; tailscaleUrl?: string | null; tailscaleIp?: string | null }) {
    return request<OrganizationRemoteAccess>('/auth/organization/remote-access', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateOrganizationIdentity(token: string, payload: { name?: string; establishmentType?: string | null; teamSize?: string | null }) {
    return request<DashboardSummary>('/auth/organization/identity', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateOrganizationRegulatoryCountry(token: string, payload: { regulatoryCountryCode?: 'FR' | 'FI' | null }) {
    return request<DashboardSummary>('/auth/organization/regulatory-country', { method: 'POST', body: JSON.stringify(payload) }, token);
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
  installHaccp(token: string) {
    return request<DashboardSummary>('/auth/apps/haccp/install', { method: 'POST' }, token);
  },
  uninstallHaccp(token: string) {
    return request<DashboardSummary>('/auth/apps/haccp/uninstall', { method: 'POST' }, token);
  },
  haccpDashboard(token: string) {
    return request<{ success: boolean; data: any }>('/haccp/dashboard', {}, token).then((result) => result.data ?? result);
  },
  haccpList(token: string, endpoint: string) {
    return request<{ success?: boolean; data?: any[]; pagination?: any }>(endpoint, {}, token);
  },
  haccpCreate(token: string, endpoint: string, payload: Record<string, unknown>) {
    return request<{ success?: boolean; data?: any }>(endpoint, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  haccpUpdate(token: string, endpoint: string, payload: Record<string, unknown>) {
    return request<{ success?: boolean; data?: any }>(endpoint, { method: 'PUT', body: JSON.stringify(payload) }, token);
  },
  haccpDelete(token: string, endpoint: string) {
    return request<{ success?: boolean; data?: any }>(endpoint, { method: 'DELETE' }, token);
  },
  haccpAnalyzeTraceabilityImage(token: string, image: string) {
    return request<{ success?: boolean; data?: any }>('/traceability/analyze-image', { method: 'POST', body: JSON.stringify({ image }) }, token);
  },
  haccpGenerateDailyReport(token: string) {
    return request<{ success?: boolean; data?: any }>('/daily-reports/generate', { method: 'POST' }, token);
  },
  async haccpDownloadDailyReport(token: string, reportId: string, filename = 'rapport-haccp.pdf') {
    const response = await fetch(`${API_URL}/api/daily-reports/${reportId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
  haccpDownloadDailyReportUrl(reportId: string) {
    return `${API_URL}/api/daily-reports/${reportId}/download`;
  },
  haccpSensorsSummary(token: string) {
    return request<any>('/haccp/sensors/summary', {}, token);
  },
  haccpSensorGatewayStatus(token: string) {
    return request<any>('/haccp/sensors/gateway/status', {}, token);
  },
  haccpSensors(token: string) {
    return request<any[]>('/haccp/sensors', {}, token);
  },
  haccpTemperatureAlerts(token: string) {
    return request<any>('/haccp/sensors/alerts/temperature', {}, token);
  },
  haccpSensorAlertNotificationSettings(token: string) {
    return request<any>('/haccp/sensors/alerts/notification-settings', {}, token);
  },
  haccpUpdateSensorAlertNotificationSettings(token: string, payload: Record<string, unknown>) {
    return request<any>('/haccp/sensors/alerts/notification-settings', { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  haccpTestSensorAlertPush(token: string, alertId: string) {
    return request<any>(`/haccp/sensors/alerts/${encodeURIComponent(alertId)}/test-push`, { method: 'POST' }, token);
  },
  haccpSensor(token: string, id: string) {
    return request<any>(`/haccp/sensors/${id}`, {}, token);
  },
  haccpSensorReadings(token: string, id: string) {
    return request<any[]>(`/haccp/sensors/${id}/readings?limit=200`, {}, token);
  },
  haccpSensorEvents(token: string, id: string) {
    return request<any[]>(`/haccp/sensors/${id}/events`, {}, token);
  },
  haccpUpdateSensor(token: string, id: string, payload: Record<string, unknown>) {
    return request<any>(`/haccp/sensors/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  haccpRenameSensor(token: string, id: string, name: string) {
    return request<any>(`/haccp/sensors/${id}/rename`, { method: 'POST', body: JSON.stringify({ name }) }, token);
  },
  haccpAssignSensor(token: string, id: string, haccpTemperatureEquipmentId: string) {
    return request<any>(`/haccp/sensors/${id}/assign`, { method: 'POST', body: JSON.stringify({ haccpTemperatureEquipmentId }) }, token);
  },
  haccpUnassignSensor(token: string, id: string) {
    return request<any>(`/haccp/sensors/${id}/unassign`, { method: 'POST' }, token);
  },
  haccpDeleteSensor(token: string, id: string, removeFromNetwork = false) {
    return request<any>(`/haccp/sensors/${id}?removeFromNetwork=${removeFromNetwork ? 'true' : 'false'}`, { method: 'DELETE' }, token);
  },
  haccpStartSensorPairing(token: string, durationSeconds?: number) {
    return request<any>('/haccp/sensors/pairing/start', { method: 'POST', body: JSON.stringify({ durationSeconds }) }, token);
  },
  haccpStopSensorPairing(token: string) {
    return request<any>('/haccp/sensors/pairing/stop', { method: 'POST' }, token);
  },
  haccpCurrentSensorPairing(token: string) {
    return request<any | null>('/haccp/sensors/pairing/current', {}, token);
  },
  haccpSensorSocketUrl() {
    return `${API_SOCKET_URL}/haccp-sensors`;
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
  planningBootstrap(token: string, params: PlanningRangeParams = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) search.set(key, String(value));
    });
    return request<PlanningBootstrap>(`/planning/context${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  planningContext(token: string, params: PlanningRangeParams = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) search.set(key, String(value));
    });
    return request<PlanningBootstrap>(`/planning/context${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  planningDashboard(token: string, params: PlanningRangeParams = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) search.set(key, String(value));
    });
    return request<PlanningDashboardResponse>(`/planning/dashboard${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  async downloadPlanningPdf(token: string, params: PlanningRangeParams & { mode: 'week' | 'month' }) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });
    const response = await fetch(`${API_URL}/api/planning/exports/pdf?${search.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? `planning-${params.mode}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = decodeURIComponent(filename);
    link.click();
    URL.revokeObjectURL(url);
  },
  controlPlanningPeriod(token: string, payload: PlanningPeriodActionPayload) {
    return request<PlanningPeriodActionResult>('/planning/period/control', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  publishPlanningPeriod(token: string, payload: PlanningPeriodActionPayload) {
    return request<PlanningPeriodActionResult>('/planning/period/publish', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  lockPlanningPeriod(token: string, payload: PlanningPeriodActionPayload) {
    return request<PlanningPeriodActionResult>('/planning/period/lock', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  planningDayStatuses(token: string, params: { month?: number; year?: number; startDate?: string; endDate?: string; employeeId?: string } = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<PlanningDayStatus[]>(`/planning/day-statuses${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  upsertPlanningDayStatus(token: string, payload: Partial<PlanningDayStatus>) {
    return request<PlanningDayStatus>('/planning/day-statuses', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  hrTimeAccounts(token: string, params: { periodYear?: number; year?: number; employeeId?: string; accountType?: string; code?: string } = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<PlanningCountersResponse>(`/hr/time-accounts${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  recomputeHrTimeAccounts(token: string, payload: { startDate: string; endDate: string; employeeId?: string; siteId?: string; dryRun?: boolean; includeAssignments?: boolean; includeDayStatuses?: boolean; includeHrAbsences?: boolean; includeAttendance?: boolean; note?: string }) {
    return request<Record<string, any>>('/hr/time-accounts/recompute', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  adjustHrTimeAccount(token: string, payload: Partial<PlanningCounterAccount> & { quantity: number; direction: 'CREDIT' | 'DEBIT'; comment?: string; date?: string }) {
    return request<Record<string, any>>('/hr/time-accounts/adjust', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  planningAttendance(token: string, params: { month?: number; year?: number; startDate?: string; endDate?: string; employeeId?: string; status?: string } = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<PlanningAttendanceResponse>(`/planning/attendance${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  employeePlanningAttendance(token: string, employeeId: string, params: { month?: number; year?: number; startDate?: string; endDate?: string; status?: string } = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return request<PlanningAttendanceResponse>(`/planning/attendance/${employeeId}${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  createPlanningAttendance(token: string, payload: Record<string, any>) {
    return request<Record<string, any>>('/planning/attendance', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningAttendance(token: string, id: string, payload: Record<string, any>) {
    return request<Record<string, any>>(`/planning/attendance/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  validatePlanningAttendance(token: string, id: string, payload: Record<string, any>) {
    return request<Record<string, any>>(`/planning/attendance/${id}/validate`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  planningCodeDictionary(token: string) {
    return request<PlanningCodeDictionaryEntry[]>('/planning/code-dictionary', {}, token);
  },
  createPlanningCodeDictionaryEntry(token: string, payload: Partial<PlanningCodeDictionaryEntry>) {
    return request<PlanningCodeDictionaryEntry>('/planning/code-dictionary', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningCodeDictionaryEntry(token: string, id: string, payload: Partial<PlanningCodeDictionaryEntry>) {
    return request<PlanningCodeDictionaryEntry>(`/planning/code-dictionary/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  planningPolicyProfiles(token: string) {
    return request<PlanningPolicyProfile[]>('/planning/policy-profiles', {}, token);
  },
  createPlanningPolicyProfile(token: string, payload: Partial<PlanningPolicyProfile>) {
    return request<PlanningPolicyProfile>('/planning/policy-profiles', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningPolicyProfile(token: string, id: string, payload: Partial<PlanningPolicyProfile>) {
    return request<PlanningPolicyProfile>(`/planning/policy-profiles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  createPlanningAssignment(token: string, payload: Partial<PlanningAssignment>) {
    return request<PlanningAssignment>('/planning/assignments', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  planningAssignments(token: string, params: PlanningRangeParams = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) search.set(key, String(value));
    });
    return request<PlanningAssignment[]>(`/planning/assignments${search.size ? `?${search.toString()}` : ''}`, {}, token);
  },
  upsertPlanningDayAssignment(token: string, payload: Partial<PlanningAssignment> & { templateId?: string }) {
    return request<PlanningAssignment>('/planning/assignments/upsert-day', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningAssignment(token: string, id: string, payload: Partial<PlanningAssignment>) {
    return request<PlanningAssignment>(`/planning/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  movePlanningAssignment(token: string, id: string, payload: Partial<PlanningAssignment>) {
    return request<PlanningAssignment>(`/planning/assignments/${id}/move`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  createPlanningRequirement(token: string, payload: Partial<PlanningRequirement>) {
    return request<PlanningRequirement>('/planning/requirements', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningRequirement(token: string, id: string, payload: Partial<PlanningRequirement>) {
    return request<PlanningRequirement>(`/planning/requirements/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  deletePlanningRequirement(token: string, id: string) {
    return request<PlanningRequirement>(`/planning/requirements/${id}`, { method: 'DELETE' }, token);
  },
  createPlanningDayPreset(token: string, payload: PlanningDayPresetPayload) {
    return request<PlanningTemplate>('/planning/templates/day-presets', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningDayPreset(token: string, id: string, payload: PlanningDayPresetPayload) {
    return request<PlanningTemplate>(`/planning/templates/day-presets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  deletePlanningDayPreset(token: string, id: string) {
    return request<PlanningTemplate>(`/planning/templates/day-presets/${id}`, { method: 'DELETE' }, token);
  },
  createPlanningWeeklyRotation(token: string, payload: PlanningWeeklyRotationPayload) {
    return request<PlanningTemplate>('/planning/templates/weekly-rotations', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updatePlanningWeeklyRotation(token: string, id: string, payload: PlanningWeeklyRotationPayload) {
    return request<PlanningTemplate>(`/planning/templates/weekly-rotations/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  deletePlanningWeeklyRotation(token: string, id: string) {
    return request<PlanningTemplate>(`/planning/templates/weekly-rotations/${id}`, { method: 'DELETE' }, token);
  },
  setPlanningEmployeeTemplates(token: string, payload: PlanningEmployeeTemplateAssignment) {
    return request<PlanningEmployeeTemplateAssignment>('/planning/templates/employee-assignments', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  generatePlanning(token: string, payload: { startDate: string; endDate: string; siteId?: string; apply?: boolean }) {
    return request<PlanningGenerationResult>('/planning/generate', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  previewPlanningRotation(token: string, rotationId: string, payload: { startDate: string; endDate: string; employeeId?: string; siteId?: string }) {
    return request<{ assignments?: PlanningAssignment[]; crossSiteReplacements?: PlanningCrossSiteReplacement[]; applied?: boolean; temporarySource?: string }>(`/planning/rotations/${rotationId}/preview`, { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  applyPlanningRotation(token: string, rotationId: string, payload: { startDate: string; endDate: string; employeeId?: string; siteId?: string; replaceExisting?: boolean }) {
    return request<{ appliedAssignments?: PlanningAssignment[]; skipped?: unknown[]; crossSiteReplacements?: PlanningCrossSiteReplacement[]; applied?: boolean; temporarySource?: string }>(`/planning/rotations/${rotationId}/apply`, { method: 'POST', body: JSON.stringify(payload) }, token);
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
  uninstallPlanning(token: string) {
    return request<DashboardSummary>('/auth/apps/planning/uninstall', { method: 'POST' }, token);
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
  articles(token: string, params?: { search?: string; page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    return request<ArticlesResponse>(`/articles${query.toString() ? `?${query}` : ''}`, {}, token);
  },
  createProduct(
    token: string,
    payload: ProductMutationPayload & { name: string; unitId: string },
  ) {
    const { supplierId, averagePurchasePrice, ...rest } = payload;
    const primarySupplierId = payload.primarySupplierId !== undefined ? payload.primarySupplierId : supplierId;
    return request<Product>('/products', { method: 'POST', body: JSON.stringify({ ...rest, averagePrice: payload.averagePrice ?? averagePurchasePrice, primarySupplierId: uuidOrNullOrUndefined(primarySupplierId) }) }, token);
  },
  updateProduct(
    token: string,
    id: string,
    payload: ProductMutationPayload,
  ) {
    const { supplierId, averagePurchasePrice, ...rest } = payload;
    const primarySupplierId = payload.primarySupplierId !== undefined ? payload.primarySupplierId : supplierId;
    return request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify({ ...rest, averagePrice: payload.averagePrice ?? averagePurchasePrice, primarySupplierId: uuidOrNullOrUndefined(primarySupplierId) }) }, token);
  },
  archiveProduct(token: string, id: string) {
    return request<Product>(`/products/${id}/archive`, { method: 'POST' }, token);
  },
  async downloadProductImportTemplate(token: string) {
    const response = await fetch(`${API_URL}/api/products/import/template.csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = 'modele-import-produits.csv';
    link.click();
    URL.revokeObjectURL(url);
  },
  async analyzeProductImport(token: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch(`${API_URL}/api/products/import/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
    return response.json() as Promise<ProductImportPreview>;
  },
  commitProductImport(token: string, payload: { rows: Array<{ rowNumber: number; fields: ProductImportPreviewFields; selected?: boolean }>; mapping?: Record<string, ProductImportField>; options?: { createMissingCategories?: boolean; createMissingSuppliers?: boolean } }) {
    return request<ProductImportCommitResult>('/products/import/commit', { method: 'POST', body: JSON.stringify(payload) }, token);
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
  createSite(token: string, payload: SitePayload) {
    return request<Site>('/sites', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  updateSite(token: string, id: string, payload: Partial<SitePayload>) {
    return request<Site>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
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
  marginsDashboard(token: string, params: { period?: string; productId?: string; supplierId?: string; categoryId?: string; search?: string; dateFrom?: string; dateTo?: string } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<MarginsDashboard>(`/stocks/margins/dashboard${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  marginProduct(token: string, id: string) {
    return request<MarginProductDetail>(`/stocks/margins/products/${id}`, {}, token);
  },
  marginSupplier(token: string, id: string) {
    return request<MarginSupplierDetail>(`/stocks/margins/suppliers/${id}`, {}, token);
  },
  marginAlerts(token: string) {
    return request<MarginAlert[]>('/stocks/margins/alerts', {}, token);
  },
  marginSettings(token: string) {
    return request<MarginSettings>('/stocks/margins/settings', {}, token);
  },
  updateMarginSettings(token: string, payload: Partial<MarginSettings>) {
    return request<MarginSettings>('/stocks/margins/settings', { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  marginSearch(token: string, search: string) {
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    return request<{ products: Product[]; suppliers: Supplier[]; invoices: unknown[]; lots: unknown[]; lines: unknown[] }>(`/stocks/margins/search?${qs.toString()}`, {}, token);
  },
  marginReports(token: string) {
    return request<MarginReport[]>('/stocks/margins/reports', {}, token);
  },
  generateMarginReport(token: string, payload: { period?: string; dateFrom?: string; dateTo?: string } = {}) {
    return request<MarginReport>('/stocks/margins/reports', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  async downloadMarginReportCsv(token: string, reportId: string, filename = 'rapport-marges.csv') {
    const response = await fetch(`${API_URL}/api/stocks/margins/reports/${reportId}.csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
  documents(token: string, params: { search?: string; supplier?: string; type?: string; dateFrom?: string; dateTo?: string } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') qs.set(key, String(value)); });
    return request<MyDocumentsResponse>(`/documents${qs.toString() ? `?${qs.toString()}` : ''}`, {}, token);
  },
  async viewDocument(token: string, documentId: string) {
    const response = await fetch(`${API_URL}/api/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  async downloadDocument(token: string, documentId: string, filename: string) {
    const response = await fetch(`${API_URL}/api/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
  renameDocument(token: string, documentId: string, originalName: string) {
    return request<MyDocument>(`/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ originalName })
    }, token);
  },
  stocksOcrConfig(token: string) {
    return request<StocksOcrConfig>('/stocks/ocr/config', {}, token);
  },
  uploadStocksOcrDocuments(token: string, files: File[]) {
    const body = new FormData();
    files.forEach((file) => body.append('files', file));
    return fetch(`${API_URL}/api/stocks/ocr/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(await response.text(), response.status);
      return response.json() as Promise<{ documents: StocksOcrStatus['document'][] }>;
    });
  },
  analyzeStocksOcrBatch(token: string, documentIds: string[]) {
    return request<{ jobs: Array<{ documentId: string; ocrDocumentId: string; status: string }> }>('/stocks/ocr/documents/analyze-batch', { method: 'POST', body: JSON.stringify({ documentIds }) }, token);
  },
  stocksOcrStatuses(token: string) {
    return request<{ statuses: StocksOcrStatus[] }>('/stocks/ocr/documents/statuses', {}, token);
  },
  stocksOcrStatus(token: string, documentId: string) {
    return request<StocksOcrStatus>(`/stocks/ocr/documents/${documentId}/status`, {}, token);
  },
  stocksOcrExtraction(token: string, extractionId: string) {
    return request<StocksOcrExtraction>(`/stocks/ocr/extractions/${extractionId}`, {}, token);
  },
  reanalyzeStocksOcrWithAi(token: string, extractionId: string) {
    return request<StocksOcrExtraction>(`/stocks/ocr/extractions/${extractionId}/reanalyze-ai`, { method: 'POST' }, token);
  },
  saveStocksOcrCorrections(token: string, extractionId: string, payload: StocksOcrExtraction['data']) {
    return request<StocksOcrExtraction>(`/stocks/ocr/extractions/${extractionId}/corrections`, { method: 'PATCH', body: JSON.stringify(normalizeOcrCorrectionPayload(payload)) }, token);
  },
  createStockReceptionFromOcr(token: string, extractionId: string, payload: StocksOcrExtraction['data']) {
    return request<StockReception>(`/stocks/ocr/extractions/${extractionId}/reception`, { method: 'POST', body: JSON.stringify(normalizeOcrCorrectionPayload(payload)) }, token);
  },
  createStockAssistantConversation(token: string, locationId?: string) { return request<StockConversation>('/stock-assistant/conversations', { method: 'POST', body: JSON.stringify({ locationId }) }, token); },
  stockAssistantConversation(token: string, conversationId: string) { return request<StockConversation>(`/stock-assistant/conversations/${conversationId}`, {}, token); },
  stockAssistantMessage(token: string, conversationId: string, content: string, locationId?: string) { return request<{ proposalId?: string; assistantMessage: string; state?: Record<string, unknown>; suggestions?: string[]; choices?: import('../types').StockAssistantChoice[]; toolResults?: unknown[]; confidence?: number | null; needsReview?: boolean }> (`/stock-assistant/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content, locationId }) }, token); },
  stockAssistantProposal(token: string, proposalId: string) { return request<StockProposal>(`/stock-assistant/proposals/${proposalId}`, {}, token); },
  updateStockAssistantProposal(token: string, proposalId: string, payload: Omit<Partial<StockProposal>, 'lines'> & { version: number; lines: Array<Pick<StockProposal['lines'][number], 'id' | 'productId' | 'rawLabel' | 'supplierSku' | 'quantity' | 'purchaseUnit' | 'inputUnitId' | 'unitPriceExVat' | 'lotNumber' | 'expiryDate' | 'notes'>> }) { return request<StockProposal>(`/stock-assistant/proposals/${proposalId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token); },
  applyStockAssistantProposal(token: string, proposalId: string, version: number) { return request<StockProposal>(`/stock-assistant/proposals/${proposalId}/apply`, { method: 'POST', body: JSON.stringify({ version }) }, token); },
  rejectStockAssistantProposal(token: string, proposalId: string) { return request<StockProposal>(`/stock-assistant/proposals/${proposalId}/reject`, { method: 'POST' }, token); },
  createStockAssistantInvoiceProposal(token: string, documentId: string, locationId?: string) { return request<StockProposal>(`/stock-assistant/documents/${documentId}/proposals`, { method: 'POST', body: JSON.stringify({ locationId }) }, token); },
  async createStockAssistantInvoiceAttachmentProposal(token: string, file: File, locationId?: string, conversationId?: string) {
    const body = new FormData();
    body.append('file', file);
    if (locationId) body.append('locationId', locationId);
    if (conversationId) body.append('conversationId', conversationId);
    const response = await fetch(`${API_URL}/api/stock-assistant/invoice-attachments`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
    if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
    return response.json() as Promise<StockProposal | { status: 'PROCESSING'; documentId: string; message: string }>;
  },
  async viewStocksDocument(token: string, documentId: string) {
    const response = await fetch(`${API_URL}/api/stocks/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  async downloadStocksDocument(token: string, documentId: string, filename: string) {
    const response = await fetch(`${API_URL}/api/stocks/documents/${documentId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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
  backups(token: string) {
    return request<BackupListResponse>('/backups', {}, token);
  },
  createBackup(token: string) {
    return request<BackupSummary>('/backups', { method: 'POST' }, token);
  },
  backupSchedule(token: string) {
    return request<BackupSchedule>('/backups/schedule', {}, token);
  },
  updateBackupSchedule(token: string, payload: BackupSchedule) {
    const { enabled, frequency, time, weekday, retentionDays } = payload;
    return request<BackupSchedule>('/backups/schedule', { method: 'PATCH', body: JSON.stringify({ enabled, frequency, time, weekday, retentionDays }) }, token);
  },
  async downloadBackup(token: string, backup: BackupSummary) {
    const response = await fetch(`${API_URL}/api/backups/${backup.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError(await response.text(), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = backup.filename;
    link.click();
    URL.revokeObjectURL(url);
  },
  sendBackupToGoogleDrive(token: string, id: string) {
    return request<{ ok: boolean; message: string; connection: BackupCloudStatus['googleDrive']; backup: BackupSummary }>(`/backups/${id}/cloud/google`, { method: 'POST' }, token);
  },
  restoreBackup(token: string, id: string, confirmationPhrase: string) {
    return request<BackupRestoreResult>(`/backups/${id}/restore`, { method: 'POST', body: JSON.stringify({ confirmationPhrase }) }, token);
  },
  inspectBackupUpload(token: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    return fetch(`${API_URL}/api/backups/upload/inspect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(await response.text(), response.status);
      return response.json() as Promise<BackupInspection>;
    });
  },
  restoreBackupUpload(token: string, uploadId: string, confirmationPhrase: string) {
    const body = new FormData();
    body.set('uploadId', uploadId);
    body.set('confirmationPhrase', confirmationPhrase);
    return fetch(`${API_URL}/api/backups/upload/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(await response.text(), response.status);
      return response.json() as Promise<BackupRestoreResult>;
    });
  },
  backupCloudDefaultRedirectUri() {
    const base = API_URL || globalThis.location.origin;
    return `${base}/api/backups/cloud/google/callback`;
  },
  backupCloudStatus(token: string) {
    return request<BackupCloudStatus>('/backups/cloud/status', {}, token);
  },
  configureGoogleDriveBackup(token: string, payload: { clientId: string; clientSecret?: string; redirectUri: string }) {
    return request<BackupCloudStatus['googleDrive']>('/backups/cloud/google/config', { method: 'PUT', body: JSON.stringify(payload) }, token);
  },
  connectGoogleDriveBackup(token: string) {
    return request<{ authUrl: string }>('/backups/cloud/google/connect', { method: 'POST' }, token);
  },
  testGoogleDriveBackup(token: string) {
    return request<{ ok: boolean; connection: BackupCloudStatus['googleDrive'] }>('/backups/cloud/google/test', { method: 'POST' }, token);
  },
  disconnectGoogleDriveBackup(token: string) {
    return request<BackupCloudStatus['googleDrive']>('/backups/cloud/google', { method: 'DELETE' }, token);
  },
  inspectBootstrapBackup(file: File) {
    const body = new FormData();
    body.set('file', file);
    return fetch(`${API_URL}/api/backups/bootstrap/inspect`, { method: 'POST', body }).then(async (response) => {
      if (!response.ok) throw new ApiError(await response.text(), response.status);
      return response.json() as Promise<BackupInspection>;
    });
  },
  restoreBootstrapBackup(uploadId: string, confirmationPhrase: string) {
    const body = new FormData();
    body.set('uploadId', uploadId);
    body.set('confirmationPhrase', confirmationPhrase);
    return fetch(`${API_URL}/api/backups/bootstrap/restore`, { method: 'POST', body }).then(async (response) => {
      if (!response.ok) throw new ApiError(await response.text(), response.status);
      return response.json() as Promise<BackupRestoreResult>;
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
    const [rawSummary, collaborators, departments, positions, availableUsers, onboarding] = await Promise.all([
      request<any>('/hr/dashboard', {}, token).catch(() => ({})),
      request<HrCollaborator[]>('/hr/employees?includeArchived=true&pageSize=200', {}, token).catch(() => []),
      request<HrDepartment[]>('/hr/departments?includeArchived=true&pageSize=200', {}, token).catch(() => []),
      request<HrPosition[]>('/hr/positions?includeArchived=true&pageSize=200', {}, token).catch(() => []),
      request<CoreUser[]>('/hr/users/available', {}, token).catch(() => []),
      request<any>('/hr/onboarding', {}, token).catch(() => null),
    ]);
    const summary: HrSummary = {
      counts: {
        collaborators: rawSummary.counts?.collaborators ?? rawSummary.employeeCount ?? 0,
        departments: rawSummary.counts?.departments ?? rawSummary.departmentCount ?? 0,
        positions: rawSummary.counts?.positions ?? rawSummary.positionCount ?? 0,
        linkedCollaborators: rawSummary.counts?.linkedCollaborators ?? rawSummary.linkedCount ?? 0,
      },
      latestCollaborators: rawSummary.latestCollaborators ?? rawSummary.latestEmployees ?? [],
      departmentDistribution: rawSummary.departmentDistribution,
    };
    return { summary, collaborators, departments, positions, availableUsers, onboarding };
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
  uploadHrCollaboratorDocument(token: string, employeeId: string, payload: { file: File; category: string; notes?: string; expiresAt?: string }) {
    const body = new FormData();
    body.set('file', payload.file);
    body.set('category', payload.category);
    if (payload.notes) body.set('notes', payload.notes);
    if (payload.expiresAt) body.set('expiresAt', payload.expiresAt);
    return fetch(`${API_URL}/api/hr/employees/${employeeId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
      return response.json() as Promise<HrDocument>;
    });
  },
  deleteHrCollaboratorDocument(token: string, employeeId: string, documentId: string) {
    return request<{ deleted: boolean }>(`/hr/employees/${employeeId}/documents/${documentId}`, { method: 'DELETE' }, token);
  },
  replaceHrCollaboratorDocument(token: string, employeeId: string, documentId: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    return fetch(`${API_URL}/api/hr/employees/${employeeId}/documents/${documentId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (response) => {
      if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
      return response.json() as Promise<HrDocument>;
    });
  },
  async viewHrCollaboratorDocument(token: string, employeeId: string, document: HrDocument) {
    const url = await this.createHrCollaboratorDocumentPreviewUrl(token, employeeId, document);
    globalThis.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  async createHrCollaboratorDocumentPreviewUrl(token: string, employeeId: string, document: HrDocument) {
    const response = await fetch(`${API_URL}/api/hr/employees/${employeeId}/documents/${document.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
  async downloadHrCollaboratorDocument(token: string, employeeId: string, document: HrDocument) {
    const response = await fetch(`${API_URL}/api/hr/employees/${employeeId}/documents/${document.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new ApiError(await readApiErrorMessage(response), response.status);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = document.originalName || document.filename;
    link.click();
    URL.revokeObjectURL(url);
  },
  hrCollaboratorDocumentUrl(employeeId: string, documentId: string) {
    return `${API_URL}/api/hr/employees/${employeeId}/documents/${documentId}`;
  },
  createHrDepartment(token: string, payload: HrReferencePayload) {
    return request<HrDepartment>('/hr/departments', { method: 'POST', body: JSON.stringify(payload) }, token);
  },
  createHrDepartmentsBulk(token: string, names: string[]) {
    return request<{ created: number; skipped: number }>('/hr/departments/bulk', { method: 'POST', body: JSON.stringify({ names }) }, token);
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
  createHrPositionsBulk(token: string, items: string[] | HrReferencePayload[]) {
    const body = typeof items[0] === 'object' ? { names: [], references: items } : { names: items };
    return request<{ created: number; skipped: number }>('/hr/positions/bulk', { method: 'POST', body: JSON.stringify(body) }, token);
  },
  updateHrPosition(token: string, id: string, payload: HrReferencePayload) {
    return request<HrPosition>(`/hr/positions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
  },
  archiveHrPosition(token: string, id: string) {
    return request<HrPosition>(`/hr/positions/${id}/archive`, { method: 'POST' }, token);
  },
  completeHrServices(token: string, names: string[] = []) {
    return request<any>('/hr/onboarding/complete-services', { method: 'POST', body: JSON.stringify({ names }) }, token);
  },
  completeHrPositions(token: string) {
    return request<any>('/hr/onboarding/complete-positions', { method: 'POST' }, token);
  },
  unlockHrEmployees(token: string) {
    return request<any>('/hr/onboarding/unlock-employees', { method: 'POST' }, token);
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
