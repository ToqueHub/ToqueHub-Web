export type EstablishmentType =
  | 'Restaurant'
  | 'EHPAD'
  | 'Collectivité'
  | 'Hôtel'
  | 'Traiteur'
  | 'Cuisine centrale'
  | 'Autre';
export type TeamSize = '1-5' | '6-10' | '11-20' | '20+';
export type HrCountryCode = 'FR' | 'FI';
export type RegulatoryCountryCode = 'FR' | 'FI';

export interface CompleteOnboardingPayload {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organizationName: string;
  establishmentType?: EstablishmentType;
  hrCountryCode?: HrCountryCode;
  regulatoryCountryCode?: RegulatoryCountryCode;
  teamSize?: TeamSize;
  logoDataUrl?: string;
  primarySiteName?: string;
  secondarySiteNames?: string[];
  mistralApiKey?: string;
}

export interface SystemStatus {
  initialized: boolean;
  hasOrganization: boolean;
  hasAdmin: boolean;
}

export interface RemoteAccessStatus {
  status: 'inactive' | 'needs_login' | 'active' | 'unavailable';
  url: string | null;
  loginUrl: string | null;
  hostname: string | null;
  dnsName?: string | null;
  dnsUrl?: string | null;
  magicDnsReady?: boolean;
  ip: string | null;
  message: string;
}

export interface SystemInstanceInfo {
  generatedAt: string;
  app: {
    name: string;
    apiPackage: string;
    version: string;
    license: string | null;
    nodeEnv: string;
  };
  frontend: {
    url: string;
    configuredOrigins: string[];
    dockerPort: string;
  };
  api: {
    url: string;
    port: string;
    basePath: string;
    docsPath: string;
    uptimeSeconds: number;
    startedAt: string;
  };
  docker: {
    containerized: boolean;
    composeProject: string;
    imageRegistry: string | null;
    imageTag: string | null;
    architecture: string;
  };
  remoteAccess?: {
    provider: 'tailscale' | string;
    enabled: boolean;
    installed: boolean;
    active: boolean;
    status?: RemoteAccessStatus['status'];
    hostname: string | null;
    url: string | null;
    ip: string | null;
    loginUrl?: string | null;
    message?: string;
    activationCommand: string;
  };
  database: {
    provider: 'postgresql';
    connected: boolean;
    error: string | null;
    host: string | null;
    port: string | null;
    database: string | null;
    url: string | null;
  };
  mqtt: {
    configured: boolean;
    broker: string | null;
    host: string | null;
    port: string | null;
    usernameConfigured: boolean;
    baseTopic: string;
    zigbee2mqttFrontendUrl: string | null;
    zigbeeAdapterPath: string | null;
    zigbeeAdapterPresent: boolean;
    detectedSerialPorts: string[];
    suggestedZigbeeAdapterPath: string | null;
  };
  storage: {
    backupDir: string;
    uploadDir: string;
    hrUploadDir: string;
    stocksOcrUploadDir: string;
    haccpUploadDir: string;
  };
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    node: string;
    cpuCount: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    uptimeSeconds: number;
  };
}

export interface SystemUpdateOperation {
  id: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'rollback';
  targetTag?: string;
  startedAt: string;
  finishedAt?: string | null;
  logs: string[];
  error?: string | null;
}

export interface SystemUpdateStatus {
  channel: 'stable';
  checkedAt: string;
  current: {
    version: string;
    imageTag: string;
    registry: string | null;
    apiImage: string;
    webImage: string;
  };
  latest: {
    version: string;
    tag: string | null;
    name: string | null;
    url: string | null;
    publishedAt: string | null;
    notes: string | null;
    source?: 'release' | 'tag';
  } | null;
  updateAvailable: boolean;
  github: {
    repo: string;
    error: string | null;
  };
  runtime: {
    platform: string;
    updaterAvailable: boolean;
    updaterError: string | null;
    lastOperation: SystemUpdateOperation | null;
  };
}

export interface SystemChangelogEntry {
  version: string;
  tag: string;
  name: string | null;
  url: string | null;
  publishedAt: string | null;
  notes: string | null;
  isInstalled: boolean;
  isLatest: boolean;
}

export interface SystemChangelogResponse {
  checkedAt: string;
  repo: string;
  currentVersion: string;
  latestTag: string | null;
  entries: SystemChangelogEntry[];
  error: string | null;
}

export interface SystemUpdateApplyResult {
  skipped: boolean;
  message?: string;
  status?: SystemUpdateStatus;
  operation?: SystemUpdateOperation;
}

export interface BackupManifest {
  format: 'toquehub-backup';
  version: number;
  createdAt: string;
  createdBy: string | null;
  mode: 'manual' | 'scheduled';
  app: { name: string; packageVersion: string };
  database: {
    provider: 'postgresql';
    dump: string;
    checksumSha256: string;
    sizeBytes: number;
  };
  files: {
    roots: Array<{
      key: string;
      envVar: string;
      archivePath: string;
      targetPath: string;
      sizeBytes: number;
      fileCount: number;
    }>;
    totalSizeBytes: number;
    totalFileCount: number;
  };
  excluded: string[];
}

export interface BackupSummary {
  id: string;
  filename: string;
  createdAt: string | null;
  sizeBytes: number;
  mode?: 'manual' | 'scheduled';
  manifest?: BackupManifest;
}

export interface BackupListResponse {
  backups: BackupSummary[];
  operation: 'backup' | 'restore' | null;
  tools: Array<{ key: string; path: string; available: boolean }>;
}

export interface BackupInspection {
  uploadId: string;
  filename: string;
  sizeBytes: number;
  manifest: BackupManifest;
}

export interface BackupRestoreResult {
  restored: boolean;
  restoredAt: string;
  manifest: BackupManifest;
  message: string;
}

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  time: string;
  weekday: number;
  retentionDays: number;
  lastRunAt: string | null;
}

export type BackupCloudProvider = 'GOOGLE_DRIVE';
export type BackupCloudConnectionStatus = 'DISCONNECTED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';

export interface BackupCloudConnectionView {
  provider: BackupCloudProvider;
  status: BackupCloudConnectionStatus;
  configured: boolean;
  connected: boolean;
  clientId: string | null;
  redirectUri: string | null;
  accountEmail: string | null;
  driveFolderId: string | null;
  lastSyncAt: string | null;
  lastTestAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

export interface BackupCloudStatus {
  googleDrive: BackupCloudConnectionView;
  encryptionConfigured: boolean;
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

export type StockMovementType =
  | 'RECEPTION'
  | 'IN'
  | 'ENTRY'
  | 'OUT'
  | 'EXIT'
  | 'PRODUCTION'
  | 'LOSS'
  | 'CORRECTION'
  | 'INVENTORY'
  | 'TRANSFER';

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
    hrCountryCode?: HrCountryCode | null;
    regulatoryCountryCode?: RegulatoryCountryCode | null;
    regulatoryCountrySelectedAt?: string | null;
    regulatoryCountrySelectedById?: string | null;
    teamSize?: TeamSize | null;
    logoUrl?: string | null;
    logoDataUrl?: string | null;
    mainSiteName?: string | null;
    primarySiteId?: string | null;
    installedApplications?: string[];
    apiKeys?: OrganizationApiKeys;
    remoteAccess?: OrganizationRemoteAccess;
    role: string;
    status?: UserStatus;
    isPrimaryAdmin?: boolean;
    permissions?: string[];
  };
}

export type UserRoleKey = 'ADMIN' | 'MANAGER' | 'USER';
export type UserStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';

export interface CorePermission {
  id?: string;
  key: string;
  label?: string;
  description?: string | null;
  module?: string | null;
}

export interface CoreRole {
  id?: string;
  key?: UserRoleKey | string;
  name?: string;
  label?: string;
  description?: string | null;
  permissions: Array<string | CorePermission>;
  locked?: boolean;
  isSystem?: boolean;
}

export interface CoreUser {
  id: string;
  username?: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRoleKey | string;
  status: UserStatus;
  organizationId?: string | null;
  organizationName?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isPrimaryAdmin?: boolean;
  permissions?: string[];
}

export interface UsersRepositoryResponse {
  users: CoreUser[];
  roles: CoreRole[];
  permissions: CorePermission[];
  devSwitchEnabled?: boolean;
}

export interface DevSwitchConfig {
  enabled: boolean;
}

export type WorkspaceOnboardingStatus = 'PENDING' | 'IN_PROGRESS' | 'DEFERRED' | 'COMPLETED';

export type WorkspaceOnboardingStep =
  | 'WELCOME'
  | 'ECOSYSTEM'
  | 'STARTER_BUNDLE'
  | 'INSTALLATION'
  | 'MINI_TOUR';

export interface WorkspaceOnboardingState {
  eligible: boolean;
  version: number;
  status: WorkspaceOnboardingStatus | null;
  currentStep: WorkspaceOnboardingStep | null;
  startedAt: string | null;
  deferredAt: string | null;
  completedAt: string | null;
}

export interface DashboardSummary {
  user: UserSession['user'];
  organization: {
    id: string | null;
    name: string;
    establishmentType?: EstablishmentType | null;
    hrCountryCode?: HrCountryCode | null;
    regulatoryCountryCode?: RegulatoryCountryCode | null;
    regulatoryCountrySelectedAt?: string | null;
    regulatoryCountrySelectedById?: string | null;
    teamSize?: TeamSize | null;
    logoDataUrl?: string | null;
    mainSiteName?: string | null;
    primarySiteId?: string | null;
    apiKeys?: OrganizationApiKeys;
    remoteAccess?: OrganizationRemoteAccess;
  };
  installedApplications: string[];
  counts: {
    products: number;
    suppliers: number;
    stockMovements: number;
    activeUsers?: number;
    users?: number;
    collaborators?: number;
    hrCollaborators?: number;
  };
  progress: {
    percent: number;
    checklist: {
      applicationInstalled: boolean;
      firstProductCreated: boolean;
      supplierAdded: boolean;
      stockMovementCreated: boolean;
    };
  };
  workspaceOnboarding: WorkspaceOnboardingState;
}

export interface OrganizationApiKeys {
  mistral: {
    configured: boolean;
    masked?: string | null;
    updatedAt?: string | null;
  };
  resend?: {
    configured: boolean;
    masked?: string | null;
    updatedAt?: string | null;
  };
  github?: {
    configured: boolean;
    masked?: string | null;
    updatedAt?: string | null;
  };
}

export interface OrganizationRemoteAccess {
  enabled: boolean;
  tailscaleHostname?: string | null;
  tailscaleUrl?: string | null;
  tailscaleIp?: string | null;
  updatedAt?: string | null;
}

export interface StocksOcrConfig {
  provider: string;
  model: string;
  configured: boolean;
  source?: 'environment' | 'organization' | string | null;
}

export interface StockProposalLine {
  id: string;
  productId?: string | null;
  rawLabel: string;
  supplierSku?: string | null;
  quantity: string | number;
  purchaseUnit?: string | null;
  inputUnitId?: string | null;
  unitPriceExVat?: string | number | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  matchStatus: 'MATCHED' | 'AMBIGUOUS' | 'UNMATCHED';
  matchConfidence?: string | number | null;
  notes?: string | null;
  metadata?: { candidates?: Array<{ id: string; name: string; unitId: string; score: number }> };
}
export interface StockProposal {
  id: string;
  type: string;
  status: string;
  version: number;
  locationId?: string | null;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  supplierId?: string | null;
  duplicateWarning?: unknown;
  duplicateOverrideReason?: string | null;
  sourceType?: string | null;
  sourceDocumentId?: string | null;
  metadata?: {
    supplierName?: string | null;
    ocrResult?: {
      supplierName?: string | null;
      supplier?: { name?: string | null; supplierName?: string | null };
    };
  } | null;
  lines: StockProposalLine[];
}
export interface StockConversation {
  id: string;
  locationId?: string | null;
  state?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    metadata?: {
      proposalId?: string | null;
      state?: Record<string, unknown>;
      choices?: StockAssistantChoice[];
    } | null;
  }>;
}

export type StockAssistantChoice = {
  type:
    | 'product_select'
    | 'product_create'
    | 'location_select'
    | 'supplier_select'
    | 'proposal_review'
    | 'confirm_duplicate'
    | 'clarification';
  label: string;
  value?: string;
  description?: string;
  payload?: Record<string, unknown>;
};

export type TechnicalSheetAssistantChoice = {
  type: 'recipe_select' | 'product_select' | 'category_select' | 'draft_review' | 'clarification';
  label: string;
  value?: string;
  description?: string;
};
export type HaccpAssistantChoice = {
  type: 'haccp_draft_review' | 'haccp_equipment' | 'haccp_surface' | 'clarification';
  label: string;
  value?: string;
  description?: string;
  payload?: Record<string, unknown>;
};
export type HumanSupportAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};
export type HumanSupportMessage = {
  id: string;
  author: 'USER' | 'VOLUNTEER' | 'SYSTEM';
  content: string;
  volunteerName?: string | null;
  deliveryStatus: 'PENDING' | 'SENT' | 'FAILED';
  deliveryError?: string | null;
  createdAt: string;
  attachments: HumanSupportAttachment[];
};
export type HumanSupportTicket = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  contactEmail: string;
  contactPhone?: string | null;
  assignedVolunteer?: string | null;
  relayError?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  messages: HumanSupportMessage[];
};
export interface TechnicalSheetAssistantDraft {
  id: string;
  targetTechnicalSheetId?: string | null;
  status: 'PENDING_REVIEW' | 'APPLIED' | 'DISCARDED' | 'EXPIRED' | string;
  payload: TechnicalSheetRecipePayload;
  metadata?: Record<string, unknown> | null;
  expiresAt: string;
}
export interface TechnicalSheetAssistantConversation {
  id: string;
  state?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: string;
    metadata?: {
      draftId?: string | null;
      choices?: TechnicalSheetAssistantChoice[];
      needsReview?: boolean;
    } | null;
  }>;
  drafts?: TechnicalSheetAssistantDraft[];
}

export interface MyDocument {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sourceModule: string;
  sourceType?: string | null;
  status: string;
  processingState: 'ready' | 'processing' | 'failed' | string;
  type: 'invoice' | 'delivery_note' | 'unknown' | string;
  supplierId?: string | null;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  deliveryNoteNumber?: string | null;
  receiptNumber?: string | null;
  documentDate?: string | null;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  extractionId?: string | null;
  receptionId?: string | null;
  receptionStatus?: string | null;
  uploadedBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
}

export interface MyDocumentsResponse {
  items: MyDocument[];
  summary: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
    suppliers: Array<{ id: string | null; name: string; count: number }>;
    months: Array<{ key: string; label: string; count: number }>;
  };
}

export interface DashboardWidget {
  id: string;
  title: string;
  module?: string;
  appId?: string;
  moduleLabel?: string;
  zone: 'kpi' | 'activity' | 'analytics' | 'alerts';
  type?: string;
  order: number;
  pinned?: boolean;
  visible?: boolean;
  installed?: boolean;
  comingSoon?: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  data?: Record<string, unknown>;
}

export interface ModularDashboardPreferences {
  theme?: 'emerald' | 'blue' | 'amber' | 'dark' | string;
  layoutMode?: 'split' | 'stacked';
  hiddenWidgetIds: string[];
  pinnedWidgetIds: string[];
  zoneOrder: Record<'kpi' | 'activity' | 'analytics' | 'alerts', string[]>;
  autoHideSidebar: boolean;
}

export interface ModularDashboard {
  zones: Record<'kpi' | 'activity' | 'analytics' | 'alerts', DashboardWidget[]>;
  widgets: DashboardWidget[];
  preferences: ModularDashboardPreferences;
  refreshIntervalMs: number;
  generatedAt: string;
  cockpit?: DashboardCockpit;
}

export interface DashboardCockpitCard {
  id: string;
  module: string;
  title: string;
  value: string | number;
  description: string;
  href: string;
  tone: 'emerald' | 'blue' | 'violet' | 'orange' | 'amber' | 'rose' | string;
  items?: Array<{ title: string; detail: string }>;
  progress?: number;
  critical?: boolean;
  trend?: number[];
}

export interface DashboardCockpit {
  version: 2;
  generatedAt: string;
  refreshIntervalMs: number;
  organizationName: string;
  primarySite: { id: string; name: string; address?: string | null } | null;
  weather: {
    status: 'ready' | 'needs_location' | 'unavailable';
    city?: string;
    temperature?: number;
    apparentTemperature?: number;
    weatherCode?: number;
    label?: string;
    cityImage?: string;
  };
  urgent: DashboardCockpitCard[];
  overview: DashboardCockpitCard[];
  activity: DashboardCockpitCard[];
  insights: DashboardCockpitCard[];
  news: {
    local: Array<{ title: string; url: string; source: string; publishedAt?: string }>;
    industry: Array<{ title: string; url: string; source: string; publishedAt?: string }>;
  };
}

export type HrCollaboratorStatus = 'ACTIVE' | 'ABSENT' | 'SUSPENDED' | 'DEPARTED';

export interface HrDepartment {
  id: string;
  name: string;
  description?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export interface HrPosition {
  id: string;
  name: string;
  description?: string | null;
  departmentId?: string | null;
  department?: HrDepartment | null;
  isArchived?: boolean;
  archivedAt?: string | null;
  taskPresets?: HrPositionTaskPreset[] | null;
}

export interface HrPositionTaskPreset {
  id: string;
  title: string;
  description?: string | null;
  category: OperationalTaskCategory;
  defaultDurationMinutes?: number | null;
  requiresTechnicalSheet?: boolean;
}

export interface HrHistoryEntry {
  id?: string;
  type: string;
  label?: string | null;
  description?: string | null;
  createdAt?: string | null;
  createdBy?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
}

export interface HrEmploymentContract {
  id: string;
  contractType: string;
  startDate: string;
  endDate?: string | null;
  weeklyHours?: number | null;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  status: string;
  notes?: string | null;
  createdAt?: string | null;
}

export interface HrEmployeeCompensation {
  id: string;
  hourlyRate: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

export interface HrSalaryReview {
  id: string;
  dueDate: string;
  frequencyMonths?: number | null;
  status: string;
  proposedHourlyRate?: number | null;
  notes?: string | null;
  completedAt?: string | null;
}

export interface HrDocument {
  id: string;
  category: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  notes?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface HrCollaborator {
  id: string;
  photoDataUrl?: string | null;
  photoUrl?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  primaryLanguage?: string | null;
  secondaryLanguage?: string | null;
  emergencyContact?: string | null;
  birthDate?: string | null;
  personalIdentityNumber?: string | null;
  hireDate: string;
  departmentId?: string | null;
  positionId?: string | null;
  mainSiteId?: string | null;
  siteId?: string | null;
  userId?: string | null;
  managerId?: string | null;
  employeeNumber?: string | null;
  notes?: string | null;
  status: HrCollaboratorStatus | string;
  isArchived?: boolean;
  archivedAt?: string | null;
  department?: HrDepartment | null;
  position?: HrPosition | null;
  secondaryPositionIds?: string[] | null;
  secondaryPositions?: HrPosition[] | null;
  mainSite?: Site | null;
  site?: Site | null;
  secondarySiteIds?: string[] | null;
  secondarySites?: Site[] | Array<{ siteId: string; site?: Site | null }> | null;
  user?: CoreUser | null;
  manager?: HrCollaborator | null;
  /** @deprecated Champs plats – utiliser activeContract */
  contractType?: string | null;
  /** @deprecated Champs plats – utiliser activeContract */
  contractEndDate?: string | null;
  /** @deprecated Champs plats – utiliser activeContract */
  trialEndDate?: string | null;
  /** @deprecated Champs plats – utiliser activeContract */
  contractWeeklyMinutes?: number | null;
  trainingNames?: string[] | null;
  /** @deprecated Champs plats – utiliser currentCompensation */
  hourlyRate?: number | null;
  /** @deprecated Champs plats – utiliser currentCompensation */
  currency?: string | null;
  /** @deprecated Champs plats – utiliser currentCompensation */
  rateEffectiveDate?: string | null;
  /** @deprecated Champs plats – utiliser nextSalaryReview */
  nextReviewDate?: string | null;
  /** @deprecated Champs plats – utiliser nextSalaryReview */
  reviewFrequency?: string | null;
  activeContract?: HrEmploymentContract | null;
  currentCompensation?: HrEmployeeCompensation | null;
  nextSalaryReview?: HrSalaryReview | null;
  contracts?: HrEmploymentContract[];
  compensations?: HrEmployeeCompensation[];
  salaryReviews?: HrSalaryReview[];
  documents?: HrDocument[];
  history?: HrHistoryEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface HrCollaboratorPayload {
  photoUrl?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  primaryLanguage?: string;
  secondaryLanguage?: string;
  emergencyContact?: string;
  birthDate?: string;
  personalIdentityNumber?: string;
  hireDate: string;
  departmentId: string;
  positionId: string;
  secondaryPositionIds?: string[];
  siteId?: string;
  secondarySiteIds?: string[];
  employeeNumber?: string;
  notes?: string;
  status?: string;
  userId?: string;
  managerId?: string;
  mainSiteId?: string;
  photoDataUrl?: string;
  contractType?: string;
  contractEndDate?: string;
  trialEndDate?: string;
  contractWeeklyMinutes?: number | null;
  trainingNames?: string[];
  hourlyRate?: number | null;
  currency?: string;
  rateEffectiveDate?: string;
  nextReviewDate?: string;
  reviewFrequency?: string;
}

export interface HrContractAnalysis {
  draft: Partial<HrCollaboratorPayload>;
  suggestions: {
    departmentName?: string;
    positionName?: string;
    siteName?: string;
  };
  confidence: number;
  hasContractSource: boolean;
  uncertainFields: string[];
  warnings: string[];
  fieldCount: number;
  documents: Array<{
    originalName: string;
    mimeType: string;
    pageCount?: number | null;
    durationMs: number;
    documentType: 'CONTRACT' | 'CV' | 'OTHER';
    category: string;
    confidence: number;
    uncertainFields: string[];
    warnings: string[];
  }>;
  source: {
    originalName: string;
    mimeType: string;
    pageCount?: number | null;
    durationMs: number;
    documentType?: 'CONTRACT' | 'CV' | 'OTHER';
    category?: string;
  };
}

export interface HrReferencePayload {
  name: string;
  description?: string;
  departmentId?: string | null;
  taskPresets?: HrPositionTaskPreset[];
}

export interface HrSummary {
  counts: {
    collaborators: number;
    departments: number;
    positions: number;
    linkedCollaborators: number;
  };
  latestCollaborators?: HrCollaborator[];
  departmentDistribution?: Array<{ department: string; count: number }>;
}

export interface HrOnboardingProgress {
  id: string;
  organizationId: string;
  status: string;
  servicesCompletedAt?: string | null;
  positionsCompletedAt?: string | null;
  employeesUnlockedAt?: string | null;
  firstEmployeeCreatedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type PlanningAlertLevel =
  | 'critique'
  | 'attention'
  | 'information'
  | 'critical'
  | 'warning'
  | 'info';

export interface PlanningAlert {
  id?: string;
  level: PlanningAlertLevel | string;
  title?: string;
  message?: string;
  label?: string;
  code?: string;
  details?: unknown;
  entityType?: string | null;
  entityId?: string | null;
  createdAt?: string | null;
}

export interface PlanningAssignment {
  id: string;
  collaboratorId?: string | null;
  employeeId?: string | null;
  departmentId?: string | null;
  serviceId?: string | null;
  positionId?: string | null;
  siteId?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  status?: string | null;
  origin?: string | null;
  comment?: string | null;
  businessStatus?: string | null;
  collaborator?: HrCollaborator | null;
  employee?: HrCollaborator | null;
  department?: HrDepartment | null;
  service?: HrDepartment | null;
  position?: HrPosition | null;
  site?: Site | null;
  conflicts?: PlanningAlert[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PlanningCrossSiteReplacement {
  assignmentId?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  date?: string | null;
  existingSiteId?: string | null;
  existingSiteName?: string | null;
  targetSiteId?: string | null;
  existingStartTime?: string | null;
  existingEndTime?: string | null;
  targetStartTime?: string | null;
  targetEndTime?: string | null;
}

export interface PlanningRequirement {
  id: string;
  date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  departmentId?: string | null;
  serviceId?: string | null;
  siteId?: string | null;
  positionId?: string | null;
  label?: string | null;
  season?: string | null;
  seasonLabel?: string | null;
  timeSlot?: string | null;
  timeSlotLabel?: string | null;
  alertImpact?: string | null;
  metadata?: Record<string, unknown> | null;
  startTime?: string | null;
  endTime?: string | null;
  requiredCount?: number | string | null;
  requiredSkills?: string[];
  priority?: string | null;
  comment?: string | null;
  department?: HrDepartment | null;
  service?: HrDepartment | null;
  position?: HrPosition | null;
  site?: Site | null;
}

export interface PlanningReplacementCandidate {
  collaboratorId?: string | null;
  employeeId?: string | null;
  collaborator?: HrCollaborator | null;
  employee?: HrCollaborator | null;
  score?: number;
  reasons?: string[];
}

export interface PlanningReplacementProposal {
  id: string;
  assignmentId?: string | null;
  absentCollaboratorId?: string | null;
  absentEmployeeId?: string | null;
  replacementCollaboratorId?: string | null;
  replacementEmployeeId?: string | null;
  status?: string | null;
  candidates?: PlanningReplacementCandidate[];
  rationale?: PlanningReplacementCandidate[];
  createdAt?: string | null;
}

export interface PlanningTemplate {
  id: string;
  name: string;
  description?: string | null;
  periodType?: string | null;
  templateType?: string | null;
  type?: string | null;
  source?: string | null;
  siteId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  paidBreak?: boolean | null;
  businessStatus?: string | null;
  employeeIds?: string[];
  defaultEmployeeIds?: string[];
  content?: Record<string, any>;
  days?: PlanningTemplateDay[];
  lines?: Array<
    Partial<PlanningAssignment> & { dayOfWeek?: number; requiredCount?: number; label?: string }
  >;
  createdAt?: string | null;
}

export interface PlanningTemplateDay {
  key?: string;
  dayOfWeek: number;
  mode: 'WORK' | 'REST' | string;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  departmentId?: string | null;
  positionId?: string | null;
  siteId?: string | null;
}

export interface PlanningDayPresetPayload {
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  departmentId?: string;
  positionId?: string;
  siteId?: string;
  breakMinutes?: number;
  paidBreak?: boolean;
  businessStatus?: string;
}

export interface PlanningWeeklyRotationPayload {
  name: string;
  description?: string;
  departmentId?: string;
  siteId?: string;
  days?: PlanningTemplateDay[] | Record<string, PlanningTemplateDay>;
}

export interface PlanningEmployeeTemplateAssignment {
  employeeId: string;
  dayPresetIds: string[];
  weeklyRotationIds: string[];
  defaultWeeklyRotationId?: string | null;
  persistence?: string;
}

export type PlanningPeriodStatusCode =
  | 'DRAFT'
  | 'CONTROLLED'
  | 'PUBLISHED'
  | 'MODIFIED_AFTER_PUBLICATION'
  | 'LOCKED';

export interface PlanningPeriodStatus {
  status: PlanningPeriodStatusCode | string;
  label: string;
  period: { startDate: string; endDate: string; siteId?: string | null; key?: string };
  lastControlledAt?: string | null;
  publishedAt?: string | null;
  lockedAt?: string | null;
  modifiedAfterPublicationAt?: string | null;
  blockingAlerts?: number;
  warningAlerts?: number;
  publishable?: boolean;
  locked?: boolean;
  modifiedAfterLock?: boolean;
  storage?: string;
  temporary?: boolean;
  latestEvent?: Record<string, any> | null;
}

export interface PlanningPeriodActionPayload {
  startDate: string;
  endDate: string;
  siteId?: string;
  force?: boolean;
  note?: string;
}

export interface PlanningPeriodActionResult {
  periodStatus: PlanningPeriodStatus;
  control?: Record<string, any>;
  publishable?: boolean;
  event?: Record<string, any>;
  placeholder?: boolean;
}

export interface PlanningDayStatus {
  id: string;
  employeeId: string;
  date: string;
  statusCode: string;
  label: string;
  sourceType?: string;
  sourceId?: string | null;
  dedupeKey?: string;
  affectsPlanning?: boolean;
  affectsCounters?: boolean;
  visibilityLevel?: string;
  metadata?: Record<string, any> | null;
}

export interface PlanningCodeDictionaryEntry {
  id: string;
  rawCode: string;
  normalizedCode: string;
  label: string;
  category: string;
  defaultStatusCode?: string | null;
  accountType?: string | null;
  unit?: 'MINUTES' | 'DAYS' | string | null;
  defaultQuantity?: number | null;
  affectsWorkedTime?: boolean;
  affectsPaidTime?: boolean;
  affectsLeaveBalance?: boolean;
  visibleInPlanning?: boolean;
  visibleInCounters?: boolean;
  requiresAdminValidation?: boolean;
  metadata?: Record<string, any> | null;
}

export interface PlanningPolicyProfile {
  id: string;
  name: string;
  description?: string | null;
  sector?: string | null;
  annualReferenceMinutes?: number | null;
  defaultWeeklyMinutes?: number | null;
  defaultDailyMinutes?: number | null;
  defaultBreakMinutes?: number | null;
  attendanceEnabled?: boolean;
  isDefault?: boolean;
  customRules?: Record<string, any> | null;
}

export interface PlanningCounterAccount {
  id: string;
  employeeId: string;
  periodYear: number;
  accountType: string;
  code: string;
  label: string;
  unit: 'MINUTES' | 'DAYS' | string;
  openingBalance: number;
  accrued: number;
  consumed: number;
  adjusted: number;
  closingBalance: number;
  visibleToEmployee?: boolean;
  visibleToManager?: boolean;
  visibleToAdmin?: boolean;
  transactions?: Array<Record<string, any>>;
}

export interface PlanningCounterAlert {
  type: string;
  employeeId?: string;
  accountType?: string;
  code?: string;
  balance?: number;
  message?: string;
}

export interface PlanningCounterTotals {
  leaveDays: number;
}

export interface PlanningCounterEmployeeSummary {
  employeeId: string;
  employeeName: string;
  period: { startDate: string; endDate: string };
  accounts: Array<{
    accountId: string;
    accountType: string;
    code: string;
    label: string;
    unit: 'MINUTES' | 'DAYS' | string;
    openingBalance: number;
    accrued: number;
    consumed: number;
    adjusted: number;
    closingBalance: number;
    visibleToEmployee: boolean;
    visibleToManager: boolean;
    visibleToAdmin: boolean;
  }>;
  totals: PlanningCounterTotals;
  alerts: PlanningCounterAlert[];
}

export interface PlanningCountersResponse {
  period: { startDate: string; endDate: string };
  employees: PlanningCounterEmployeeSummary[];
  accountCount: number;
  alerts: PlanningCounterAlert[];
}

export interface PlanningCountersSummary {
  enabled: boolean;
  periodYear: number;
  period?: { startDate: string; endDate: string };
  accountCount: number;
  transactionCount: number;
  neutralizedTransactionCount?: number;
  negativeBalanceCount: number;
  totals: Array<{
    code: string;
    accountType: string;
    label?: string;
    unit: 'MINUTES' | 'DAYS' | string;
    total: number;
  }>;
  employeePreview?: PlanningCounterEmployeeSummary[];
  hiddenEmployeeCount?: number;
  alerts?: PlanningCounterAlert[];
  storage?: string;
}

export interface PlanningAttendanceRow {
  id?: string | null;
  assignmentId?: string | null;
  employeeId: string;
  employeeName?: string;
  date: string;
  plannedStartTime?: string | null;
  plannedEndTime?: string | null;
  plannedMinutes: number;
  declaredStartTime?: string | null;
  declaredEndTime?: string | null;
  declaredMinutes?: number | null;
  validatedMinutes?: number | null;
  varianceMinutes?: number | null;
  status: string;
  statusLabel?: string;
  departmentName?: string | null;
  positionName?: string | null;
  siteName?: string | null;
  persistence?: boolean;
}

export interface PlanningAttendanceEmployeeSummary {
  employeeId: string;
  employeeName: string;
  plannedMinutes: number;
  declaredMinutes?: number | null;
  validatedMinutes?: number | null;
  varianceMinutes?: number | null;
  rowCount: number;
  signedCount: number;
  validatedCount: number;
  status: string;
}

export interface PlanningAttendanceResponse {
  persistence?: boolean;
  period: { startDate: string; endDate: string };
  rows: PlanningAttendanceRow[];
  employees: PlanningAttendanceEmployeeSummary[];
  totals: {
    plannedMinutes: number;
    declaredMinutes: number;
    validatedMinutes: number;
    rows: number;
  };
}

export interface PlanningHistoryEntry {
  id?: string;
  action: string;
  description?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdAt?: string | null;
  createdBy?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
}

export interface PlanningSummary {
  todayCollaborators?: number;
  absentCollaborators?: number;
  coveredServices?: number;
  understaffedServices?: number;
  replacementsNeeded?: number;
  weeklyPlannedHours?: number;
  plannedMinutes?: number;
  plannedHours?: number;
  estimatedCost?: number;
  activeAlerts?: number;
  priorityAlerts?: number;
  actionsToProcess?: number;
}

export interface PlanningBootstrap {
  meta?: Record<string, any>;
  summary?: PlanningSummary;
  stats?: Record<string, number>;
  collaborators?: HrCollaborator[];
  employees?: HrCollaborator[];
  departments?: HrDepartment[];
  services?: HrDepartment[];
  positions?: HrPosition[];
  rotations?: PlanningTemplate[];
  sites?: Site[];
  assignments?: PlanningAssignment[];
  absences?: Array<Record<string, any>>;
  requirements?: PlanningRequirement[];
  needs?: PlanningRequirement[];
  replacementProposals?: PlanningReplacementProposal[];
  replacements?: PlanningReplacementProposal[];
  templates?: PlanningTemplate[];
  templateApplications?: Array<Record<string, any>>;
  alerts?: PlanningAlert[];
  conflicts?: PlanningAlert[];
  history?: PlanningHistoryEntry[];
  historyHuman?: Array<Record<string, any>>;
  notifications?: PlanningAlert[];
  dashboard?: Record<string, any>;
  planning?: {
    month?: Record<string, any>;
    assignmentsByDate?: Record<string, PlanningAssignment[]>;
    periodStatus?: PlanningPeriodStatus;
  };
  settings?: Record<string, any>;
  attendance?: PlanningAttendanceResponse | Record<string, any>;
  periodStatus?: PlanningPeriodStatus;
  dayStatusSummary?: Record<string, any> | null;
  countersSummary?: PlanningCountersSummary | null;
}

export interface PlanningDashboardResponse {
  stats?: PlanningSummary;
  dashboard?: Record<string, any> & {
    summary?: PlanningSummary;
    hoursByDepartment?: Array<Record<string, any>>;
    actions?: Array<Record<string, any>>;
    alerts?: PlanningAlert[];
  };
  alerts?: PlanningAlert[];
  coverage?: Array<Record<string, any>>;
}

export interface PlanningGenerationResult {
  assignments?: PlanningAssignment[];
  alerts?: PlanningAlert[];
  preview?: {
    assignments?: PlanningAssignment[];
    alerts?: PlanningAlert[];
    summary?: Record<string, number>;
    deterministicRules?: string[];
  };
  previewId?: string;
  deterministicSeed?: string;
}

export interface RnmProduct {
  id: string;
  code?: string | null;
  name: string;
  category?: string | null;
  sector?: string | null;
  latestQuotationDate?: string | null;
  lastQuotationDate?: string | null;
  averagePrice?: number | null;
  variation?: number | null;
  unit?: string | null;
  market?: string | null;
}

export interface RnmQuote {
  date?: string | null;
  productId?: string | null;
  productName?: string | null;
  variety?: string | null;
  market?: string | null;
  marketCode?: string | null;
  stage?: string | null;
  averagePrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  variation?: number | null;
  unit?: string | null;
}

export interface RnmProductDetail extends RnmProduct {
  varietiesCount?: number | null;
  quotes?: RnmQuote[];
  quotations?: RnmQuote[];
}

export interface RnmProductsResponse {
  items: RnmProduct[];
  page?: number;
  pageSize?: number;
  total?: number;
  pages?: number;
  categories?: string[];
  sectors?: string[];
  filters?: { categories?: string[]; sectors?: string[] };
  stats?: {
    products?: number;
    sectors?: number;
    markets?: number;
    lastQuotationDate?: string | null;
  };
}

export interface RnmHistoryPoint extends RnmQuote {
  price?: number | null;
}

export interface RnmHistoryResponse {
  items: RnmHistoryPoint[];
  page?: number;
  pageSize?: number;
  total?: number;
  pages?: number;
}

export interface RnmFavorite {
  id?: string;
  productId?: string;
  rnmProductId?: string;
  productName: string;
  category?: string | null;
  sector?: string | null;
  createdAt?: string;
}

export type ArchitectureAlertLevel = 'information' | 'attention' | 'critique';

export interface ArchitectureField {
  name: string;
  type: string;
  required?: boolean;
  isRequired?: boolean;
  optional?: boolean;
  isList?: boolean;
  isId?: boolean;
  isUnique?: boolean;
  isRelation?: boolean;
  attributes?: string[];
}

export interface ArchitectureRelation {
  fromModel?: string;
  fromTable?: string;
  toModel?: string;
  toTable?: string;
  field?: string;
  foreignKeys?: string[];
  kind?: 'relation' | 'ownership' | 'consumption' | 'dependency';
  onDelete?: string;
  source?: string;
  target?: string;
  from?: string;
  to?: string;
  sourceTable?: string;
  targetTable?: string;
  model?: string;
  relatedModel?: string;
  type?: string;
}

export interface ArchitecturePrismaModel {
  name: string;
  table?: string;
  dbName?: string;
  ownerModule?: string;
  description?: string;
  fields?: ArchitectureField[];
  relations?: ArchitectureRelation[];
  foreignKeys?: string[];
  indexes?: string[];
  uniqueConstraints?: string[];
}

export interface ArchitectureModule {
  id: string;
  name: string;
  status: 'actif' | 'installé' | 'indisponible' | string;
  description: string;
  ownedTables?: string[];
  consumedTables?: string[];
  ownedData?: string[];
  consumedData?: string[];
  consumerModules: string[];
  dependencies: string[];
}

export interface ArchitectureTableMap {
  table: string;
  name?: string;
  model?: string;
  owner?: string;
  ownerModule: string;
  consumers?: string[];
  consumerModules: string[];
  description: string;
  confidence: 'élevé' | 'moyen' | 'faible' | string;
  origin?: string;
  source?: string;
}

export interface ArchitectureDuplicateAlert {
  level: ArchitectureAlertLevel;
  source: string;
  target: string;
  message: string;
  signals?: string[];
  title?: string;
  description?: string;
  tables?: string[];
}

export interface ArchitectureImpact {
  moduleId: string;
  moduleName?: string;
  module?: string;
  ownedTables: string[];
  usedTables: string[];
  dependentModules: string[];
  impactedModules: string[];
  deactivationRisks?: string[];
  risks?: string[];
  criticalDependencies: string[];
}

export interface ArchitectureDocumentationPage {
  id?: string;
  title: string;
  body?: string[];
  content?: string;
}

export interface ArchitectureAnalysis {
  generatedAt?: string;
  summary: {
    modules: number;
    tables: number;
    relations: number;
    users: number;
    organizations: number;
    products: number;
    suppliers: number;
  };
  modules: ArchitectureModule[];
  dataMap: ArchitectureTableMap[];
  relations: ArchitectureRelation[] | { edges: ArchitectureRelation[] };
  schema?: ArchitecturePrismaModel[];
  prismaModels?: ArchitecturePrismaModel[];
  duplicateAlerts: ArchitectureDuplicateAlert[];
  duplicates?: ArchitectureDuplicateAlert[];
  impacts?: ArchitectureImpact[];
  impact?: ArchitectureImpact[];
  graph?: {
    nodes: Array<{
      id: string;
      label: string;
      type: 'system' | 'module' | 'table' | 'entity';
      module?: string;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: 'ownership' | 'consumption' | 'relation' | 'dependency';
      label: string;
    }>;
  };
  roadmap: Array<{
    module: string;
    status: string;
    active?: boolean;
    note?: string;
    description?: string;
  }>;
  documentation: ArchitectureDocumentationPage[];
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  kind?: 'UNSPECIFIED' | 'EQUIPMENT' | string;
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

export type EquipmentAcquisitionMode = 'CASH' | 'CREDIT' | 'LEASING' | 'RENTAL';
export type EquipmentCondition = 'IN_SERVICE' | 'TO_MONITOR' | 'OUT_OF_SERVICE';

export interface EquipmentProfile {
  id?: string;
  brand?: string | null;
  model?: string | null;
  purchaseUrl?: string | null;
  purchasedAt?: string | null;
  warrantyEndsAt?: string | null;
  condition?: EquipmentCondition;
  targetQuantity?: string | number | null;
  acquisitionMode?: EquipmentAcquisitionMode;
  financingProvider?: string | null;
  financingStart?: string | null;
  financingEnd?: string | null;
  monthlyPayment?: string | number | null;
  financedAmount?: string | number | null;
  buyoutValue?: string | number | null;
  notes?: string | null;
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
  averagePrice?: string | number | null;
  priceDisplayUnit?: string | null;
  averagePurchasePrice?: string | number | null;
  weightedAveragePrice?: string | number | null;
  minimumStock?: string | number | null;
  minStock?: string | number | null;
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
  kind?: 'UNSPECIFIED' | 'RAW_MATERIAL' | 'INTERMEDIATE' | 'FINISHED' | 'PACKAGED' | string;
  stockQuantity?: number;
  orderCount?: number;
  lastOrderedAt?: string | null;
  archivedAt?: string | null;
  isArchived?: boolean;
  category?: Category | null;
  unit?: Unit;
  supplier?: Supplier | null;
  primarySupplier?: Supplier | null;
  equipmentProfile?: EquipmentProfile | null;
}

export interface ProductLabelOcrResult {
  productId: string;
  filename: string;
  mimeType: string;
  pageCount?: number | null;
  ingredients?: string | null;
  nutrition: {
    energyKj: number | null;
    energyKcal: number | null;
    fatGrams: number | null;
    saturatedFatGrams: number | null;
    carbohydratesGrams: number | null;
    sugarsGrams: number | null;
    fiberGrams: number | null;
    proteinGrams: number | null;
    saltGrams: number | null;
  };
  allergensPresent: string[];
  possibleTraces: string[];
  confidence?: number | null;
  warnings: string[];
}

export interface ProductLabelOcrDocumentStatus {
  document: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  state: 'en attente' | 'analyse' | 'vérifier' | 'erreur';
  progress: number;
  result?: ProductLabelOcrResult | null;
  errorMessage?: string | null;
}

export interface ProductLabelOcrBatchStatus {
  batchId: string;
  product: { id: string; name: string };
  state: 'en attente' | 'analyse' | 'vérifier' | 'erreur';
  progress: number;
  documents: ProductLabelOcrDocumentStatus[];
  results: ProductLabelOcrResult[];
  errors: number;
}

export type ProductImportStatus = 'ready' | 'needs_review' | 'duplicate' | 'ignored' | 'error';

export type ProductImportField =
  | 'name'
  | 'unit'
  | 'sku'
  | 'gtin'
  | 'supplier'
  | 'category'
  | 'averagePrice'
  | 'minimumStock'
  | 'description'
  | 'originCountry'
  | 'packageLabel'
  | 'unitsPerPackage'
  | 'unitWeightGrams'
  | 'netWeightGrams'
  | 'ingredients'
  | 'allergensPresent'
  | 'possibleTraces'
  | 'dietaryTags'
  | 'energyKj'
  | 'energyKcal'
  | 'fatGrams'
  | 'saturatedFatGrams'
  | 'carbohydratesGrams'
  | 'sugarsGrams'
  | 'fiberGrams'
  | 'proteinGrams'
  | 'saltGrams'
  | 'storageType'
  | 'shelfLifeAfterOpening'
  | 'storageInstructions'
  | 'preparationInstructions';

export interface ProductImportPreviewFields extends Partial<
  Record<ProductImportField, string | number | string[] | null>
> {
  existingProductId?: string | null;
  unitId?: string | null;
  unitLabel?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  primarySupplierId?: string | null;
  supplierName?: string | null;
}

export interface ProductImportPreviewRow {
  rowNumber: number;
  source: Record<string, string>;
  fields: ProductImportPreviewFields;
  status: ProductImportStatus;
  selected: boolean;
  warnings: string[];
  errors: string[];
  duplicateOf?: {
    type: 'existing' | 'file';
    field: 'sku' | 'gtin' | 'name';
    value: string;
    label: string;
  } | null;
}

export interface ProductImportPreview {
  filename: string;
  headers: string[];
  delimiter: string;
  sourceKind?: 'csv' | 'xlsx' | 'supplier_purchase_history';
  sourceSheet?: string;
  headerRowNumber?: number;
  processingNotes?: string[];
  mapping: Record<string, ProductImportField>;
  localMapping?: Record<string, ProductImportField>;
  templateColumns: string[];
  rows: ProductImportPreviewRow[];
  summary: Record<ProductImportStatus | 'total' | 'selected', number>;
  options: {
    createMissingCategories: boolean;
    createMissingSuppliers: boolean;
    defaultSupplierId?: string;
    defaultSupplierName?: string;
    siteIds?: string[];
  };
  ai?: {
    status: string;
    provider?: string | null;
    model?: string | null;
    warnings?: string[];
    mapping?: Record<string, ProductImportField> | null;
  };
}

export interface ProductImportCommitResult {
  created: number;
  assignedExisting?: number;
  assignmentsCreated?: number;
  siteIds?: string[];
  skipped: number;
  skippedRows?: Array<{ rowNumber: number; reason: string }>;
  products: Product[];
}

export interface TechnicalSheetCategory {
  id: string;
  name: string;
  description?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TechnicalSheetAllergen {
  id: string;
  name: string;
  icon?: string | null;
  code?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export type TechnicalSheetRecipeStatus = 'DRAFT' | 'ACTIVE' | string;

export interface TechnicalSheetIngredientLine {
  id?: string;
  recipeId?: string;
  productId: string;
  product?: Product | null;
  sourceTechnicalSheetId?: string | null;
  sourceTechnicalSheet?: TechnicalSheetRecipe | null;
  unitId: string;
  unit?: Unit | null;
  quantity: number | string;
  comment?: string | null;
  section?: string | null;
  allergens?: TechnicalSheetAllergen[];
  cost?: number | string | null;
  costTotal?: number | string | null;
  unitPriceSnapshot?: number | string | null;
  stockUnitPrice?: number | string | null;
  stockUnitSymbol?: string | null;
  isCalculable?: boolean;
  nonCalculableReason?: string | null;
}

export interface TechnicalSheetStep {
  id?: string;
  order: number;
  title?: string | null;
  description?: string | null;
  section?: string | null;
  estimatedTimeMinutes?: number | string | null;
}

export interface TechnicalSheetRecipe {
  id: string;
  name: string;
  restoredFromArchive?: boolean;
  description?: string | null;
  categoryId?: string | null;
  category?: TechnicalSheetCategory | null;
  photoUrl?: string | null;
  photoDataUrl?: string | null;
  mode?: 'ASSEMBLY' | 'PRODUCTION';
  stockPolicy?: 'MAKE_TO_ORDER' | 'MAKE_TO_STOCK';
  trackOutputStock?: boolean;
  outputProductId?: string | null;
  outputProduct?: Product | null;
  yieldUnitId?: string | null;
  yieldUnit?: Unit | null;
  yieldMode?: 'PORTIONS' | 'MASS';
  productionProfiles?: ProductionProfile[];
  referencePortions?: number | string | null;
  totalMassGrams?: number | string | null;
  portions?: number | string | null;
  prepTimeMinutes?: number | string | null;
  cookTimeMinutes?: number | string | null;
  totalTimeMinutes?: number | string | null;
  status: TechnicalSheetRecipeStatus;
  ingredients?: TechnicalSheetIngredientLine[];
  steps?: TechnicalSheetStep[];
  allergens?: TechnicalSheetAllergen[];
  costTotal?: number | string | null;
  totalCost?: number | string | null;
  costPerPortion?: number | string | null;
  costPerKg?: number | string | null;
  costPerLiter?: number | string | null;
  targetSellingPriceHtPerPortion?: number | string | null;
  targetSellingPriceExclTax?: number | string | null;
  targetSellingPriceInclTax?: number | string | null;
  grossMarginAmount?: number | string | null;
  grossMarginRate?: number | string | null;
  salesTaxRate?: number | null;
  regulatoryCountryCode?: RegulatoryCountryCode | null;
  lastCostCalculationAt?: string | null;
  hasNonCalculableLines?: boolean;
  nonCalculableLinesCount?: number;
  duplicatedFromId?: string | null;
  author?: {
    id?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  createdBy?: {
    id?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export interface TechnicalSheetRecipePayload {
  importDocumentId?: string;
  name: string;
  description?: string;
  categoryId?: string;
  photoUrl?: string;
  photoDataUrl?: string;
  mode?: 'ASSEMBLY' | 'PRODUCTION';
  stockPolicy?: 'MAKE_TO_ORDER' | 'MAKE_TO_STOCK';
  trackOutputStock?: boolean;
  outputProductId?: string;
  createOutputProduct?: boolean;
  outputProductName?: string;
  outputProductKind?: 'INTERMEDIATE' | 'FINISHED';
  yieldUnitId?: string;
  yieldMode?: 'PORTIONS' | 'MASS';
  referencePortions: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  status?: TechnicalSheetRecipeStatus;
  ingredients?: Array<{
    id?: string;
    productId?: string;
    productName?: string;
    productSku?: string;
    productGtin?: string;
    createProduct?: boolean;
    componentType?: 'PRODUCT' | 'SUB_RECIPE';
    sourceTechnicalSheetId?: string;
    quantity: number;
    unitId: string;
    comment?: string;
    section?: string;
    order?: number;
  }>;
  steps?: Array<{
    id?: string;
    order: number;
    title?: string;
    description?: string;
    section?: string;
    estimatedTimeMinutes?: number;
  }>;
}

export interface TechnicalSheetRecipeImportResult {
  filename: string;
  pageCount?: number | null;
  matchedIngredientsCount: number;
  newProductsCount: number;
  skippedIngredientsCount: number;
  warnings: string[];
  payload: TechnicalSheetRecipePayload;
}

export interface TechnicalSheetRecipeImportStatus {
  document: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    createdAt?: string;
    updatedAt?: string;
  };
  state: 'en attente' | 'analyse' | 'vérifier' | 'erreur' | string;
  progress: number;
  result?: TechnicalSheetRecipeImportResult | null;
  errorMessage?: string | null;
}

export interface TechnicalSheetRecipesResponse {
  items: TechnicalSheetRecipe[];
  total?: number;
  page?: number;
  pageSize?: number;
  salesTaxPolicy?: TechnicalSheetSalesTaxPolicy;
}

export interface TechnicalSheetSalesTaxPolicy {
  countryCode: RegulatoryCountryCode | string | null;
  countryLabel: string | null;
  rate: number | null;
  configured: boolean;
  scopeLabel: string;
  effectiveFrom: string | null;
}

export interface TechnicalSheetOnboarding {
  categoryCount: number;
  recipeCount: number;
  completed: boolean;
  nextStep: 'categories' | 'recipe';
  suggestedCategories: string[];
  selectedCategoryNames: string[];
}

export interface TechnicalSheetDashboard {
  recipeCount: number;
  categoryCount: number;
  averageMaterialCost?: number;
  usedStockProductsCount?: number;
  latestRecipes?: TechnicalSheetRecipe[];
  topProducts?: Array<{ productId: string; name: string; count: number }>;
  lastModifiedAt?: string | null;
}

export interface TechnicalSheetHistoryEntry {
  id: string;
  action: string;
  summary?: string | null;
  createdAt?: string;
  user?: {
    id?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export interface TechnicalSheetSimulationLine {
  productId: string;
  productName: string;
  quantity: number | string;
  unitId?: string;
  unitSymbol?: string;
  estimatedCost?: number | string | null;
  isCalculable?: boolean;
  nonCalculableReason?: string | null;
}

export interface TechnicalSheetSimulation {
  id?: string;
  recipeId: string;
  recipe?: TechnicalSheetRecipe | null;
  requestedPortions: number | string;
  lines: TechnicalSheetSimulationLine[];
  estimatedCost?: number | string | null;
  allergens?: TechnicalSheetAllergen[];
  simulatedAt?: string;
}

export interface TechnicalSheetSimulationPayload {
  recipeId: string;
  requestedPortions: number;
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
  productCount?: number;
  purchasingProfile?: SupplierPurchasingProfile | null;
}

export type PurchasingDeliveryMode = 'SCHEDULED_DAYS' | 'ON_DEMAND' | 'NO_DELIVERY';

export interface SupplierPurchasingProfile {
  id?: string;
  orderEmail?: string | null;
  customerCode?: string | null;
  deliveryMode: PurchasingDeliveryMode;
  deliveryWeekdays: number[];
  cutoffTime?: string | null;
  minimumOrder: number | string;
  deliveryFee: number | string;
  timezone: string;
  leadTimeDays: number;
  orderingEnabled?: boolean;
  emailSubjectTemplate?: string | null;
  emailBodyTemplate?: string | null;
  emailSignature?: string | null;
}

export interface SupplierPurchasingPayload {
  orderEmail?: string;
  customerCode?: string;
  deliveryMode: PurchasingDeliveryMode;
  deliveryWeekdays: number[];
  cutoffTime?: string;
  minimumOrder: number;
  deliveryFee: number;
  timezone?: string;
  leadTimeDays?: number;
  orderingEnabled?: boolean;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

export type PurchaseReceiptStatus = 'DRAFT' | 'REVIEW_NEEDED' | 'VALIDATED' | 'CANCELLED';
export type PurchaseReceiptLineStatus =
  | 'MATCHED'
  | 'SHORT'
  | 'OVER'
  | 'UNEXPECTED'
  | 'SUBSTITUTED'
  | 'NEEDS_REVIEW';

export interface PurchaseOrderLine {
  id: string;
  offerId?: string | null;
  productId: string;
  unitId?: string | null;
  productNameSnapshot: string;
  supplierReferenceSnapshot?: string | null;
  supplierLabelSnapshot?: string | null;
  unitSymbolSnapshot?: string | null;
  orderedQuantity: number;
  unitsPerOrderUnit: number;
  expectedStockQuantity: number;
  receivedQuantity: number;
  unitPrice: number;
  vatRate: number;
  lineExcludingTax: number;
  lineTax: number;
  lineIncludingTax: number;
  product?: Product;
}

export interface PurchaseOrderLinePayload {
  productId: string;
  unitId?: string;
  supplierReference?: string;
  supplierLabel?: string;
  quantity: number;
  unitsPerOrderUnit?: number;
  unitPrice?: number;
  vatRate?: number;
}

export interface PurchaseOrderPayload {
  supplierId: string;
  siteId: string;
  currency?: string;
  expectedDeliveryDate?: string;
  notes?: string;
  supplierMessage?: string;
  expectedVersion?: number;
  lines: PurchaseOrderLinePayload[];
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  siteId: string;
  status: PurchaseOrderStatus;
  currency: string;
  expectedDeliveryDate?: string | null;
  supplierNameSnapshot: string;
  supplierEmailSnapshot?: string | null;
  customerCodeSnapshot?: string | null;
  deliveryAddressSnapshot?: string | null;
  deliveryFeeSnapshot: number;
  totalExcludingTax: number;
  totalTax: number;
  totalIncludingTax: number;
  notes?: string | null;
  supplierMessage?: string | null;
  version: number;
  createdById: string;
  sentAt?: string | null;
  acknowledgedAt?: string | null;
  receivedAt?: string | null;
  closedAt?: string | null;
  cancelledAt?: string | null;
  closeReason?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  site?: Site;
  lines?: PurchaseOrderLine[];
  lineCount?: number;
  receipts?: PurchaseReceipt[];
  dispatches?: Array<{
    id: string;
    status: string;
    recipient: string;
    subject?: string;
    provider?: 'RESEND' | 'SMTP' | 'GOOGLE' | 'MICROSOFT' | null;
    senderEmail?: string | null;
    senderName?: string | null;
    attemptedAt?: string | null;
    errorMessage?: string | null;
    providerMessageId?: string | null;
    sentAt?: string | null;
    createdAt: string;
  }>;
  events?: PurchaseOrderEvent[];
}

export interface PurchaseReceiptLine {
  id: string;
  purchaseOrderLineId?: string | null;
  productId?: string | null;
  unitId?: string | null;
  reference?: string | null;
  label: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  unitsPerOrderUnit: number;
  unitPrice?: number | null;
  status: PurchaseReceiptLineStatus;
  notes?: string | null;
  product?: Product | null;
  orderLine?: PurchaseOrderLine | null;
}

export interface PurchaseReceiptLinePayload {
  purchaseOrderLineId?: string;
  productId?: string;
  unitId?: string;
  reference?: string;
  label: string;
  deliveredQuantity: number;
  acceptedQuantity: number;
  unitsPerOrderUnit?: number;
  unitPrice?: number;
  status?: PurchaseReceiptLineStatus;
  notes?: string;
}

export interface PurchaseReceiptPayload {
  siteId: string;
  locationId?: string;
  deliveryNoteDocumentId?: string;
  extractionId?: string;
  deliveryNoteNumber?: string;
  deliveryDate?: string;
  notes?: string;
  lines: PurchaseReceiptLinePayload[];
}

export interface PurchaseReceipt {
  id: string;
  orderId: string;
  status: PurchaseReceiptStatus;
  siteId: string;
  locationId?: string | null;
  deliveryNoteDocumentId?: string | null;
  extractionId?: string | null;
  deliveryNoteNumber?: string | null;
  deliveryDate?: string | null;
  notes?: string | null;
  validatedAt?: string | null;
  createdAt: string;
  lines?: PurchaseReceiptLine[];
  anomalyCount?: number;
  order?: PurchaseOrder;
  site?: Site;
  location?: Location | null;
  stockReception?: StockReception | null;
}

export interface PurchaseOrderEvent {
  id: string;
  type: string;
  summary: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  order?: Pick<PurchaseOrder, 'id' | 'number' | 'supplierNameSnapshot'>;
  actor?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
}

export interface PurchasingBootstrap {
  installed: boolean;
  organizationId: string;
  settings: {
    defaultCurrency: string;
    replenishmentDays: number;
    consumptionWindowDays: number;
    fromEmail?: string | null;
    fromName?: string | null;
    replyTo?: string | null;
    resendApiKeyConfigured: boolean;
    resendVerifiedAt?: string | null;
    resendLastTestEmailId?: string | null;
    activeEmailProvider?: 'RESEND' | 'SMTP' | 'GOOGLE' | 'MICROSOFT' | null;
    emailSubjectTemplate?: string | null;
    emailBodyTemplate?: string | null;
    emailSignature?: string | null;
  };
  onboarding: {
    currentStep: string;
    completedSteps: string[];
    skippedEmailSetup: boolean;
    completedAt?: string | null;
  };
  suppliers: Supplier[];
  products: Array<Product & { stockQuantity?: number }>;
  units: Unit[];
  sites: Site[];
  locations: Location[];
  permissions: string[];
}

export type FinanceProvider = 'FENNOA' | 'FLATPAY' | 'PAYPAL_POS' | 'LOYVERSE' | 'GENERIC';
export type FinanceSourceStatus = 'NOT_CONNECTED' | 'READY' | 'ATTENTION' | 'ERROR';
export type FinanceImportStatus = 'UPLOADED' | 'NEEDS_REVIEW' | 'READY' | 'FAILED';
export type FinanceReportKind =
  | 'SALES_ORDERS'
  | 'PRODUCT_SALES'
  | 'DAILY_CLOSURE'
  | 'RECEIPTS'
  | 'ACCOUNTING'
  | 'BUDGET'
  | 'UNKNOWN';

export interface FinanceMetric {
  id: string;
  label: string;
  value: number | null;
  unit: 'currency' | 'percentage' | string;
  status: 'ready' | 'provisional' | 'unavailable';
  source: string | null;
  asOf: string | null;
  coverage: number | null;
  reason?: string | null;
}

export interface FinanceDashboardMetric {
  id: string;
  label: string;
  value: number | null;
  unit: 'currency' | 'percentage' | 'number';
  budget: number | null;
  variance: number | null;
  variancePercent: number | null;
  previous: number | null;
  favorable: boolean | null;
  status: 'ready' | 'provisional' | 'unavailable';
  help: string;
  actualValue?: number | null;
  actualLabel?: string;
  targetLabel?: string;
  displayable: boolean;
  availabilityReason?: string | null;
}

export interface FinanceDashboardPeriod {
  kind: 'annual' | 'monthly' | 'daily';
  label: string;
  from: string;
  to: string;
  status: 'ready' | 'provisional';
  core: FinanceDashboardMetric[];
  optional: FinanceDashboardMetric[];
  series: Array<{
    periodStart?: string;
    date?: string;
    label?: string;
    actualRevenue?: number | null;
    budgetRevenue?: number | null;
    actualResult?: number | null;
    budgetResult?: number | null;
    budgetBreakEven?: number | null;
    cumulativeActualRevenue?: number;
    cumulativeBudgetRevenue?: number;
    revenue?: number;
    transactions?: number;
  }>;
  comparison: {
    modeLabel: string;
    periods: Array<{
      id: string;
      label: string;
      detail: string;
      from: string;
      to: string;
      isCurrent: boolean;
      basis: 'cash_register' | 'accounting' | 'mixed' | 'unavailable';
      sources: Record<
        | 'revenue'
        | 'operating_expenses'
        | 'payroll'
        | 'operating_result'
        | 'transactions'
        | 'average_ticket'
        | 'contribution_margin'
        | 'contribution_margin_rate',
        'cash_register' | 'accounting' | 'mixed' | 'unavailable'
      >;
      metrics: {
        revenue: number | null;
        operating_expenses: number | null;
        payroll: number | null;
        operating_result: number | null;
        transactions: number | null;
        average_ticket: number | null;
        contribution_margin: number | null;
        contribution_margin_rate: number | null;
      };
    }>;
  };
}

export interface FinanceRevenueReconciliation {
  cashRegisterRevenue: number | null;
  accountingRevenue: number | null;
  difference: number | null;
  selectedRevenue: number | null;
  basis: 'cash_register' | 'accounting' | 'mixed' | 'unavailable';
  status: 'matched' | 'attention' | 'partial';
}

export interface FinanceDataSource {
  id: string;
  siteId?: string | null;
  provider: FinanceProvider;
  name: string;
  externalLocationId?: string | null;
  sourceType: 'ACCOUNTING_API' | 'POS_API' | 'FILE_IMPORT';
  status: FinanceSourceStatus;
  isPrimarySales: boolean;
  isPrimaryPos: boolean;
  lastSyncedAt?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  site?: { id: string; name: string } | null;
}

export interface FinancePosApiConfiguration {
  id?: string | null;
  provider: 'LOYVERSE' | 'PAYPAL_POS';
  configured: boolean;
  authMode: 'PERSONAL_TOKEN' | 'ASSERTION_GRANT';
  clientId?: string | null;
  secretMask?: string | null;
  apiBaseUrl: string;
  historyStart?: string | null;
  schedule: string[];
  configuredAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  defaultSite?: { id: string; name: string } | null;
  runtime: 'TOQUEHUB_LOCAL_API';
  connections?: FinancePosApiConfiguration[];
}

export interface FinanceFlatpayConfiguration {
  id?: string | null;
  portalUrl: string;
  username?: string | null;
  configured: boolean;
  credentialStorage?: string | null;
  passwordMask?: string | null;
  configuredAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  automationInstalledAt?: string | null;
  automationInbox?: string | null;
  automationSchedule?: string[];
  historyStart?: string | null;
  defaultSite?: { id: string; name: string } | null;
  automationRuntime?: 'TOQUEHUB_LOCAL_AGENT';
  platform?: 'darwin' | 'win32' | 'linux' | string;
  requiredReports?: Array<'orders' | 'sales-overview'>;
  connections?: FinanceFlatpayConfiguration[];
}

export interface FinanceImportBatch {
  id: string;
  sourceId?: string | null;
  fileName: string;
  fileSize: number;
  status: FinanceImportStatus;
  provider: FinanceProvider;
  reportKind: FinanceReportKind;
  periodStart?: string | null;
  periodEnd?: string | null;
  rowCount?: number | null;
  duplicateCount: number;
  warnings: string[];
  createdAt: string;
  source?: { id: string; name: string } | null;
}

export interface FinanceBootstrap {
  installed: boolean;
  organizationId: string;
  permissions: string[];
  settings: {
    defaultCurrency: string;
    fiscalYearStartMonth: number;
    timezone: string;
    fennoa: {
      baseUrl: string;
      apiVersion: string;
      username?: string | null;
      apiKeyConfigured: boolean;
      apiKeyMask?: string | null;
      apiKeyUpdatedAt?: string | null;
      lastTestedAt?: string | null;
      lastError?: string | null;
    } | null;
    flatpay: FinanceFlatpayConfiguration | null;
    pos: {
      loyverse: FinancePosApiConfiguration;
      paypalPos: FinancePosApiConfiguration;
    };
  };
  period: {
    preset: string;
    label: string;
    from: string | null;
    to: string | null;
  };
  metrics: FinanceMetric[];
  analysis: {
    sales: {
      net: number;
      gross: number;
      vat: number;
      transactions: number;
      averageTicket: number | null;
    };
    profitability: {
      revenue: number;
      materialPurchases: number;
      payroll: number;
      otherExpenses: number;
      operatingResult: number | null;
      payrollRatio: number | null;
      purchaseRatio: number | null;
    };
    budget: {
      revenue: number | null;
      expenses: number | null;
      revenueVariance: number | null;
    };
    series: Array<{ date: string; revenue: number; result: number }>;
  };
  dashboard: {
    context: {
      asOf: string;
      fiscalStart: string;
      fiscalEnd: string;
      elapsedMonths: number;
      totalMonths: number;
      periodProgress: number;
      actualCoverageLabel: string;
      dataCoverageStart: string | null;
      coverageComplete: boolean;
      budgetCoverageLabel: string;
    };
    health: {
      level: 'good' | 'attention' | 'critical' | 'unknown';
      label: string;
      summary: string;
    };
    reconciliation: {
      lockedThrough: string | null;
      annual: FinanceRevenueReconciliation;
      monthly: FinanceRevenueReconciliation;
      daily: FinanceRevenueReconciliation;
    };
    annual: FinanceDashboardPeriod;
    monthly: FinanceDashboardPeriod;
    daily: FinanceDashboardPeriod;
    budget: null | {
      id: string;
      name: string;
      scenario?: string | null;
      currency: string;
      startDate: string;
      endDate: string;
      isReference: boolean;
      totals: Record<string, number | null>;
      targets?: {
        periodStart: string;
        label: string;
        days: number;
        revenueMonth: number | null;
        revenueWeek: number | null;
        revenueDay: number | null;
        breakEvenMonth: number | null;
        breakEvenWeek: number | null;
        breakEvenDay: number | null;
        operatingResult: number | null;
        pointMortDay: number | null;
        pointMortDate: string | null;
      };
      series: FinanceDashboardPeriod['series'];
    };
    preferences: {
      selected: string[];
      available: Array<{ id: string; label: string; unit: string; help: string }>;
    };
    mistral: { configured: boolean };
  };
  scope: {
    mode: 'consolidated' | 'site';
    site: { id: string; name: string } | null;
    accountingAllocated: boolean;
    note: string;
  };
  sources: FinanceDataSource[];
  sites: Array<{ id: string; name: string }>;
  imports: FinanceImportBatch[];
  quality: {
    level: 'empty' | 'partial' | 'ready';
    label: string;
    connectedSourceCount: number;
    sourceCount: number;
    pendingReviewCount: number;
    lastUpdatedAt: string | null;
  };
}

export interface FinanceAiAnalysis {
  status: 'favorable' | 'attention' | 'critical' | 'insufficient_data';
  summary: string;
  strengths: string[];
  risks: string[];
  actions: Array<{ priority: 'P1' | 'P2' | 'P3'; title: string; detail: string }>;
  dataLimits: string[];
}

export interface FinanceSalesInsights {
  period: { from: string; to: string; days: number; timeZone: string };
  scope?: { siteId: string | null };
  summary: {
    revenue: number;
    netRevenue: number;
    transactions: number;
    averageTicket: number | null;
    refunds: number;
    discounts: number;
    cancellations: number;
    productCount: number;
    categoryCount: number;
    peakHour: FinanceSalesHour | null;
    peakWeekday: FinanceSalesWeekday | null;
  };
  comparisons: {
    previousPeriod: FinanceSalesComparison;
    previousYear: FinanceSalesComparison;
  };
  hourly: FinanceSalesHour[];
  weekdays: FinanceSalesWeekday[];
  daily: Array<{ date: string; revenue: number; transactions: number }>;
  products: FinanceSalesProduct[];
  topProducts: FinanceSalesProduct[];
  lowProducts: FinanceSalesProduct[];
  categories: Array<{
    category: string;
    quantity: number;
    gross: number;
    net: number;
    sharePercent: number;
  }>;
  staffing: {
    available: boolean;
    assignments: number;
    plannedHours: number;
    revenuePerPlannedHour: number | null;
    hourly: Array<{
      hour: number;
      plannedHours: number;
      revenue: number;
      transactions: number;
      revenuePerPlannedHour: number | null;
      transactionsPerPlannedHour: number | null;
    }>;
    pressureHours: Array<{
      hour: number;
      plannedHours: number;
      revenue: number;
      transactions: number;
      revenuePerPlannedHour: number | null;
      transactionsPerPlannedHour: number | null;
    }>;
  };
  quality: {
    transactionRows: number;
    crossSourceDuplicatesExcluded: number;
    productRows: number;
    productCoverageDays: number;
    productCoveragePercent: number;
    selectedProductReports: number;
    overlappingProductReportsExcluded: number;
    productPeriod: { from: string; to: string } | null;
    sources: Array<{ id: string; name: string; provider: FinanceProvider }>;
    limitations: string[];
  };
  productComparisons: {
    previousPeriodCoveragePercent: number;
    previousYearCoveragePercent: number;
    previousYearProductCount: number;
  };
}

export interface FinanceSalesHour {
  hour: number;
  label: string;
  revenue: number;
  transactions: number;
  sharePercent: number;
  averageTicket: number | null;
}

export interface FinanceSalesWeekday {
  weekday: number;
  label: string;
  revenue: number;
  transactions: number;
  sharePercent: number;
  averageTicket: number | null;
}

export interface FinanceSalesComparison {
  from: string;
  to: string;
  revenue: number;
  netRevenue: number;
  transactions: number;
  averageTicket: number | null;
  refunds: number;
  discounts: number;
  cancellations: number;
  revenueVariationPercent: number | null;
  transactionVariationPercent: number | null;
  averageTicketVariationPercent: number | null;
}

export interface FinanceSalesProduct {
  name: string;
  category: string;
  quantity: number;
  gross: number;
  net: number;
  discount: number;
  sharePercent: number;
  previousQuantity: number | null;
  quantityVariationPercent: number | null;
  margin: number | null;
  marginRate: number | null;
  unitCost: number | null;
  estimatedCost: number | null;
}

export interface ConfigureFennoaPayload {
  username: string;
  apiKey?: string;
  baseUrl?: string;
  apiVersion?: 'v1' | 'v2';
}

export interface ConfigureFlatpayPayload {
  siteId: string;
  username: string;
  password?: string;
  portalUrl?: string;
}

export interface ConfigurePosApiPayload {
  siteId: string;
  clientId?: string;
  secret?: string;
  historyStart?: string;
  schedule?: string[];
}

export interface FennoaSyncResult {
  ok: boolean;
  runId?: string;
  from?: string;
  to?: string;
  accountsCount: number;
  periodsCount?: number;
  ledgerRowsCount?: number;
  budgetRowsCount?: number;
  periodsSyncedCount?: number;
  full?: boolean;
  automaticFullBackfill?: boolean;
  testedAt?: string;
}

export interface FinanceImportResult {
  duplicate: boolean;
  batch: FinanceImportBatch;
}

export interface PurchasingEmailConnection {
  id: string;
  provider: 'RESEND' | 'SMTP' | 'GOOGLE' | 'MICROSOFT';
  status: 'DISCONNECTED' | 'CONFIGURED' | 'CONNECTED' | 'ERROR';
  senderEmail?: string | null;
  senderName?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUsername?: string | null;
  configured: boolean;
  lastTestedAt?: string | null;
  lastError?: string | null;
}

export interface PurchaseEmailPreview {
  recipient?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  provider: string;
  subject: string;
  text: string;
}

export interface PurchasingDashboard {
  stats: {
    drafts: number;
    ordersThisMonth: number;
    amountThisMonth: number;
    expectedNext7Days: number;
    receiptsToReview: number;
  };
  recent: PurchaseOrder[];
}

export type MenuStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';
export type MenuServiceType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'EVENT' | 'BUFFET';
export type MenuSection = 'STARTER' | 'MAIN' | 'SIDE' | 'CHEESE' | 'DESSERT' | 'DRINK' | 'OTHER';
export type MenuCalendarView = 'day' | 'week' | 'month' | 'year';
export type MenuUsageProfile = 'RESTAURANT_CAFE' | 'CATERER' | 'CENTRAL_KITCHEN' | 'CUSTOM';
export type MenuActivity = 'RESTAURANT_CAFE' | 'CATERER' | 'CENTRAL_KITCHEN';
export type MenuKind = 'CATALOG' | 'SERVICE' | 'EVENT' | 'CYCLE';
export type MenuCatalogType = 'FOOD' | 'DRINKS';

export interface MenuCategory {
  id: string;
  name: string;
  position: number;
  color?: string | null;
  icon?: string | null;
  catalogType?: MenuCatalogType | null;
}

export interface MenuSettings {
  id: string;
  usageProfile: MenuUsageProfile;
  catalogEnabled: boolean;
  scheduledMenusEnabled: boolean;
  eventsEnabled: boolean;
  cyclesEnabled: boolean;
  dietsEnabled: boolean;
  guestForecastsEnabled: boolean;
  targetStockEnabled: boolean;
  onboardingCompletedAt?: string | null;
  categories?: MenuCategory[];
}

export interface MenuAlert {
  code?: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
  blocking?: boolean;
}

export interface MenuModuleDashboard {
  installed?: boolean;
  stats?: {
    activeMenus?: number;
    weekMenus?: number;
    activeCycles?: number;
    todayGuests?: number;
    averageCostPerMeal?: number;
  };
  alerts?: MenuAlert[];
}

export interface MenuDiet {
  id: string;
  name: string;
  description?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export interface MenuGuestGroup {
  id: string;
  name: string;
  description?: string | null;
  isArchived?: boolean;
}

export interface MenuItem {
  id?: string;
  section: MenuSection;
  menuCategoryId?: string | null;
  menuCategory?: MenuCategory | null;
  sourceType?: 'TECHNICAL_SHEET' | 'PRODUCT';
  technicalSheetId?: string | null;
  technicalSheet?: TechnicalSheetRecipe | null;
  productId?: string | null;
  product?: Product | null;
  dietId?: string | null;
  diet?: MenuDiet | null;
  portionsMultiplier?: number | string | null;
  portionsOverride?: number | null;
  servingQuantity?: number;
  targetReadyQuantity?: number | null;
  lowStockThreshold?: number | null;
  availabilityEnabled?: boolean;
  order?: number | null;
}

export interface MenuItemPayload {
  id?: string;
  section: MenuSection;
  menuCategoryId?: string;
  technicalSheetId?: string | null;
  productId?: string;
  dietId?: string;
  portionsMultiplier?: number;
  order?: number;
  portionsOverride?: number;
  servingQuantity?: number;
  targetReadyQuantity?: number;
  lowStockThreshold?: number;
  availabilityEnabled?: boolean;
  notes?: string;
}

export interface MenuVariant {
  id: string;
  name?: string | null;
  dietId?: string | null;
  diet?: MenuDiet | null;
  type?: 'DERIVED' | 'FULL_MENU' | string;
  guestCount?: number | null;
  replacements?: Array<{
    sourceTechnicalSheetId: string;
    replacementTechnicalSheetId: string;
    section?: MenuSection;
  }>;
  estimatedCostTotal?: number | string | null;
  allergens?: Array<TechnicalSheetAllergen | { name?: string } | string>;
}

export interface MenuGuestForecast {
  id?: string;
  menuId?: string;
  guestGroupId: string;
  guestGroup?: MenuGuestGroup | null;
  group?: MenuGuestGroup | null;
  dietId?: string | null;
  diet?: MenuDiet | null;
  destinationSiteId?: string | null;
  destinationSite?: Site | null;
  dispatchId?: string | null;
  count: number;
}

export interface MenuPlan {
  id: string;
  name: string;
  date?: string | null;
  service: MenuServiceType;
  kind?: MenuKind;
  activity?: MenuActivity;
  needsActivityReview?: boolean;
  catalogType?: MenuCatalogType | null;
  siteId?: string | null;
  site?: Site | null;
  sourceMenuId?: string | null;
  description?: string | null;
  activeFrom?: string | null;
  activeUntil?: string | null;
  isPrimary?: boolean;
  expectedGuests?: number | string | null;
  guestCount?: number | string | null;
  totalGuests?: number | string | null;
  status: MenuStatus;
  items?: MenuItem[];
  variants?: MenuVariant[];
  guestForecasts?: MenuGuestForecast[];
  estimatedCostTotal?: number | string | null;
  costTotal?: number | string | null;
  estimatedCostPerGuest?: number | string | null;
  costPerGuest?: number | string | null;
  allergens?: Array<TechnicalSheetAllergen | { name?: string } | string>;
  alerts?: MenuAlert[];
  hasBlockingAlerts?: boolean;
  productionGeneratedAt?: string | null;
  productionDirtySince?: string | null;
  productionGenerationMode?: 'DETAILED' | 'GROUPED' | string | null;
  productionLinks?: Array<{
    id: string;
    productionOrderId?: string;
    mode?: string;
    generationMode?: string;
    snapshot?: {
      lines?: Array<{
        menuItemId?: string;
        technicalSheetId?: string;
        section?: MenuSection;
        portions?: number;
        targetPortions?: number;
        openingCarryOverPortions?: number;
        plannedProductionPortions?: number;
        plannedTime?: string;
        productionDate?: string;
      }>;
    } | null;
    productionOrder?: ProductionCampaign | ProductionOrder | null;
  }>;
  cycleId?: string | null;
  cycle?: MenuCycle | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface MenuPlanPayload {
  name: string;
  date?: string;
  service: MenuServiceType;
  kind?: MenuKind;
  activity?: MenuActivity;
  catalogType?: MenuCatalogType;
  siteId?: string;
  description?: string;
  activeFrom?: string;
  activeUntil?: string;
  isPrimary?: boolean;
  expectedGuests?: number;
  items?: MenuItemPayload[];
  guestForecasts?: Array<{ guestGroupId: string; dietId?: string; count: number }>;
}

export interface MenuAvailabilityComponent {
  kind: 'SUB_RECIPE' | 'PRODUCT';
  technicalSheetId?: string;
  productId?: string;
  name: string;
  requiredQuantity: number;
  availableQuantity?: number;
  inProductionQuantity?: number;
  missingQuantity: number;
  unit?: string;
  unitPrice?: number | null;
  unitPriceUnit?: string;
  estimatedCost?: number | null;
  recipeCost?: number | null;
  costPerPortion?: number | null;
  status: 'READY' | 'TO_PRODUCE' | 'BLOCKED' | 'NOT_CONFIGURED';
  reason?: string;
  children?: MenuAvailabilityComponent[];
}

export interface MenuAvailabilityItem {
  id: string;
  sourceType?: 'TECHNICAL_SHEET' | 'PRODUCT';
  technicalSheetId?: string;
  productId?: string;
  name: string;
  category?: MenuCategory | null;
  outputProduct?: { id: string; name: string; unit?: Unit };
  servingQuantity: number;
  targetPortions: number;
  stockQuantity?: number;
  inProductionQuantity?: number;
  availablePortions?: number;
  projectedPortions?: number;
  toProduceQuantity?: number;
  toProducePortions?: number;
  missingStockQuantity?: number;
  recipeCost?: number | null;
  costPerPortion?: number | null;
  status: 'READY' | 'LOW_STOCK' | 'TO_PRODUCE' | 'COMPONENT_MISSING' | 'BLOCKED' | 'NOT_CONFIGURED';
  message?: string;
  components: MenuAvailabilityComponent[];
}

export interface MenuAvailabilityReport {
  menu: { id: string; name: string; kind: MenuKind; siteId?: string | null; site?: Site | null };
  generatedAt: string;
  summary: { total: number; ready: number; lowStock: number; toProduce: number; blocked: number };
  items: MenuAvailabilityItem[];
}

export interface MenuCycle {
  id: string;
  name: string;
  description?: string | null;
  durationWeeks?: number;
  siteId?: string | null;
  site?: Site | null;
  status?: 'ACTIVE' | 'ARCHIVED' | string;
  weeks?: unknown[];
  items?: Array<{
    id?: string;
    weekNumber: number;
    dayOfWeek: number;
    service: MenuServiceType;
    section: MenuSection;
    technicalSheetId: string;
    dietId?: string;
    diet?: MenuDiet | null;
    technicalSheet?: TechnicalSheetRecipe;
    position?: number;
    notes?: string;
  }>;
  forecasts?: MenuCycleForecast[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuCyclePayload {
  name: string;
  description?: string;
  durationWeeks: number;
  siteId?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  items?: Array<{
    weekNumber: number;
    dayOfWeek: number;
    service: MenuServiceType;
    section: MenuSection;
    technicalSheetId: string;
    dietId?: string;
    position?: number;
    notes?: string;
  }>;
  forecasts?: Array<{
    weekNumber: number;
    dayOfWeek: number;
    service: MenuServiceType;
    destinationSiteId: string;
    guestGroupId: string;
    dietId?: string;
    count: number;
    departureTime?: string;
    deliveryTime?: string;
    notes?: string;
  }>;
}

export interface MenuCycleForecast {
  id: string;
  weekNumber: number;
  dayOfWeek: number;
  service: MenuServiceType;
  destinationSiteId: string;
  destinationSite?: Site;
  guestGroupId: string;
  guestGroup?: MenuGuestGroup;
  dietId?: string | null;
  diet?: MenuDiet | null;
  count: number;
  departureTime?: string | null;
  deliveryTime?: string | null;
  notes?: string | null;
}

export type MenuDispatchStatus = 'PLANNED' | 'PREPARED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface MenuDispatch {
  id: string;
  menuId: string;
  menu?: MenuPlan;
  destinationSiteId: string;
  destinationSite?: Site;
  departureAt?: string | null;
  deliveryAt?: string | null;
  status: MenuDispatchStatus;
  notes?: string | null;
  forecasts?: MenuGuestForecast[];
}

export interface CatererClient {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export type CatererEventStatus = 'DRAFT' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type CatererFulfillmentMode = 'DELIVERY' | 'PICKUP' | 'ON_SITE';
export type CatererProductionState =
  | 'NOT_GENERATED'
  | 'DIRTY'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export interface CatererPrestation {
  id: string;
  name: string;
  service: MenuServiceType;
  readyAt?: string | null;
  handoffAt?: string | null;
  serviceAt?: string | null;
  expectedGuests: number;
  position: number;
  notes?: string | null;
  menuId: string;
  menu: MenuPlan;
}

export interface CatererEvent {
  id: string;
  reference: string;
  name: string;
  clientId?: string | null;
  client?: CatererClient | null;
  clientSnapshot?: Partial<CatererClient> | null;
  productionSiteId?: string | null;
  productionSite?: Site | null;
  startsAt?: string | null;
  endsAt?: string | null;
  venueName?: string | null;
  address?: string | null;
  accessNotes?: string | null;
  fulfillmentMode: CatererFulfillmentMode;
  status: CatererEventStatus;
  needsReview?: boolean;
  notes?: string | null;
  prestations: CatererPrestation[];
  totalGuests: number;
  productionState: CatererProductionState;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatererPrestationPayload {
  id?: string;
  name: string;
  service: MenuServiceType;
  readyAt?: string;
  handoffAt?: string;
  serviceAt?: string;
  expectedGuests: number;
  position?: number;
  notes?: string;
  items?: MenuItemPayload[];
}

export interface CatererEventPayload {
  name: string;
  clientId?: string;
  productionSiteId?: string;
  startsAt?: string;
  endsAt?: string;
  venueName?: string;
  address?: string;
  accessNotes?: string;
  fulfillmentMode: CatererFulfillmentMode;
  notes?: string;
  prestations: CatererPrestationPayload[];
}

export interface CatererProductionPlanLine {
  menuItemId: string;
  prestationId: string;
  prestationName: string;
  menuId: string;
  technicalSheetId: string;
  technicalSheetName: string;
  section: MenuSection;
  portions: number;
  readyAt: string;
  productionDate: string;
  plannedTime: string;
  serviceId?: string | null;
  productionOrderId?: string | null;
  productionOrderStatus?: string | null;
  editable: boolean;
}

export interface CatererProductionPlanLogisticsLine {
  key: string;
  prestationId: string;
  prestationName: string;
  menuId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  category: 'LOGISTICS';
  enabled: boolean;
  task?: OperationalTask | null;
}

export interface CatererProductionPlan {
  event: CatererEvent;
  lines: CatererProductionPlanLine[];
  stockProducts: Array<{
    menuItemId: string;
    prestationId: string;
    prestationName: string;
    productId: string;
    productName: string;
    quantity: number;
  }>;
  logistics: CatererProductionPlanLogisticsLine[];
  focusDate: string;
  createdOrderIds?: string[];
  updatedOrderIds?: string[];
  cancelledOrderIds?: string[];
  logisticsTaskIds?: string[];
}

export interface CatererProductionPlanPayload {
  serviceId: string;
  logisticsDepartmentId?: string;
  lines: Array<{
    menuItemId: string;
    portions: number;
    productionDate: string;
    plannedTime: string;
  }>;
  logistics: Array<{
    key: string;
    enabled: boolean;
    startsAt: string;
    endsAt: string;
  }>;
}

export interface MenuProductionGenerationPayload {
  mode: 'DETAILED' | 'GROUPED';
  confirmRegeneration?: boolean;
  plannedTime?: string;
  serviceId?: string;
  neededAt?: string;
  lines?: Array<{
    menuItemId: string;
    portions: number;
    plannedTime?: string;
    productionDate?: string;
    targetPortions?: number;
    openingCarryOverPortions?: number;
  }>;
}

export interface MenuProductionGenerationResult {
  createdOrdersCount?: number;
  reused?: number;
  orders?: ProductionOrder[];
  productionOrderIds?: string[];
  mode?: 'DETAILED' | 'GROUPED' | string;
  skipped?: Array<{ menuItemId?: string; name?: string; reason: string }>;
  allMenuProductsPlanned?: boolean;
}

export interface PlanCatalogProductionDayPayload {
  siteId: string;
  date: string;
  serviceId: string;
  plannedTime?: string;
  lines: Array<{
    menuItemId: string;
    targetPortions: number;
    plannedTime?: string;
  }>;
}

export interface PlanCatalogProductionDayResult {
  menu: MenuPlan;
  generation: MenuProductionGenerationResult;
  previousClosureDate?: string | null;
  lines: Array<{
    menuItemId: string;
    portions: number;
    targetPortions: number;
    openingCarryOverPortions: number;
    plannedTime: string;
  }>;
}

export interface MenuExportPayload {
  menuId?: string;
  kind: 'KITCHEN' | 'DINING_ROOM' | 'PUBLIC_DISPLAY';
  format: 'PDF';
  templateId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface MenuDisplayTemplate {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number | null;
  layout?: {
    titleZone?: { x: number; y: number; width: number; height: number };
    contentZone?: { x: number; y: number; width: number; height: number };
    confidence?: number | null;
  };
  status: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuExport {
  id: string;
  menuId?: string | null;
  menu?: MenuPlan | null;
  cycleId?: string | null;
  cycle?: MenuCycle | null;
  kind?: string;
  audience?: 'KITCHEN' | 'DINING_ROOM' | 'PUBLIC_DISPLAY' | string;
  format: string;
  filename?: string;
  createdAt?: string;
  fileUrl?: string | null;
  templateId?: string | null;
  template?: { id: string; name: string; originalName?: string } | null;
}

export interface MenuHistoryEntry {
  id: string;
  action: string;
  context?: string | null;
  summary?: string | null;
  createdAt?: string;
  user?: {
    id?: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  menu?: { id?: string; name?: string | null } | null;
  cycle?: { id?: string; name?: string | null } | null;
}

export interface Site {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  responsibleName?: string | null;
  responsiblePhone?: string | null;
  responsibleEmail?: string | null;
  isMain?: boolean;
  isPrimary?: boolean;
  archivedAt?: string | null;
  isArchived?: boolean;
}

export interface Location {
  id: string;
  name: string;
  description?: string | null;
  siteId: string;
  site?: Site;
  archivedAt?: string | null;
  isArchived?: boolean;
}

export interface Lot {
  id: string;
  lotNumber?: string | null;
  productId: string;
  product: Product;
  expiresAt?: string | null;
  expirationDate?: string | null;
  quantity?: string | number | null;
}

export interface Stock {
  id: string;
  productId: string;
  siteId?: string | null;
  locationId?: string | null;
  quantity: string | number;
  currentQuantity?: string | number | null;
  value?: string | number | null;
  stockValue?: string | number | null;
  product: Product;
  lot?: Lot | null;
  site?: Site | null;
  location?: Location | null;
}

export interface StockMovement {
  id: string;
  productId: string;
  product: Product;
  supplierId?: string | null;
  supplier?: Supplier | null;
  type: StockMovementType;
  quantity: string | number;
  createdAt: string;
  movementDate?: string;
  date?: string;
  reason?: string | null;
  comment?: string | null;
  createdBy?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  sourceSite?: Site | null;
  sourceLocation?: Location | null;
  destinationSite?: Site | null;
  destinationLocation?: Location | null;
}

export type ArticleStockStatus = 'NORMAL' | 'LOW' | 'OUT' | 'NEGATIVE' | 'NO_STOCK';
export interface Article {
  product: Product;
  stock: {
    quantity: string | number;
    value: string | number;
    minimumStock?: string | number;
    status: ArticleStockStatus;
  };
  stockBySite: Array<{
    siteId?: string | null;
    siteName?: string | null;
    quantity: string | number;
  }>;
  lots?: Array<{
    lotNumber?: string | null;
    expiresAt?: string | null;
    quantity: string | number;
    siteName?: string | null;
    locationName?: string | null;
  }>;
  lastMovement?: StockMovement | null;
}
export interface ArticlesResponse {
  items: Article[];
  summary: {
    articleCount: number;
    articlesWithStock: number;
    articlesWithoutStock: number;
    stockValue: number;
    lowStockCount: number;
    unassignedCount?: number;
  };
  selectedSiteId?: string | null;
  pagination?: { page: number; pageSize: number; total: number; pages?: number };
}

export type OcrMatchingStatus = 'RECOGNIZED' | 'NEEDS_REVIEW' | 'NOT_FOUND';
export type StocksOcrLineStatus =
  | 'ready'
  | 'needs_review'
  | 'missing_product'
  | 'price_mismatch'
  | 'quantity_suspicious'
  | 'non_product_line'
  | 'duplicate_line'
  | string;

export interface StocksOcrDocument {
  id: string;
  originalName: string;
  internalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StocksOcrLine {
  id?: string;
  ignored?: boolean;
  ocrLabel?: string | null;
  label?: string | null;
  reference?: string | null;
  nameOriginal?: string | null;
  descriptionOriginal?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unitId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  suggestedCategoryId?: string | null;
  suggestedCategoryName?: string | null;
  productId?: string | null;
  /** Create this catalog product only when the OCR reception is validated. */
  createProduct?: boolean;
  productKind?: Product['kind'];
  lineType?: 'equipment' | 'service' | 'accessory' | 'transport' | 'consumable' | 'unknown';
  brand?: string | null;
  model?: string | null;
  listUnitPrice?: number | string | null;
  discountPercent?: number | string | null;
  acquisitionMode?: EquipmentAcquisitionMode | null;
  financingProvider?: string | null;
  financingStart?: string | null;
  financingEnd?: string | null;
  monthlyPayment?: number | string | null;
  financedAmount?: number | string | null;
  buyoutValue?: number | string | null;
  equipmentNotes?: string | null;
  productName?: string | null;
  matchedUnitSymbol?: string | null;
  unitPrice?: number | string | null;
  lineTotal?: number | string | null;
  total?: number | string | null;
  vatRate?: number | string | null;
  lotNumber?: string | null;
  bestBeforeDate?: string | null;
  matchingStatus?: OcrMatchingStatus | string;
  matchingScore?: number | string | null;
  lineStatus?: StocksOcrLineStatus | null;
  lineConfidence?: number | string | null;
  warnings?: string[];
  sourceText?: string | null;
  packageDescription?: string | null;
  productCandidates?: Array<{
    id: string;
    name: string;
    sku?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    unitId?: string | null;
    unitSymbol?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    score: number | string;
  }>;
}

export interface StocksOcrReceptionData {
  documentType?:
    | 'invoice'
    | 'delivery_note'
    | 'receipt'
    | 'supplier_order'
    | 'order_confirmation'
    | 'quote'
    | 'unknown'
    | string;
  supplierName?: string | null;
  supplier?: {
    name?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    matchingStatus?: OcrMatchingStatus | string;
    matchingScore?: number | string | null;
    candidates?: Array<{ id: string; name: string; score: number | string }>;
    identifiers?: Array<{ kind: string; value: string }>;
  } | null;
  supplierId?: string | null;
  supplierMatchingStatus?: OcrMatchingStatus | string;
  supplierMatchingScore?: number | string | null;
  supplierCandidates?: Array<{ id: string; name: string; score: number | string }>;
  supplierIdentifiers?: Array<{ kind: string; value: string }>;
  invoiceNumber?: string | null;
  deliveryNoteNumber?: string | null;
  purchaseOrderNumber?: string | null;
  receiptNumber?: string | null;
  documentDate?: string | null;
  deliveryDate?: string | null;
  totalExcludingTax?: number | string | null;
  totalTax?: number | string | null;
  totalIncludingTax?: number | string | null;
  siteId?: string | null;
  locationId?: string | null;
  documentConfidence?: number | string | null;
  warnings?: string[];
  suggestedActions?: string[];
  aiAnalysis?: {
    provider?: string;
    model?: string;
    status?: 'applied' | 'fallback' | 'failed' | string;
    confidence?: number | string | null;
    warnings?: string[];
    suggestedActions?: string[];
    totalsCheck?: {
      computedTotal?: number | string | null;
      documentTotal?: number | string | null;
      delta?: number | string | null;
      status?: string | null;
    };
  } | null;
  document?: {
    invoiceNumber?: string | null;
    deliveryNoteNumber?: string | null;
    purchaseOrderNumber?: string | null;
    receiptNumber?: string | null;
    documentDate?: string | null;
    deliveryDate?: string | null;
  };
  totals?: {
    totalExcludingTax?: number | string | null;
    totalTax?: number | string | null;
    totalIncludingTax?: number | string | null;
  };
  lines: StocksOcrLine[];
}

export interface StocksOcrExtraction {
  id: string;
  status: string;
  type: string;
  confidenceScore?: number | string | null;
  extractedJson?: StocksOcrReceptionData;
  correctedJson?: StocksOcrReceptionData | null;
  data: StocksOcrReceptionData;
  document?: StocksOcrDocument;
  ocrDocument?: {
    id: string;
    status: string;
    documentId: string;
    document?: StocksOcrDocument;
    errorMessage?: string | null;
  };
}

export interface StocksOcrStatus {
  document: StocksOcrDocument;
  ocr?: {
    id: string;
    status: string;
    errorMessage?: string | null;
    extractions?: Array<{
      id: string;
      status: string;
      extractedJson?: StocksOcrReceptionData;
      correctedJson?: StocksOcrReceptionData | null;
    }>;
  } | null;
  extraction?: {
    id: string;
    status: string;
    extractedJson?: StocksOcrReceptionData;
    correctedJson?: StocksOcrReceptionData | null;
  } | null;
  state: string;
}

export interface StockReception {
  id: string;
  status: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  deliveryNoteNumber?: string | null;
  lines?: Array<{
    id: string;
    product?: Product | null;
    quantity?: string | number | null;
    movements?: StockMovement[];
  }>;
}

export interface InventoryLine {
  id: string;
  productId: string;
  lotId?: string | null;
  product: Product;
  countedQuantity?: string | number | null;
  theoreticalQuantity?: string | number | null;
  variance?: string | number | null;
  varianceQuantity?: string | number | null;
}

export interface Inventory {
  id: string;
  name: string;
  inventoryDate?: string;
  date?: string;
  status?: string;
  comment?: string | null;
  siteId?: string | null;
  locationId?: string | null;
  site?: Site | null;
  location?: Location | null;
  lines?: InventoryLine[];
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityType?: string;
  entityId?: string | null;
  createdAt: string;
  user?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
}

export interface StocksDashboard {
  counts?: Record<string, number>;
  lowStockProducts?: Product[];
  recentMovements?: StockMovement[];
  stockValue?: number;
}

export interface MarginChartPoint {
  date?: string;
  name?: string;
  value: number;
  productId?: string | null;
  productName?: string | null;
  supplierName?: string | null;
}

export interface MarginAlert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | string;
  priority?: number;
  title: string;
  explanation: string;
  currentValue?: number | null;
  referenceValue?: number | null;
  variationPct?: number | null;
  detectedAt?: string;
  product?: Product | null;
  supplier?: Supplier | null;
}

export interface MarginReport {
  id: string;
  title: string;
  summary: string;
  insights?: string[];
  metrics?: Record<string, unknown>;
  createdAt?: string;
}

export interface MarginForecast {
  productId: string;
  productName: string;
  supplierName?: string | null;
  currentStock: number;
  dailyConsumption: number;
  daysUntilRupture?: number | null;
  estimatedRuptureDate?: string | null;
  recommendedQuantity: number;
  unitSymbol?: string | null;
  estimatedBudget: number;
}

export interface MarginRnmComparison {
  productId: string;
  productName: string;
  paidPrice: number;
  rnmProductId: string;
  rnmProductName: string;
  rnmPrice: number;
  rnmUnit?: string | null;
  latestQuotationDate?: string | null;
  gapValue: number;
  gapPct: number;
  message: string;
}

export interface MarginTechnicalSheetImpact {
  totalMaterialCost: number;
  totalDelta?: number;
  impactedRecipesCount?: number;
  impacts?: Array<{
    technicalSheetId: string;
    technicalSheetName: string;
    productId: string;
    productName: string;
    oldCost: number;
    newCost: number;
    delta: number;
    monthlyImpact: number;
    annualImpact: number;
  }>;
  timeseries?: MarginChartPoint[];
}

export interface MarginSettings {
  id?: string;
  priceIncreaseThresholdPct: number | string;
  anomalyThresholdPct: number | string;
  quantityAnomalyThresholdPct: number | string;
  updatedAt?: string;
}

export interface MarginsDashboard {
  range?: { start: string; end: string };
  kpis: {
    monthlyPurchases: number;
    materialCost: number;
    invoiceCount: number;
    supplierCount: number;
    averageIncreasePct: number;
    potentialSavings: number;
    averagePrice: number;
    yearlyEvolutionPct: number;
    monthlyEvolutionPct: number;
    weeklyEvolutionPct: number;
    openAlerts: number;
  };
  charts: {
    purchases: MarginChartPoint[];
    materialCost: MarginChartPoint[];
    prices: MarginChartPoint[];
    categories: MarginChartPoint[];
    suppliers: MarginChartPoint[];
    expenseDistribution: MarginChartPoint[];
    productFamilies: MarginChartPoint[];
    topProducts: MarginChartPoint[];
    topSuppliers: MarginChartPoint[];
  };
  alerts: MarginAlert[];
  suggestions: Array<{ type: string; message: string; priority: number }>;
  reports: MarginReport[];
  forecasts?: MarginForecast[];
  rnmComparisons?: MarginRnmComparison[];
  technicalSheetImpact?: MarginTechnicalSheetImpact;
}

export interface MarginProductDetail {
  product: Product;
  stats: Record<string, number | null>;
  chart: MarginChartPoint[];
  history: Array<Record<string, unknown>>;
  suppliers: Array<Record<string, unknown>>;
  latestInvoices: Array<Record<string, unknown>>;
  lots: Array<Record<string, unknown>>;
  technicalSheetImpact: Array<Record<string, unknown>>;
  rnmComparison?: MarginRnmComparison | null;
}

export interface MarginSupplierDetail {
  supplier: Supplier;
  score: number;
  stats: Record<string, number | null>;
  evolution: MarginChartPoint[];
  products: MarginChartPoint[];
  priceEvolution: MarginChartPoint[];
  history: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
}

export type ProductionOrderStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'PLANNED'
  | 'VALIDATED'
  | 'IN_PROGRESS'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'CANCELLED';
export type ProductionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ProductionMaterialStatus =
  | 'OK'
  | 'POTENTIAL_SHORTAGE'
  | 'INSUFFICIENT_STOCK'
  | 'PRODUCT_ARCHIVED'
  | 'UNIT_NOT_CONVERTIBLE'
  | 'STOCK_UNKNOWN';
export type ProductionAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type ProductionAlertCode =
  | 'NOT_STARTED'
  | 'LATE'
  | 'MISSING_MATERIAL'
  | 'STAFFING_SHORTAGE'
  | 'UNASSIGNED_COLLABORATOR'
  | 'NO_RESPONSIBLE'
  | 'DESTOCKING_PENDING'
  | 'QUALITY_CONTROL_MISSING'
  | 'ABSENT_COLLABORATOR'
  | 'QUANTITY_VARIANCE'
  | 'UNIT_NOT_CONVERTIBLE'
  | 'PRODUCT_ARCHIVED'
  | 'STOCK_UNKNOWN';
export type ProductionHistoryAction =
  | 'CREATED'
  | 'UPDATED'
  | 'VALIDATED'
  | 'CANCELLED'
  | 'STATUS_CHANGED'
  | 'ASSIGNMENT_ADDED'
  | 'ASSIGNMENT_REMOVED'
  | 'ALERT_OVERRIDE_CONFIRMED'
  | 'DESTOCKING_PROPOSED'
  | 'DESTOCKING_CONFIRMED'
  | 'EXPORT_GENERATED'
  | 'REALIZATION_CLOSED'
  | 'QUALITY_CONTROL_UPDATED'
  | 'REALIZED_PORTIONS_UPDATED';
export type ProductionExportFormat = 'PDF' | 'EXCEL' | 'PRINT';
export type ProductionExportType =
  | 'PRODUCTION_SHEET'
  | 'MATERIAL_REQUIREMENTS'
  | 'TEAM_ASSIGNMENTS';
export type ProductionDestockingStatus = 'PROPOSED' | 'CONFIRMED' | 'CANCELLED';

export interface ProductionQuery {
  search?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  siteId?: string;
  serviceId?: string;
  orderId?: string;
  employeeId?: string;
  status?: ProductionOrderStatus;
  page?: number;
  pageSize?: number;
}

export interface ProductionOrderPayload {
  technicalSheetId: string;
  siteId?: string;
  name?: string;
  productionDate: string;
  plannedTime: string;
  plannedPortions: number;
  serviceId?: string;
  responsibleEmployeeId?: string;
  priority?: ProductionPriority;
  comments?: string;
}

export type ProductionOrderUpdatePayload = Partial<
  Omit<ProductionOrderPayload, 'technicalSheetId'>
>;

export interface ProductionStatusPayload {
  status: ProductionOrderStatus;
  confirmCriticalOverride?: boolean;
  overrideReason?: string;
}

export interface ProductionAssignmentPayload {
  employeeId: string;
  planningAssignmentId?: string;
  mission?: string;
  plannedMinutes?: number;
  isLead?: boolean;
}

export interface ProductionRealizationPayload {
  realizedPortions: number;
  actualStartTime?: string;
  actualEndTime?: string;
  losses?: number;
  variance?: unknown;
  yieldPercent?: number;
  qualityControlDone?: boolean;
  qualityControlDetails?: unknown;
  varianceCauses?: string;
  comments?: string;
  managerValidated?: boolean;
  confirmDestocking?: boolean;
}

export interface ProductionExportPayload {
  type: ProductionExportType;
  format: ProductionExportFormat;
  startDate?: string;
  endDate?: string;
  serviceId?: string;
  orderId?: string;
  filters?: unknown;
}

export interface ProductionDestockingConfirmPayload {
  note?: string;
}

export interface ProductionAlertOverride {
  id: string;
  alertId: string;
  confirmedById?: string | null;
  reason: string;
  snapshot?: unknown;
  createdAt?: string;
  confirmedBy?: CoreUser | null;
}

export interface ProductionAlert {
  id: string;
  orderId?: string | null;
  code: ProductionAlertCode;
  severity: ProductionAlertSeverity;
  title: string;
  message: string;
  details?: unknown;
  isActive?: boolean;
  createdAt?: string;
  resolvedAt?: string | null;
  overrides?: ProductionAlertOverride[];
}

export interface ProductionMaterialRequirement {
  id: string;
  orderId: string;
  technicalSheetIngredientId?: string | null;
  productId: string;
  unitId: string;
  supplierId?: string | null;
  requiredQuantity: number | string;
  stockAvailable?: number | string | null;
  varianceQuantity?: number | string | null;
  status: ProductionMaterialStatus;
  estimatedCost?: number | string | null;
  productNameSnapshot: string;
  unitSymbolSnapshot: string;
  supplierNameSnapshot?: string | null;
  details?: unknown;
  createdAt?: string;
  updatedAt?: string;
  product?: Product | null;
  unit?: Unit | null;
  supplier?: Supplier | null;
  order?: ProductionOrder | null;
}

export interface ProductionAssignment {
  id: string;
  orderId: string;
  employeeId: string;
  planningAssignmentId?: string | null;
  mission?: string | null;
  plannedMinutes?: number | null;
  actualMinutes?: number | null;
  isLead?: boolean;
  createdAt?: string;
  updatedAt?: string;
  employee?: HrCollaborator | null;
  planningAssignment?: PlanningAssignment | null;
}

export type OperationalTaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type OperationalTaskCategory =
  | 'KITCHEN'
  | 'SERVICE'
  | 'HOUSEKEEPING'
  | 'RECEPTION'
  | 'MAINTENANCE'
  | 'LOGISTICS'
  | 'MANAGEMENT'
  | 'OTHER';

export type OperationalTaskSource = 'MANUAL' | 'MENU' | 'TECHNICAL_SHEET' | 'PRODUCTION';

export interface OperationalTaskAssignment {
  id: string;
  taskId: string;
  employeeId: string;
  planningAssignmentId?: string | null;
  isLead: boolean;
  mission?: string | null;
  plannedMinutes?: number | null;
  employee?: HrCollaborator | null;
  planningAssignment?: PlanningAssignment | null;
}

export interface OperationalTask {
  id: string;
  title: string;
  description?: string | null;
  category: OperationalTaskCategory;
  status: OperationalTaskStatus;
  source: OperationalTaskSource;
  sourceKey?: string | null;
  departmentId: string;
  positionId?: string | null;
  siteId?: string | null;
  assignedEmployeeId?: string | null;
  planningAssignmentId?: string | null;
  menuId?: string | null;
  technicalSheetId?: string | null;
  technicalSheetStepId?: string | null;
  productionBatchId?: string | null;
  productionOperationId?: string | null;
  positionTaskPresetId?: string | null;
  startsAt: string;
  endsAt: string;
  isTimeScheduled: boolean;
  quantity?: number | string | null;
  unitLabel?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  department?: HrDepartment | null;
  position?: HrPosition | null;
  site?: Site | null;
  assignedEmployee?: HrCollaborator | null;
  assignments?: OperationalTaskAssignment[];
  planningAssignment?: PlanningAssignment | null;
  menu?: { id: string; name: string; date?: string | null; service?: string | null } | null;
  technicalSheet?: {
    id: string;
    name: string;
    referencePortions?: number | string | null;
    steps?: Array<{
      id: string;
      order: number;
      title: string;
      description?: string | null;
      estimatedMinutes?: number | null;
    }>;
  } | null;
  technicalSheetStep?: {
    id: string;
    order: number;
    title: string;
    description?: string | null;
    estimatedMinutes?: number | null;
  } | null;
  productionBatch?: OperationalTaskProductionBatch | null;
  productionOperation?: OperationalTaskProductionOperation | null;
  createdBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

export interface OperationalTaskAssignee extends HrCollaborator {
  available: boolean;
  planningAssignment?: PlanningAssignment | null;
  operationalConflict?: Pick<
    OperationalTask,
    'id' | 'title' | 'assignedEmployeeId' | 'startsAt' | 'endsAt'
  > | null;
  availabilityLabel: string;
}

export interface OperationalTaskQuery {
  startDate: string;
  endDate: string;
  departmentId?: string;
  siteId?: string;
  employeeId?: string;
  status?: OperationalTaskStatus;
}

export interface OperationalTaskPayload {
  title: string;
  description?: string;
  category: OperationalTaskCategory;
  departmentId: string;
  positionId?: string | null;
  siteId?: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployeeIds?: string[];
  startsAt: string;
  endsAt: string;
  isTimeScheduled?: boolean;
  quantity?: number | null;
  unitLabel?: string | null;
  source?: OperationalTaskSource;
  sourceKey?: string;
  menuId?: string;
  technicalSheetId?: string | null;
  technicalSheetStepId?: string | null;
  productionBatchId?: string | null;
  productionOperationId?: string | null;
  positionTaskPresetId?: string | null;
}

export interface OperationalTaskTechnicalSheetOption {
  id: string;
  name: string;
  referencePortions?: number | string | null;
  totalTimeMinutes: number;
  isOnCurrentMenu: boolean;
  menuNames: string[];
  steps: Array<{
    id: string;
    order: number;
    title: string;
    description?: string | null;
    estimatedMinutes: number;
  }>;
}

export interface OperationalTaskOptions {
  presets: Array<HrPositionTaskPreset & { positionId: string; positionName: string }>;
  technicalSheets: OperationalTaskTechnicalSheetOption[];
  productionBatches: OperationalTaskProductionBatch[];
}

export interface OperationalTaskProductionOperation {
  id: string;
  batchId: string;
  title: string;
  position: number;
  status: string;
  activeMinutes?: number | null;
  notes?: string | null;
}

export interface OperationalTaskProductionBatch {
  id: string;
  reference: string;
  status: string;
  plannedQuantity: number | string;
  plannedStartAt?: string | null;
  unit?: { id: string; name: string; symbol: string } | null;
  order: {
    id: string;
    number: string;
    name: string;
    productionDate?: string;
    status: string;
    technicalSheetId?: string;
    siteId?: string | null;
  };
  operations: OperationalTaskProductionOperation[];
}

export interface ProductionRealization {
  id: string;
  orderId: string;
  realizedPortions: number | string;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  losses?: number | string | null;
  variance?: unknown;
  yieldPercent?: number | string | null;
  qualityControlDone?: boolean;
  qualityControlDetails?: unknown;
  varianceCauses?: string | null;
  comments?: string | null;
  managerValidated?: boolean;
  destockingConfirmed?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionDestockingLine {
  id: string;
  proposalId: string;
  requirementId?: string | null;
  productId: string;
  unitId: string;
  proposedQuantity: number | string;
  confirmedQuantity?: number | string | null;
  productNameSnapshot: string;
  unitSymbolSnapshot: string;
  createdAt?: string;
  product?: Product | null;
  unit?: Unit | null;
  requirement?: ProductionMaterialRequirement | null;
}

export interface ProductionDestockingMovement {
  id: string;
  proposalId: string;
  stockMovementId: string;
  createdAt?: string;
  stockMovement?: StockMovement | null;
}

export interface ProductionDestockingProposal {
  id: string;
  orderId: string;
  status: ProductionDestockingStatus;
  proposedAt?: string;
  confirmedAt?: string | null;
  confirmedById?: string | null;
  confirmationNote?: string | null;
  snapshot?: unknown;
  createdAt?: string;
  updatedAt?: string;
  lines?: ProductionDestockingLine[];
  movements?: ProductionDestockingMovement[];
  order?: ProductionOrder | null;
}

export interface ProductionHistoryEntry {
  id: string;
  orderId?: string | null;
  actorUserId?: string | null;
  action: ProductionHistoryAction;
  summary: string;
  details?: unknown;
  createdAt?: string;
  actorUser?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  order?: ProductionOrder | null;
}

export interface ProductionExport {
  id: string;
  requestedById?: string | null;
  type: ProductionExportType;
  format: ProductionExportFormat;
  startDate?: string | null;
  endDate?: string | null;
  serviceId?: string | null;
  orderId?: string | null;
  filename: string;
  filters?: unknown;
  snapshot: unknown;
  fileUrl?: string | null;
  createdAt?: string;
  requestedBy?: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  order?: ProductionOrder | null;
}

export interface ProductionOrder {
  id: string;
  number: string;
  name: string;
  technicalSheetId: string;
  siteId?: string | null;
  recipeVersionId?: string | null;
  outputProductId?: string | null;
  outputVariantId?: string | null;
  productionDate: string;
  plannedTime: string;
  status: ProductionOrderStatus;
  priority: ProductionPriority;
  enrichedPriority?: ProductionPriority;
  serviceId?: string | null;
  responsibleEmployeeId?: string | null;
  targetMode?: 'PORTIONS' | 'MASS' | null;
  targetQuantity?: number | string | null;
  plannedPortions: number | string;
  grossRequirement?: number | string;
  netRequirement?: number | string;
  proposedQuantity?: number | string;
  validatedQuantity?: number | string;
  reservedQuantity?: number | string;
  surplusQuantity?: number | string;
  realizedPortions?: number | string | null;
  estimatedCost?: number | string | null;
  actualCost?: number | string | null;
  comments?: string | null;
  source?: string;
  createdById?: string | null;
  updatedById?: string | null;
  completedById?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  technicalSheet?: TechnicalSheetRecipe | null;
  site?: Site | null;
  outputProduct?: Product | null;
  outputVariant?: ProductionProductVariant | null;
  service?: HrDepartment | null;
  responsibleEmployee?: HrCollaborator | null;
  requirements: ProductionMaterialRequirement[];
  assignments: ProductionAssignment[];
  alerts: ProductionAlert[];
  realization?: ProductionRealization | null;
  destockingProposals?: ProductionDestockingProposal[];
  history?: ProductionHistoryEntry[];
  exports?: ProductionExport[];
  needAllocations?: ProductionNeedAllocation[];
  batches?: ProductionBatch[];
  stockReservations?: ProductionStockReservation[];
  menuProductionLinks?: Array<{
    id: string;
    menuId?: string;
    productionOrderId?: string;
    snapshot?: {
      lines?: Array<{
        menuItemId?: string;
        portions?: number;
        targetPortions?: number;
        openingCarryOverPortions?: number;
        plannedProductionPortions?: number;
        plannedTime?: string;
      }>;
    } | null;
  }>;
}

export interface ProductionOrdersResponse {
  items: ProductionOrder[];
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface ProductionDashboard {
  stats: {
    plannedToday: number;
    inProgress: number;
    completed: number;
    late: number;
    plannedPortionsToday: number;
    realizedPortionsToday: number;
    pendingDestocking?: number;
  };
  alerts: ProductionAlert[];
  today: ProductionOrder[];
}

export type ProductionNeedSource =
  | 'MANUAL'
  | 'MENU'
  | 'CATERING_ORDER'
  | 'STOCK_TARGET'
  | 'STOCK_MINIMUM'
  | 'SALES_FORECAST'
  | 'RESERVATION'
  | 'SUB_RECIPE'
  | 'TRANSFER_REQUEST';
export type ProductionNeedStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_COVERED'
  | 'COVERED'
  | 'CANCELLED';
export type ProductionProfileMode = 'FIXED' | 'MULTIPLES' | 'FLEXIBLE' | 'FORMATS' | 'EQUIPMENT';
export type ProductionBatchStatus =
  | 'TO_PREPARE'
  | 'PREPARING'
  | 'COOKING'
  | 'COOLING'
  | 'FREEZING'
  | 'COMPLETED'
  | 'PARTIALLY_LOST'
  | 'CANCELLED';
export type ProductionOperationStatus =
  | 'PENDING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'CANCELLED';
export type ConservationState =
  | 'AMBIENT'
  | 'CHILLED'
  | 'FROZEN'
  | 'THAWING'
  | 'THAWED'
  | 'COOLING'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'DEPLETED';

export interface ProductionProductVariant {
  id: string;
  productId: string;
  name: string;
  sku?: string | null;
}

export interface ProductionNeed {
  id: string;
  siteId: string;
  productId: string;
  variantId?: string | null;
  unitId: string;
  source: ProductionNeedSource;
  sourceReferenceType?: string | null;
  sourceReferenceId?: string | null;
  quantity: number | string;
  coveredQuantity: number | string;
  neededAt: string;
  priority: ProductionPriority;
  status: ProductionNeedStatus;
  notes?: string | null;
  site?: Site;
  product?: Product;
  variant?: ProductionProductVariant | null;
  unit?: Unit;
  allocations?: ProductionNeedAllocation[];
}

export interface ProductionNeedAllocation {
  id: string;
  needId: string;
  orderId: string;
  plannedQuantity: number | string;
  reservedQuantity: number | string;
  consumedQuantity: number | string;
  need?: ProductionNeed;
}

export interface ProductionProfile {
  id: string;
  siteId: string;
  technicalSheetId: string;
  outputProductId: string;
  outputVariantId?: string | null;
  yieldUnitId: string;
  mode: ProductionProfileMode;
  referenceYield: number | string;
  minimumQuantity?: number | string | null;
  optimalQuantity?: number | string | null;
  maximumQuantity?: number | string | null;
  stepQuantity?: number | string | null;
  allowedFormats?: Array<number | string> | null;
  allowHalfBatch: boolean;
  allowDoubleBatch: boolean;
  quantityPerMold?: number | string | null;
  quantityPerTray?: number | string | null;
  quantityPerContainer?: number | string | null;
  quantityPerCycle?: number | string | null;
  maximumCycles?: number | null;
  canFreeze: boolean;
  shelfLifeHours?: number | null;
  frozenShelfLifeHours?: number | null;
  shelfLifeAfterThawHours?: number | null;
  thawingTimeMinutes?: number | null;
  site?: Site;
  technicalSheet?: TechnicalSheetRecipe;
  outputProduct?: Product;
  outputVariant?: ProductionProductVariant | null;
  yieldUnit?: Unit;
}

export interface ProductionScenario {
  kind: 'RECOMMENDED' | 'MINIMAL' | 'OPTIMIZED';
  quantity: string;
  batches: string[];
  coveredQuantity: string;
  uncoveredQuantity: string;
  surplusQuantity: string;
  storageShortage: string;
  warnings: string[];
}

export interface ProductionComponentPlan {
  profileId: string;
  technicalSheetId: string;
  outputQuantity: string;
  components: Array<{
    product: Product;
    recipeUnit: Unit;
    requiredQuantity: string;
    stockUnitQuantity: string | null;
    missingQuantity?: string;
    status: 'AVAILABLE' | 'TO_PRODUCE' | 'SHORTAGE' | 'UNIT_NOT_CONVERTIBLE';
    subRecipe?: {
      profileId: string;
      missingQuantity: string;
      suggestion: ProductionScenario;
      plan: ProductionComponentPlan;
    } | null;
  }>;
}

export interface ProductionSuggestion {
  profile: ProductionProfile;
  neededAt: string;
  availability: {
    physical: string;
    reserved: string;
    usable: string;
    confirmedProduction: string;
  };
  scenarios: ProductionScenario[];
  componentPlan: ProductionComponentPlan;
  capacity: Array<{
    kind?: string;
    quantity: string;
    molds: string | null;
    trays: string | null;
    containers: string | null;
    cycles: string;
    feasible: boolean;
    maximumQuantity: string | null;
  }>;
}

export interface ProductionOperation {
  id: string;
  type: string;
  title: string;
  position: number;
  plannedAt?: string | null;
  activeMinutes?: number | null;
  passiveMinutes?: number | null;
  workstation?: string | null;
  status: ProductionOperationStatus;
  notes?: string | null;
}

export interface ProductionBatch {
  id: string;
  orderId: string;
  unitId: string;
  number: number;
  reference: string;
  plannedQuantity: number | string;
  actualQuantity?: number | string | null;
  lostQuantity: number | string;
  status: ProductionBatchStatus;
  plannedStartAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  unit?: Unit;
  operations?: ProductionOperation[];
  outputLots?: Array<Lot & { stocks?: Stock[]; conservationState?: ConservationState }>;
}

export interface ProductionStockReservation {
  id: string;
  stockId: string;
  productId: string;
  variantId?: string | null;
  lotId?: string | null;
  quantity: number | string;
  status: 'ACTIVE' | 'CONSUMED' | 'RELEASED' | 'CANCELLED' | 'EXPIRED';
  target: 'NEED' | 'ORDER' | 'MENU' | 'CAMPAIGN' | 'TRANSFER' | 'OTHER';
  lot?: Lot | null;
}

export interface ProductionCampaign extends ProductionOrder {
  batches: ProductionBatch[];
  needAllocations: ProductionNeedAllocation[];
  stockReservations: ProductionStockReservation[];
}

export interface ProductionStockItem extends Stock {
  variantId?: string | null;
  variant?: ProductionProductVariant | null;
  physicalQuantity: string;
  reservedQuantity: string;
  freeQuantity: string;
  lot: Lot & {
    conservationState: ConservationState;
    productionBatchId?: string | null;
    producedAt?: string | null;
    availableAt?: string | null;
    frozenAt?: string | null;
    thawedAt?: string | null;
  };
}

export interface ProductionStockSummaryItem {
  technicalSheetId?: string | null;
  technicalSheetName: string;
  mode?: 'ASSEMBLY' | 'PRODUCTION' | string | null;
  productId: string;
  productName: string;
  variantId?: string | null;
  variantName?: string | null;
  unitSymbol?: string | null;
  producedQuantity: string;
  storedQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  batchCount: number;
  lastProducedAt?: string | null;
}

export interface CreateProductionCampaignPayload {
  profileId: string;
  grossRequirement: string;
  targetMode?: 'PORTIONS' | 'MASS';
  targetQuantity?: string;
  neededAt: string;
  plannedTime?: string;
  name?: string;
  priority?: ProductionPriority;
  serviceId?: string;
  responsibleEmployeeId?: string;
  destinationLocationId?: string;
  needIds?: string[];
  scenarioKind?: 'RECOMMENDED' | 'MINIMAL' | 'OPTIMIZED';
  storageCapacity?: string;
  optimizedTarget?: string;
  createSubRecipeNeeds?: boolean;
  comments?: string;
}

export interface ProductionDayClosureItem {
  id?: string;
  orderId: string;
  orderNumber?: string;
  outputProductId?: string | null;
  productName: string;
  plannedTime?: string;
  status?: ProductionOrderStatus;
  targetPortions: number;
  openingCarryOverPortions: number;
  producedPortions: number;
  totalAvailablePortions: number;
  remainingPortions: number;
  discardedPortions: number;
  estimatedOutPortions: number;
  carryOverNextPortions: number;
  lossReason?: string | null;
  notes?: string | null;
}

export interface ProductionDayClosure {
  id?: string | null;
  siteId: string;
  site?: Site | null;
  date: string;
  status: 'DRAFT' | 'CLOSED';
  closedAt?: string | null;
  previousClosureDate?: string | null;
  notes?: string | null;
  items: ProductionDayClosureItem[];
}

export interface ProductionCarryOver {
  siteId: string;
  date: string;
  previousClosureDate?: string | null;
  items: Array<{
    outputProductId: string;
    productName: string;
    portions: number;
  }>;
}

export interface ProductionDayValidationIngredient {
  productId: string;
  productName: string;
  quantity: string;
  reservedQuantity: string;
  consumedQuantity: string;
  unitId: string;
  unitSymbol: string;
}

export interface ProductionDayValidationOrder {
  id: string;
  number: string;
  name: string;
  status: ProductionOrderStatus;
  plannedTime: string;
  service?: { id: string; name: string } | null;
  quantityMode?: 'PORTIONS' | 'MASS';
  quantityUnitLabel?: string;
  requestedQuantity?: string;
  referenceYield?: string;
  requestedPortions: string;
  plannedPortions: string;
  referencePortions: string;
  recipeMultiplier: string;
  team: Array<{
    id: string;
    name: string;
    isLead: boolean;
    worksDuringProduction: boolean;
  }>;
  ingredients: ProductionDayValidationIngredient[];
  batches: Array<{
    id: string;
    reference: string;
    status: ProductionBatchStatus;
    plannedQuantity: string;
    unitSymbol: string;
  }>;
}

export interface ProductionDayValidation {
  site: { id: string; name: string };
  date: string;
  serviceId?: string | null;
  ready: boolean;
  completed: boolean;
  pendingBatchCount: number;
  blockingIssues: Array<{
    code: string;
    orderId: string;
    orderName: string;
    message: string;
  }>;
  totals: Array<{
    productId: string;
    productName: string;
    quantity: string;
    unitId: string;
    unitSymbol: string;
  }>;
  orders: ProductionDayValidationOrder[];
}
