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
  mistralApiKey?: string;
}

export interface SystemStatus {
  initialized: boolean;
  hasOrganization: boolean;
  hasAdmin: boolean;
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
    apiKeys?: OrganizationApiKeys;
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

export interface DashboardSummary {
  user: UserSession['user'];
  organization: {
    id: string | null;
    name: string;
    establishmentType?: EstablishmentType | null;
    teamSize?: TeamSize | null;
    logoDataUrl?: string | null;
    mainSiteName?: string | null;
    apiKeys?: OrganizationApiKeys;
  };
  installedApplications: string[];
  counts: { products: number; suppliers: number; stockMovements: number; activeUsers?: number; users?: number; collaborators?: number; hrCollaborators?: number };
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

export interface OrganizationApiKeys {
  mistral: {
    configured: boolean;
    masked?: string | null;
    updatedAt?: string | null;
  };
}

export interface StocksOcrConfig {
  provider: string;
  model: string;
  configured: boolean;
  source?: 'environment' | 'organization' | string | null;
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
}

export interface ModularDashboard {
  zones: Record<'kpi' | 'activity' | 'analytics' | 'alerts', DashboardWidget[]>;
  widgets: DashboardWidget[];
  preferences: ModularDashboardPreferences;
  refreshIntervalMs: number;
  generatedAt: string;
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
}

export type HrDayMode = 'WORK' | 'REST';

export interface HrRotationDay {
  id?: string;
  dayOfWeek: number;
  mode: HrDayMode | string;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  durationMinutes?: number | null;
  presenceMinutes?: number | null;
  endsNextDay?: boolean;
}

export interface HrRotationWeek {
  id?: string;
  weekIndex: number;
  label?: string | null;
  days: HrRotationDay[];
  totalMinutes?: number;
  workedDays?: number;
  restDays?: number;
  averagePresenceMinutes?: number;
}

export interface HrRotationMetrics {
  weeklyMinutes?: number;
  averageWeeklyMinutes?: number;
  workedDays?: number;
  restDays?: number;
  averagePresenceMinutes?: number;
  weeklyHoursMinutesAverage?: number;
  workedDaysAverage?: number;
  restDaysAverage?: number;
  averageDailyPresenceMinutes?: number;
  weeks?: Array<{ weekIndex: number; totalMinutes: number; workedDays: number; restDays: number; averagePresenceMinutes?: number }>;
}

export interface HrRotationAssignment {
  id: string;
  collaboratorId?: string;
  employeeId?: string;
  rotationId?: string;
  startDate?: string | null;
  endDate?: string | null;
  collaborator?: HrCollaborator | null;
  employee?: HrCollaborator | null;
  rotation?: HrRotation | null;
}

export interface HrRotation {
  id: string;
  name: string;
  description?: string | null;
  departmentId?: string | null;
  serviceId?: string | null;
  department?: HrDepartment | null;
  service?: HrDepartment | null;
  cycleWeeks: number;
  cycle?: { weeks?: Array<HrRotationWeek & { weekNumber?: number }> } | null;
  weeks?: HrRotationWeek[];
  days?: HrRotationDay[];
  assignments?: HrRotationAssignment[];
  activeAssignments?: HrRotationAssignment[];
  metrics?: HrRotationMetrics;
  isArchived?: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface HrRotationPayload {
  name: string;
  description?: string;
  departmentId?: string | null;
  cycleWeeks: number;
  weeks: HrRotationWeek[];
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
  birthDate?: string | null;
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
  user?: CoreUser | null;
  manager?: HrCollaborator | null;
  activeRotationAssignment?: HrRotationAssignment | null;
  rotationAssignment?: HrRotationAssignment | null;
  activeRotation?: HrRotation | null;
  /** @deprecated Champs plats – utiliser activeContract */
  contractType?: string | null;
  /** @deprecated Champs plats – utiliser activeContract */
  contractEndDate?: string | null;
  /** @deprecated Champs plats – utiliser activeContract */
  trialEndDate?: string | null;
  /** @deprecated Champs plats – utiliser activeContract */
  contractWeeklyMinutes?: number | null;
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
  birthDate?: string;
  hireDate: string;
  departmentId: string;
  positionId: string;
  secondaryPositionIds?: string[];
  siteId?: string;
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
  hourlyRate?: number | null;
  currency?: string;
  rateEffectiveDate?: string;
  nextReviewDate?: string;
  reviewFrequency?: string;
}

export interface HrReferencePayload {
  name: string;
  description?: string;
  departmentId?: string | null;
}

export interface HrSummary {
  counts: {
    collaborators: number;
    departments: number;
    positions: number;
    linkedCollaborators: number;
    activeRotations?: number;
    collaboratorsWithRotation?: number;
    collaboratorsWithoutRotation?: number;
    averageWeeklyRotationMinutes?: number;
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

export type PlanningAlertLevel = 'critique' | 'attention' | 'information' | 'critical' | 'warning' | 'info';

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
  lines?: Array<Partial<PlanningAssignment> & { dayOfWeek?: number; requiredCount?: number; label?: string }>;
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

export type PlanningPeriodStatusCode = 'DRAFT' | 'CONTROLLED' | 'PUBLISHED' | 'MODIFIED_AFTER_PUBLICATION' | 'LOCKED';

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
  overtimeMinutes?: number;
  overtimeHours?: number;
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
  rotations?: HrRotation[];
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
  planning?: { month?: Record<string, any>; assignmentsByDate?: Record<string, PlanningAssignment[]>; periodStatus?: PlanningPeriodStatus };
  settings?: Record<string, any>;
  attendance?: Record<string, any>;
  periodStatus?: PlanningPeriodStatus;
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
  stats?: { products?: number; sectors?: number; markets?: number; lastQuotationDate?: string | null };
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
    nodes: Array<{ id: string; label: string; type: 'system' | 'module' | 'table' | 'entity'; module?: string }>;
    edges: Array<{ id: string; source: string; target: string; type: 'ownership' | 'consumption' | 'relation' | 'dependency'; label: string }>;
  };
  roadmap: Array<{ module: string; status: string; active?: boolean; note?: string; description?: string }>;
  documentation: ArchitectureDocumentationPage[];
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
  averagePrice?: string | number | null;
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

export type TechnicalSheetRecipeStatus = 'DRAFT' | 'ACTIVE' | 'VALIDATED' | 'ARCHIVED' | string;

export interface TechnicalSheetIngredientLine {
  id?: string;
  recipeId?: string;
  productId: string;
  product?: Product | null;
  unitId: string;
  unit?: Unit | null;
  quantity: number | string;
  comment?: string | null;
  allergens?: TechnicalSheetAllergen[];
  allergenIds?: string[];
  cost?: number | string | null;
  costTotal?: number | string | null;
  isCalculable?: boolean;
  nonCalculableReason?: string | null;
}

export interface TechnicalSheetStep {
  id?: string;
  order: number;
  title?: string | null;
  description?: string | null;
  estimatedTimeMinutes?: number | string | null;
}

export interface TechnicalSheetRecipe {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  category?: TechnicalSheetCategory | null;
  photoUrl?: string | null;
  photoDataUrl?: string | null;
  referencePortions?: number | string | null;
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
  lastCostCalculationAt?: string | null;
  hasNonCalculableLines?: boolean;
  nonCalculableLinesCount?: number;
  duplicatedFromId?: string | null;
  author?: { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  createdBy?: { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
  archivedAt?: string | null;
}

export interface TechnicalSheetRecipePayload {
  name: string;
  description?: string;
  categoryId?: string;
  photoUrl?: string;
  photoDataUrl?: string;
  referencePortions: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  status?: TechnicalSheetRecipeStatus;
  ingredients?: Array<{
    id?: string;
    productId: string;
    quantity: number;
    unitId: string;
    comment?: string;
    allergenIds?: string[];
  }>;
  steps?: Array<{
    id?: string;
    order: number;
    title?: string;
    description?: string;
    estimatedTimeMinutes?: number;
  }>;
}

export interface TechnicalSheetRecipesResponse {
  items: TechnicalSheetRecipe[];
  total?: number;
  page?: number;
  pageSize?: number;
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
  user?: { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
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
}

export type MenuStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';
export type MenuServiceType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK' | 'EVENT' | 'BUFFET';
export type MenuSection = 'STARTER' | 'MAIN' | 'SIDE' | 'CHEESE' | 'DESSERT' | 'DRINK' | 'OTHER';
export type MenuCalendarView = 'day' | 'week' | 'month' | 'year';

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
  technicalSheetId: string;
  technicalSheet?: TechnicalSheetRecipe | null;
  portionsMultiplier?: number | string | null;
  order?: number | null;
}

export interface MenuItemPayload {
  section: MenuSection;
  technicalSheetId: string;
  portionsMultiplier?: number;
  order?: number;
  portionsOverride?: number;
  notes?: string;
}

export interface MenuVariant {
  id: string;
  name?: string | null;
  dietId?: string | null;
  diet?: MenuDiet | null;
  type?: 'DERIVED' | 'FULL_MENU' | string;
  guestCount?: number | null;
  replacements?: Array<{ sourceTechnicalSheetId: string; replacementTechnicalSheetId: string; section?: MenuSection }>;
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
  count: number;
}

export interface MenuPlan {
  id: string;
  name: string;
  date: string;
  service: MenuServiceType;
  siteId?: string | null;
  site?: Site | null;
  description?: string | null;
  expectedGuests?: number | string | null;
  guestCount?: number | string | null;
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
  productionGenerationMode?: 'DETAILED' | 'GROUPED' | string | null;
  productionLinks?: Array<{ id: string; productionOrderId?: string; mode?: string }>;
  cycleId?: string | null;
  cycle?: MenuCycle | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface MenuPlanPayload {
  name: string;
  date: string;
  service: MenuServiceType;
  siteId?: string;
  description?: string;
  expectedGuests?: number;
  items?: MenuItemPayload[];
  guestForecasts?: Array<{ guestGroupId: string; dietId?: string; count: number }>;
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
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuCyclePayload {
  name: string;
  description?: string;
  durationWeeks: number;
  siteId?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
}

export interface MenuProductionGenerationPayload {
  mode: 'DETAILED' | 'GROUPED';
  confirmRegeneration?: boolean;
}

export interface MenuProductionGenerationResult {
  createdOrdersCount?: number;
  orders?: ProductionOrder[];
  productionOrderIds?: string[];
  mode?: 'DETAILED' | 'GROUPED' | string;
}

export interface MenuExportPayload {
  menuId?: string;
  cycleId?: string;
  kind: 'KITCHEN' | 'DINING_ROOM' | 'RESIDENTS' | 'PATIENTS' | 'PUBLIC_DISPLAY' | 'EXCEL';
  format: 'PDF' | 'XLSX' | 'CSV' | 'PRINT';
  fromDate?: string;
  toDate?: string;
}

export interface MenuExport {
  id: string;
  menuId?: string | null;
  menu?: MenuPlan | null;
  cycleId?: string | null;
  cycle?: MenuCycle | null;
  kind: string;
  format: string;
  createdAt?: string;
  fileUrl?: string | null;
}

export interface MenuHistoryEntry {
  id: string;
  action: string;
  context?: string | null;
  summary?: string | null;
  createdAt?: string;
  user?: { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  menu?: { id?: string; name?: string | null } | null;
  cycle?: { id?: string; name?: string | null } | null;
}

export interface Site {
  id: string;
  name: string;
  description?: string | null;
  isMain?: boolean;
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

export type OcrMatchingStatus = 'RECOGNIZED' | 'NEEDS_REVIEW' | 'NOT_FOUND';
export type StocksOcrLineStatus = 'ready' | 'needs_review' | 'missing_product' | 'price_mismatch' | 'quantity_suspicious' | 'non_product_line' | 'duplicate_line' | string;

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
  quantity?: number | string | null;
  unit?: string | null;
  unitId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  suggestedCategoryId?: string | null;
  suggestedCategoryName?: string | null;
  productId?: string | null;
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
  productCandidates?: Array<{ id: string; name: string; sku?: string | null; categoryId?: string | null; categoryName?: string | null; unitId?: string | null; unitSymbol?: string | null; supplierId?: string | null; supplierName?: string | null; score: number | string }>;
}

export interface StocksOcrReceptionData {
  supplierName?: string | null;
  supplier?: {
    name?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    matchingStatus?: OcrMatchingStatus | string;
    matchingScore?: number | string | null;
    candidates?: Array<{ id: string; name: string; score: number | string }>;
  } | null;
  supplierId?: string | null;
  supplierMatchingStatus?: OcrMatchingStatus | string;
  supplierMatchingScore?: number | string | null;
  supplierCandidates?: Array<{ id: string; name: string; score: number | string }>;
  invoiceNumber?: string | null;
  deliveryNoteNumber?: string | null;
  purchaseOrderNumber?: string | null;
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
    extractions?: Array<{ id: string; status: string; extractedJson?: StocksOcrReceptionData; correctedJson?: StocksOcrReceptionData | null }>;
  } | null;
  extraction?: { id: string; status: string; extractedJson?: StocksOcrReceptionData; correctedJson?: StocksOcrReceptionData | null } | null;
  state: string;
}

export interface StockReception {
  id: string;
  status: string;
  supplierName?: string | null;
  invoiceNumber?: string | null;
  deliveryNoteNumber?: string | null;
  lines?: Array<{ id: string; product?: Product | null; quantity?: string | number | null; movements?: StockMovement[] }>;
}

export interface InventoryLine {
  id: string;
  productId: string;
  product: Product;
  countedQuantity?: string | number | null;
  theoreticalQuantity?: string | number | null;
  variance?: string | number | null;
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

export type ProductionOrderStatus = 'PLANNED' | 'VALIDATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ProductionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type ProductionMaterialStatus = 'OK' | 'POTENTIAL_SHORTAGE' | 'INSUFFICIENT_STOCK' | 'PRODUCT_ARCHIVED' | 'UNIT_NOT_CONVERTIBLE' | 'STOCK_UNKNOWN';
export type ProductionAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type ProductionAlertCode = 'NOT_STARTED' | 'LATE' | 'MISSING_MATERIAL' | 'STAFFING_SHORTAGE' | 'UNASSIGNED_COLLABORATOR' | 'NO_RESPONSIBLE' | 'DESTOCKING_PENDING' | 'QUALITY_CONTROL_MISSING' | 'ABSENT_COLLABORATOR' | 'QUANTITY_VARIANCE' | 'UNIT_NOT_CONVERTIBLE' | 'PRODUCT_ARCHIVED' | 'STOCK_UNKNOWN';
export type ProductionHistoryAction = 'CREATED' | 'UPDATED' | 'VALIDATED' | 'CANCELLED' | 'STATUS_CHANGED' | 'ASSIGNMENT_ADDED' | 'ASSIGNMENT_REMOVED' | 'ALERT_OVERRIDE_CONFIRMED' | 'DESTOCKING_PROPOSED' | 'DESTOCKING_CONFIRMED' | 'EXPORT_GENERATED' | 'REALIZATION_CLOSED' | 'QUALITY_CONTROL_UPDATED' | 'REALIZED_PORTIONS_UPDATED';
export type ProductionExportFormat = 'PDF' | 'EXCEL' | 'PRINT';
export type ProductionExportType = 'PRODUCTION_SHEET' | 'MATERIAL_REQUIREMENTS' | 'TEAM_ASSIGNMENTS';
export type ProductionDestockingStatus = 'PROPOSED' | 'CONFIRMED' | 'CANCELLED';

export interface ProductionQuery {
  search?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  serviceId?: string;
  orderId?: string;
  employeeId?: string;
  status?: ProductionOrderStatus;
  page?: number;
  pageSize?: number;
}

export interface ProductionOrderPayload {
  technicalSheetId: string;
  name?: string;
  productionDate: string;
  plannedTime: string;
  plannedPortions: number;
  serviceId?: string;
  responsibleEmployeeId?: string;
  priority?: ProductionPriority;
  comments?: string;
}

export type ProductionOrderUpdatePayload = Partial<Omit<ProductionOrderPayload, 'technicalSheetId'>>;

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
  requestedBy?: { email?: string | null; firstName?: string | null; lastName?: string | null } | null;
  order?: ProductionOrder | null;
}

export interface ProductionOrder {
  id: string;
  number: string;
  name: string;
  technicalSheetId: string;
  productionDate: string;
  plannedTime: string;
  status: ProductionOrderStatus;
  priority: ProductionPriority;
  enrichedPriority?: ProductionPriority;
  serviceId?: string | null;
  responsibleEmployeeId?: string | null;
  plannedPortions: number | string;
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
  service?: HrDepartment | null;
  responsibleEmployee?: HrCollaborator | null;
  requirements: ProductionMaterialRequirement[];
  assignments: ProductionAssignment[];
  alerts: ProductionAlert[];
  realization?: ProductionRealization | null;
  destockingProposals?: ProductionDestockingProposal[];
  history?: ProductionHistoryEntry[];
  exports?: ProductionExport[];
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
