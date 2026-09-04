-- CreateEnum
CREATE TYPE "TechnicalSheetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'VALIDATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TechnicalSheetHistoryAction" AS ENUM ('CREATED', 'GENERAL_UPDATED', 'INGREDIENTS_UPDATED', 'ALLERGENS_UPDATED', 'STEPS_UPDATED', 'COST_RECALCULATED', 'DUPLICATED', 'ARCHIVED', 'STATUS_CHANGED', 'SIMULATION_CREATED', 'EXPORT_CREATED');

-- CreateEnum
CREATE TYPE "TechnicalSheetExportFormat" AS ENUM ('PDF', 'CSV', 'PRINT');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PLANNED', 'VALIDATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ProductionMaterialStatus" AS ENUM ('OK', 'POTENTIAL_SHORTAGE', 'INSUFFICIENT_STOCK', 'PRODUCT_ARCHIVED', 'UNIT_NOT_CONVERTIBLE', 'STOCK_UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductionAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProductionAlertCode" AS ENUM ('NOT_STARTED', 'LATE', 'MISSING_MATERIAL', 'STAFFING_SHORTAGE', 'UNASSIGNED_COLLABORATOR', 'NO_RESPONSIBLE', 'DESTOCKING_PENDING', 'QUALITY_CONTROL_MISSING', 'ABSENT_COLLABORATOR', 'QUANTITY_VARIANCE', 'UNIT_NOT_CONVERTIBLE', 'PRODUCT_ARCHIVED', 'STOCK_UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductionHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'VALIDATED', 'CANCELLED', 'STATUS_CHANGED', 'ASSIGNMENT_ADDED', 'ASSIGNMENT_REMOVED', 'ALERT_OVERRIDE_CONFIRMED', 'DESTOCKING_PROPOSED', 'DESTOCKING_CONFIRMED', 'EXPORT_GENERATED', 'REALIZATION_CLOSED', 'QUALITY_CONTROL_UPDATED', 'REALIZED_PORTIONS_UPDATED');

-- CreateEnum
CREATE TYPE "ProductionExportFormat" AS ENUM ('PDF', 'EXCEL', 'PRINT');

-- CreateEnum
CREATE TYPE "ProductionExportType" AS ENUM ('PRODUCTION_SHEET', 'MATERIAL_REQUIREMENTS', 'TEAM_ASSIGNMENTS');

-- CreateEnum
CREATE TYPE "ProductionDestockingStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MenuServiceType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'EVENT', 'BUFFET');

-- CreateEnum
CREATE TYPE "MenuSectionType" AS ENUM ('STARTER', 'MAIN', 'SIDE', 'CHEESE', 'DESSERT', 'DRINK', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuCycleStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MenuVariantMode" AS ENUM ('DERIVED', 'COMPLETE');

-- CreateEnum
CREATE TYPE "MenuGuestGroupType" AS ENUM ('RESIDENTS', 'PATIENTS', 'STUDENTS', 'CLIENTS', 'STAFF', 'GUESTS', 'OTHER');

-- CreateEnum
CREATE TYPE "MenuProductionGenerationMode" AS ENUM ('DETAILED', 'GROUPED');

-- CreateEnum
CREATE TYPE "MenuExportFormat" AS ENUM ('PDF', 'EXCEL', 'PRINT');

-- CreateEnum
CREATE TYPE "MenuExportAudience" AS ENUM ('KITCHEN', 'DINING_ROOM', 'RESIDENTS', 'PATIENTS', 'PUBLIC_DISPLAY');

-- CreateEnum
CREATE TYPE "MenuHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'VALIDATED', 'PUBLISHED', 'ARCHIVED', 'PRODUCTION_GENERATED', 'EXPORT_GENERATED', 'CYCLE_REPLICATED', 'MANUAL_RESYNC', 'GUESTS_UPDATED', 'VARIANTS_UPDATED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('MASS', 'VOLUME', 'COUNT', 'PACKAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'CORRECTION', 'INVENTORY', 'PRODUCTION', 'LOSS', 'TRANSFER', 'RECEPTION');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('DRAFT', 'VALIDATED');

-- CreateEnum
CREATE TYPE "HrEmployeeStatus" AS ENUM ('ACTIVE', 'ABSENT', 'SUSPENDED', 'DEPARTED');

-- CreateEnum
CREATE TYPE "HrHistoryEventType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'DEPARTMENT_CHANGED', 'POSITION_CHANGED', 'USER_LINKED', 'USER_UNLINKED', 'MANAGER_CHANGED', 'ROTATION_ASSIGNED', 'ROTATION_REMOVED', 'ROTATION_CHANGED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HrRotationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HrAbsenceType" AS ENUM ('CONGE', 'RTT', 'MALADIE', 'FORMATION', 'ACCIDENT', 'EXCEPTIONNELLE', 'REPOS', 'AUTRE');

-- CreateEnum
CREATE TYPE "HrAbsenceStatus" AS ENUM ('DRAFT', 'REQUESTED', 'PENDING', 'APPROVED', 'REFUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanningAssignmentStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'MODIFIED', 'CANCELLED', 'REPLACED');

-- CreateEnum
CREATE TYPE "PlanningAssignmentOrigin" AS ENUM ('MANUAL', 'AUTO_GENERATION', 'TEMPLATE', 'REPLACEMENT', 'DRAG_DROP');

-- CreateEnum
CREATE TYPE "PlanningReplacementStatus" AS ENUM ('TO_PROCESS', 'PROPOSED', 'ACCEPTED', 'REFUSED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanningNeedPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PlanningConflictSeverity" AS ENUM ('BLOCKING', 'STRONG_WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "PlanningNotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "PlanningHistoryAction" AS ENUM ('PLANNING_CREATED', 'ASSIGNMENT_ADDED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_MOVED', 'ASSIGNMENT_DELETED', 'ABSENCE_IMPACT', 'REPLACEMENT_PROPOSED', 'REPLACEMENT_DONE', 'TEMPLATE_APPLIED', 'GENERATION_STARTED', 'GENERATION_APPLIED', 'CONFLICT_IGNORED', 'EXPORT_GENERATED', 'NOTIFICATION_CREATED');

-- CreateEnum
CREATE TYPE "PlanningExportFormat" AS ENUM ('PDF', 'EXCEL', 'PRINT');

-- CreateEnum
CREATE TYPE "PlanningExportScope" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('MODULE_HR_INSTALLED', 'MODULE_HR_UNINSTALLED', 'MODULE_STOCKS_INSTALLED', 'MODULE_STOCKS_UNINSTALLED', 'MODULE_RNM_PRICES_INSTALLED', 'MODULE_RNM_PRICES_UNINSTALLED', 'CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_ARCHIVED', 'UNIT_CREATED', 'UNIT_UPDATED', 'UNIT_ARCHIVED', 'SUPPLIER_CREATED', 'SUPPLIER_UPDATED', 'SUPPLIER_ARCHIVED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_ARCHIVED', 'SITE_CREATED', 'SITE_UPDATED', 'SITE_ARCHIVED', 'LOCATION_CREATED', 'LOCATION_UPDATED', 'LOCATION_ARCHIVED', 'LOT_CREATED', 'LOT_UPDATED', 'MOVEMENT_CREATED', 'TRANSFER_CREATED', 'INVENTORY_CREATED', 'INVENTORY_UPDATED', 'INVENTORY_VALIDATED', 'PLANNING_MODULE_INSTALLED', 'PLANNING_MODULE_UNINSTALLED', 'MODULE_TECHNICAL_SHEETS_INSTALLED', 'MODULE_TECHNICAL_SHEETS_UNINSTALLED', 'MODULE_PRODUCTION_INSTALLED', 'MODULE_PRODUCTION_UNINSTALLED', 'MODULE_MENUS_INSTALLED', 'MODULE_MENUS_UNINSTALLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "establishmentType" TEXT,
    "teamSize" TEXT,
    "logoDataUrl" TEXT,
    "mainSiteName" TEXT,
    "stocksInstalledAt" TIMESTAMP(3),
    "rnmPricesInstalledAt" TIMESTAMP(3),
    "hrInstalledAt" TIMESTAMP(3),
    "planningInstalledAt" TIMESTAMP(3),
    "technicalSheetsInstalledAt" TIMESTAMP(3),
    "productionInstalledAt" TIMESTAMP(3),
    "menusInstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimaryAdmin" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "organizationId" UUID,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "dashboard_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "layout" JSONB NOT NULL,
    "hiddenWidgetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinnedWidgetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "UnitType" NOT NULL DEFAULT 'OTHER',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_conversions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fromUnitId" UUID NOT NULL,
    "toUnitId" UUID NOT NULL,
    "factor" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "averagePrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "minimumStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "unitId" UUID NOT NULL,
    "primarySupplierId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" UUID NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "supplierId" UUID,
    "organizationId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "siteId" UUID,
    "locationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotId" UUID,
    "siteId" UUID,
    "locationId" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotId" UUID,
    "supplierId" UUID,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "inputQuantity" DECIMAL(12,3),
    "unitId" UUID,
    "unitSymbolSnapshot" TEXT,
    "reason" TEXT,
    "sourceSiteId" UUID,
    "sourceLocationId" UUID,
    "destinationSiteId" UUID,
    "destinationLocationId" UUID,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "inventoryId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "inventoryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "siteId" UUID,
    "locationId" UUID,
    "status" "InventoryStatus" NOT NULL DEFAULT 'DRAFT',
    "validatedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lines" (
    "id" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lotId" UUID,
    "theoreticalQuantity" DECIMAL(12,3) NOT NULL,
    "countedQuantity" DECIMAL(12,3),
    "varianceQuantity" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rnm_product_favorites" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rnmProductId" TEXT NOT NULL,
    "productName" TEXT,
    "category" TEXT,
    "sector" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rnm_product_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_positions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "organizationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employees" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "photoDataUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "hireDate" TIMESTAMP(3) NOT NULL,
    "departmentId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "mainSiteId" UUID,
    "employeeNumber" TEXT,
    "notes" TEXT,
    "status" "HrEmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" UUID,
    "managerId" UUID,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "userId" UUID,
    "type" "HrHistoryEventType" NOT NULL,
    "label" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_rotations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" UUID,
    "cycleLengthWeeks" INTEGER NOT NULL DEFAULT 1,
    "cycle" JSONB NOT NULL,
    "weeklyHoursMinutesAverage" INTEGER NOT NULL DEFAULT 0,
    "weeklyPresenceMinutesAverage" INTEGER NOT NULL DEFAULT 0,
    "workedDaysAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "restDaysAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageDailyPresenceMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "HrRotationStatus" NOT NULL DEFAULT 'ACTIVE',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_rotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_rotation_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rotationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdById" UUID,
    "endedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_rotation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_skills" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_skills" (
    "employeeId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_skills_pkey" PRIMARY KEY ("employeeId","skillId")
);

-- CreateTable
CREATE TABLE "hr_position_skills" (
    "positionId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hr_position_skills_pkey" PRIMARY KEY ("positionId","skillId")
);

-- CreateTable
CREATE TABLE "hr_department_skills" (
    "departmentId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "hr_department_skills_pkey" PRIMARY KEY ("departmentId","skillId")
);

-- CreateTable
CREATE TABLE "hr_absences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "type" "HrAbsenceType" NOT NULL,
    "status" "HrAbsenceStatus" NOT NULL DEFAULT 'REQUESTED',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "validatorId" UUID,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "siteId" UUID,
    "rotationId" UUID,
    "absenceId" UUID,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "PlanningAssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "origin" "PlanningAssignmentOrigin" NOT NULL DEFAULT 'MANUAL',
    "comment" TEXT,
    "allowCriticalOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_replacements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignmentId" UUID,
    "absenceId" UUID,
    "absentEmployeeId" UUID NOT NULL,
    "replacementEmployeeId" UUID,
    "status" "PlanningReplacementStatus" NOT NULL DEFAULT 'TO_PROCESS',
    "score" INTEGER NOT NULL DEFAULT 0,
    "rationale" JSONB,
    "requestedById" UUID,
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_operational_needs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "siteId" UUID,
    "positionId" UUID,
    "requiredSkillId" UUID,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "requiredCount" INTEGER NOT NULL,
    "priority" "PlanningNeedPriority" NOT NULL DEFAULT 'NORMAL',
    "comment" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_operational_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_templates" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "periodType" TEXT NOT NULL,
    "departmentId" UUID,
    "siteId" UUID,
    "content" JSONB NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_template_applications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "siteId" UUID,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "preview" JSONB,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "appliedById" UUID,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_template_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_generations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "siteId" UUID,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "parameters" JSONB,
    "preview" JSONB NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "launchedById" UUID,
    "appliedById" UUID,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_conflicts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignmentId" UUID,
    "severity" "PlanningConflictSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_notifications" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recipientUserId" UUID,
    "recipientEmployeeId" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "PlanningNotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorUserId" UUID,
    "action" "PlanningHistoryAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "label" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "archivedPeriod" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_exports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestedById" UUID,
    "format" "PlanningExportFormat" NOT NULL,
    "scope" "PlanningExportScope" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "siteId" UUID,
    "departmentId" UUID,
    "employeeId" UUID,
    "filters" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_view_preferences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "employeeId" UUID,
    "view" TEXT NOT NULL,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_view_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_sheet_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "sourceTechnicalSheetId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "photoUrl" TEXT,
    "photoDataUrl" TEXT,
    "referencePortions" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "preparationTimeMinutes" INTEGER DEFAULT 0,
    "cookingTimeMinutes" INTEGER DEFAULT 0,
    "totalTimeMinutes" INTEGER DEFAULT 0,
    "status" "TechnicalSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "costPerPortion" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "costPerKg" DECIMAL(12,4),
    "costPerLiter" DECIMAL(12,4),
    "hasNonCalculableLines" BOOLEAN NOT NULL DEFAULT false,
    "lastCostCalculationAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_ingredients" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "comment" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "unitPriceSnapshot" DECIMAL(12,4),
    "cost" DECIMAL(12,4),
    "isCalculable" BOOLEAN NOT NULL DEFAULT true,
    "nonCalculableReason" TEXT,
    "productNameSnapshot" TEXT,
    "unitSymbolSnapshot" TEXT,
    "productUnitIdSnapshot" UUID,
    "productUnitSymbolSnapshot" TEXT,
    "productArchivedSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_sheet_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_steps" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_sheet_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_allergens" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_sheet_allergens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_ingredient_allergens" (
    "ingredientId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "technical_sheet_ingredient_allergens_pkey" PRIMARY KEY ("ingredientId","allergenId")
);

-- CreateTable
CREATE TABLE "technical_sheet_cost_snapshots" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "totalCost" DECIMAL(12,4) NOT NULL,
    "costPerPortion" DECIMAL(12,4) NOT NULL,
    "costPerKg" DECIMAL(12,4),
    "costPerLiter" DECIMAL(12,4),
    "hasNonCalculableLines" BOOLEAN NOT NULL DEFAULT false,
    "lineDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_sheet_cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_simulations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "requestedPortions" DECIMAL(12,3) NOT NULL,
    "factor" DECIMAL(12,6) NOT NULL,
    "totalEstimatedCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "hasNonCalculableLines" BOOLEAN NOT NULL DEFAULT false,
    "lines" JSONB NOT NULL,
    "allergenNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_sheet_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_exports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "simulationId" UUID,
    "format" "TechnicalSheetExportFormat" NOT NULL,
    "filename" TEXT NOT NULL,
    "payload" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_sheet_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "userId" UUID,
    "action" "TechnicalSheetHistoryAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_sheet_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "plannedTime" TEXT NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "serviceId" UUID,
    "responsibleEmployeeId" UUID,
    "plannedPortions" DECIMAL(12,3) NOT NULL,
    "realizedPortions" DECIMAL(12,3),
    "estimatedCost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(12,4),
    "comments" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" UUID,
    "updatedById" UUID,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_material_requirements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "technicalSheetIngredientId" UUID,
    "productId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "supplierId" UUID,
    "requiredQuantity" DECIMAL(12,3) NOT NULL,
    "stockAvailable" DECIMAL(12,3),
    "varianceQuantity" DECIMAL(12,3),
    "status" "ProductionMaterialStatus" NOT NULL DEFAULT 'STOCK_UNKNOWN',
    "estimatedCost" DECIMAL(12,4),
    "productNameSnapshot" TEXT NOT NULL,
    "unitSymbolSnapshot" TEXT NOT NULL,
    "supplierNameSnapshot" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_material_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_assignments" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "planningAssignmentId" UUID,
    "mission" TEXT,
    "plannedMinutes" INTEGER,
    "actualMinutes" INTEGER,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_alerts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID,
    "code" "ProductionAlertCode" NOT NULL,
    "severity" "ProductionAlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "production_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_alert_overrides" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "confirmedById" UUID,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_alert_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_realizations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "realizedPortions" DECIMAL(12,3) NOT NULL,
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "losses" DECIMAL(12,3),
    "variance" JSONB,
    "yieldPercent" DECIMAL(7,3),
    "qualityControlDone" BOOLEAN NOT NULL DEFAULT false,
    "qualityControlDetails" JSONB,
    "varianceCauses" TEXT,
    "comments" TEXT,
    "managerValidated" BOOLEAN NOT NULL DEFAULT false,
    "destockingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_realizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_destocking_proposals" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "ProductionDestockingStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" UUID,
    "confirmationNote" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_destocking_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_destocking_lines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "requirementId" UUID,
    "productId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "proposedQuantity" DECIMAL(12,3) NOT NULL,
    "confirmedQuantity" DECIMAL(12,3),
    "productNameSnapshot" TEXT NOT NULL,
    "unitSymbolSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_destocking_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_destocking_movements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_destocking_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID,
    "actorUserId" UUID,
    "action" "ProductionHistoryAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_exports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requestedById" UUID,
    "type" "ProductionExportType" NOT NULL,
    "format" "ProductionExportFormat" NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "serviceId" UUID,
    "orderId" UUID,
    "filename" TEXT NOT NULL,
    "filters" JSONB,
    "snapshot" JSONB NOT NULL,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_diets" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_diets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "service" "MenuServiceType" NOT NULL,
    "siteId" UUID,
    "description" TEXT,
    "expectedGuests" INTEGER NOT NULL DEFAULT 0,
    "status" "MenuStatus" NOT NULL DEFAULT 'DRAFT',
    "cycleId" UUID,
    "cycleWeek" INTEGER,
    "cycleDay" INTEGER,
    "sourceMenuId" UUID,
    "productionGeneratedAt" TIMESTAMP(3),
    "productionDirtySince" TIMESTAMP(3),
    "publishedSnapshot" JSONB,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "section" "MenuSectionType" NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "portionsOverride" DECIMAL(12,3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_variants" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "dietId" UUID NOT NULL,
    "mode" "MenuVariantMode" NOT NULL DEFAULT 'DERIVED',
    "name" TEXT NOT NULL,
    "expectedGuests" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_variant_replacements" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "menuItemId" UUID,
    "section" "MenuSectionType",
    "replacementTechnicalSheetId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_variant_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_guest_groups" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MenuGuestGroupType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_guest_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_guest_forecasts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "guestGroupId" UUID NOT NULL,
    "dietId" UUID,
    "count" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_guest_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_cycles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationWeeks" INTEGER NOT NULL,
    "siteId" UUID,
    "status" "MenuCycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_cycle_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "service" "MenuServiceType" NOT NULL,
    "section" "MenuSectionType" NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_cycle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_production_links" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "menuId" UUID NOT NULL,
    "productionOrderId" UUID NOT NULL,
    "generationMode" "MenuProductionGenerationMode" NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_production_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_exports" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "menuId" UUID,
    "requestedById" UUID,
    "format" "MenuExportFormat" NOT NULL,
    "audience" "MenuExportAudience" NOT NULL,
    "filename" TEXT NOT NULL,
    "filters" JSONB,
    "snapshot" JSONB NOT NULL,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "menuId" UUID,
    "cycleId" UUID,
    "actorUserId" UUID,
    "action" "MenuHistoryAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityName" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_isPrimaryAdmin_idx" ON "users"("isPrimaryAdmin");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "dashboard_preferences_organizationId_idx" ON "dashboard_preferences"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_preferences_userId_organizationId_key" ON "dashboard_preferences"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "categories_organizationId_idx" ON "categories"("organizationId");

-- CreateIndex
CREATE INDEX "categories_isArchived_idx" ON "categories"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organizationId_name_key" ON "categories"("organizationId", "name");

-- CreateIndex
CREATE INDEX "units_organizationId_idx" ON "units"("organizationId");

-- CreateIndex
CREATE INDEX "units_isArchived_idx" ON "units"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "units_organizationId_symbol_key" ON "units"("organizationId", "symbol");

-- CreateIndex
CREATE INDEX "unit_conversions_organizationId_idx" ON "unit_conversions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_conversions_organizationId_fromUnitId_toUnitId_key" ON "unit_conversions"("organizationId", "fromUnitId", "toUnitId");

-- CreateIndex
CREATE INDEX "products_organizationId_idx" ON "products"("organizationId");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_unitId_idx" ON "products"("unitId");

-- CreateIndex
CREATE INDEX "products_primarySupplierId_idx" ON "products"("primarySupplierId");

-- CreateIndex
CREATE INDEX "products_isArchived_idx" ON "products"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "products_organizationId_name_key" ON "products"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_organizationId_sku_key" ON "products"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "suppliers_organizationId_idx" ON "suppliers"("organizationId");

-- CreateIndex
CREATE INDEX "suppliers_isArchived_idx" ON "suppliers"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_organizationId_name_key" ON "suppliers"("organizationId", "name");

-- CreateIndex
CREATE INDEX "sites_organizationId_idx" ON "sites"("organizationId");

-- CreateIndex
CREATE INDEX "sites_isArchived_idx" ON "sites"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "sites_organizationId_name_key" ON "sites"("organizationId", "name");

-- CreateIndex
CREATE INDEX "locations_organizationId_idx" ON "locations"("organizationId");

-- CreateIndex
CREATE INDEX "locations_siteId_idx" ON "locations"("siteId");

-- CreateIndex
CREATE INDEX "locations_isArchived_idx" ON "locations"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organizationId_siteId_name_key" ON "locations"("organizationId", "siteId", "name");

-- CreateIndex
CREATE INDEX "lots_organizationId_idx" ON "lots"("organizationId");

-- CreateIndex
CREATE INDEX "lots_productId_idx" ON "lots"("productId");

-- CreateIndex
CREATE INDEX "lots_supplierId_idx" ON "lots"("supplierId");

-- CreateIndex
CREATE INDEX "lots_siteId_idx" ON "lots"("siteId");

-- CreateIndex
CREATE INDEX "lots_locationId_idx" ON "lots"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "lots_organizationId_lotNumber_productId_key" ON "lots"("organizationId", "lotNumber", "productId");

-- CreateIndex
CREATE INDEX "stocks_organizationId_idx" ON "stocks"("organizationId");

-- CreateIndex
CREATE INDEX "stocks_productId_idx" ON "stocks"("productId");

-- CreateIndex
CREATE INDEX "stocks_lotId_idx" ON "stocks"("lotId");

-- CreateIndex
CREATE INDEX "stocks_siteId_idx" ON "stocks"("siteId");

-- CreateIndex
CREATE INDEX "stocks_locationId_idx" ON "stocks"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_organizationId_productId_lotId_siteId_locationId_key" ON "stocks"("organizationId", "productId", "lotId", "siteId", "locationId");

-- CreateIndex
CREATE INDEX "stock_movements_organizationId_idx" ON "stock_movements"("organizationId");

-- CreateIndex
CREATE INDEX "stock_movements_productId_idx" ON "stock_movements"("productId");

-- CreateIndex
CREATE INDEX "stock_movements_lotId_idx" ON "stock_movements"("lotId");

-- CreateIndex
CREATE INDEX "stock_movements_supplierId_idx" ON "stock_movements"("supplierId");

-- CreateIndex
CREATE INDEX "stock_movements_sourceSiteId_idx" ON "stock_movements"("sourceSiteId");

-- CreateIndex
CREATE INDEX "stock_movements_sourceLocationId_idx" ON "stock_movements"("sourceLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_destinationSiteId_idx" ON "stock_movements"("destinationSiteId");

-- CreateIndex
CREATE INDEX "stock_movements_destinationLocationId_idx" ON "stock_movements"("destinationLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_createdAt_idx" ON "stock_movements"("createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_movementDate_idx" ON "stock_movements"("movementDate");

-- CreateIndex
CREATE INDEX "inventories_organizationId_idx" ON "inventories"("organizationId");

-- CreateIndex
CREATE INDEX "inventories_status_idx" ON "inventories"("status");

-- CreateIndex
CREATE INDEX "inventories_inventoryDate_idx" ON "inventories"("inventoryDate");

-- CreateIndex
CREATE INDEX "inventory_lines_inventoryId_idx" ON "inventory_lines"("inventoryId");

-- CreateIndex
CREATE INDEX "inventory_lines_productId_idx" ON "inventory_lines"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lines_inventoryId_productId_lotId_key" ON "inventory_lines"("inventoryId", "productId", "lotId");

-- CreateIndex
CREATE INDEX "rnm_product_favorites_organizationId_idx" ON "rnm_product_favorites"("organizationId");

-- CreateIndex
CREATE INDEX "rnm_product_favorites_userId_idx" ON "rnm_product_favorites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rnm_product_favorites_userId_rnmProductId_key" ON "rnm_product_favorites"("userId", "rnmProductId");

-- CreateIndex
CREATE INDEX "hr_departments_organizationId_idx" ON "hr_departments"("organizationId");

-- CreateIndex
CREATE INDEX "hr_departments_isArchived_idx" ON "hr_departments"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "hr_departments_organizationId_name_key" ON "hr_departments"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hr_positions_organizationId_idx" ON "hr_positions"("organizationId");

-- CreateIndex
CREATE INDEX "hr_positions_isArchived_idx" ON "hr_positions"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "hr_positions_organizationId_name_key" ON "hr_positions"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employees_userId_key" ON "hr_employees"("userId");

-- CreateIndex
CREATE INDEX "hr_employees_organizationId_idx" ON "hr_employees"("organizationId");

-- CreateIndex
CREATE INDEX "hr_employees_departmentId_idx" ON "hr_employees"("departmentId");

-- CreateIndex
CREATE INDEX "hr_employees_positionId_idx" ON "hr_employees"("positionId");

-- CreateIndex
CREATE INDEX "hr_employees_mainSiteId_idx" ON "hr_employees"("mainSiteId");

-- CreateIndex
CREATE INDEX "hr_employees_managerId_idx" ON "hr_employees"("managerId");

-- CreateIndex
CREATE INDEX "hr_employees_status_idx" ON "hr_employees"("status");

-- CreateIndex
CREATE INDEX "hr_employees_isArchived_idx" ON "hr_employees"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employees_organizationId_email_key" ON "hr_employees"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "hr_employees_organizationId_employeeNumber_key" ON "hr_employees"("organizationId", "employeeNumber");

-- CreateIndex
CREATE INDEX "hr_employee_history_organizationId_idx" ON "hr_employee_history"("organizationId");

-- CreateIndex
CREATE INDEX "hr_employee_history_employeeId_idx" ON "hr_employee_history"("employeeId");

-- CreateIndex
CREATE INDEX "hr_employee_history_userId_idx" ON "hr_employee_history"("userId");

-- CreateIndex
CREATE INDEX "hr_employee_history_type_idx" ON "hr_employee_history"("type");

-- CreateIndex
CREATE INDEX "hr_employee_history_createdAt_idx" ON "hr_employee_history"("createdAt");

-- CreateIndex
CREATE INDEX "hr_rotations_organizationId_idx" ON "hr_rotations"("organizationId");

-- CreateIndex
CREATE INDEX "hr_rotations_departmentId_idx" ON "hr_rotations"("departmentId");

-- CreateIndex
CREATE INDEX "hr_rotations_status_idx" ON "hr_rotations"("status");

-- CreateIndex
CREATE INDEX "hr_rotations_isArchived_idx" ON "hr_rotations"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "hr_rotations_organizationId_name_key" ON "hr_rotations"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hr_rotation_assignments_organizationId_idx" ON "hr_rotation_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "hr_rotation_assignments_rotationId_idx" ON "hr_rotation_assignments"("rotationId");

-- CreateIndex
CREATE INDEX "hr_rotation_assignments_employeeId_idx" ON "hr_rotation_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "hr_rotation_assignments_endDate_idx" ON "hr_rotation_assignments"("endDate");

-- CreateIndex
CREATE INDEX "hr_skills_organizationId_idx" ON "hr_skills"("organizationId");

-- CreateIndex
CREATE INDEX "hr_skills_isArchived_idx" ON "hr_skills"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "hr_skills_organizationId_name_key" ON "hr_skills"("organizationId", "name");

-- CreateIndex
CREATE INDEX "hr_employee_skills_skillId_idx" ON "hr_employee_skills"("skillId");

-- CreateIndex
CREATE INDEX "hr_position_skills_skillId_idx" ON "hr_position_skills"("skillId");

-- CreateIndex
CREATE INDEX "hr_department_skills_skillId_idx" ON "hr_department_skills"("skillId");

-- CreateIndex
CREATE INDEX "hr_absences_organizationId_idx" ON "hr_absences"("organizationId");

-- CreateIndex
CREATE INDEX "hr_absences_employeeId_idx" ON "hr_absences"("employeeId");

-- CreateIndex
CREATE INDEX "hr_absences_type_idx" ON "hr_absences"("type");

-- CreateIndex
CREATE INDEX "hr_absences_status_idx" ON "hr_absences"("status");

-- CreateIndex
CREATE INDEX "hr_absences_startDate_idx" ON "hr_absences"("startDate");

-- CreateIndex
CREATE INDEX "hr_absences_endDate_idx" ON "hr_absences"("endDate");

-- CreateIndex
CREATE INDEX "planning_assignments_organizationId_idx" ON "planning_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "planning_assignments_employeeId_idx" ON "planning_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "planning_assignments_departmentId_idx" ON "planning_assignments"("departmentId");

-- CreateIndex
CREATE INDEX "planning_assignments_positionId_idx" ON "planning_assignments"("positionId");

-- CreateIndex
CREATE INDEX "planning_assignments_siteId_idx" ON "planning_assignments"("siteId");

-- CreateIndex
CREATE INDEX "planning_assignments_date_idx" ON "planning_assignments"("date");

-- CreateIndex
CREATE INDEX "planning_assignments_startTime_idx" ON "planning_assignments"("startTime");

-- CreateIndex
CREATE INDEX "planning_assignments_endTime_idx" ON "planning_assignments"("endTime");

-- CreateIndex
CREATE INDEX "planning_assignments_status_idx" ON "planning_assignments"("status");

-- CreateIndex
CREATE INDEX "planning_replacements_organizationId_idx" ON "planning_replacements"("organizationId");

-- CreateIndex
CREATE INDEX "planning_replacements_assignmentId_idx" ON "planning_replacements"("assignmentId");

-- CreateIndex
CREATE INDEX "planning_replacements_absenceId_idx" ON "planning_replacements"("absenceId");

-- CreateIndex
CREATE INDEX "planning_replacements_absentEmployeeId_idx" ON "planning_replacements"("absentEmployeeId");

-- CreateIndex
CREATE INDEX "planning_replacements_replacementEmployeeId_idx" ON "planning_replacements"("replacementEmployeeId");

-- CreateIndex
CREATE INDEX "planning_replacements_status_idx" ON "planning_replacements"("status");

-- CreateIndex
CREATE INDEX "planning_operational_needs_organizationId_idx" ON "planning_operational_needs"("organizationId");

-- CreateIndex
CREATE INDEX "planning_operational_needs_departmentId_idx" ON "planning_operational_needs"("departmentId");

-- CreateIndex
CREATE INDEX "planning_operational_needs_siteId_idx" ON "planning_operational_needs"("siteId");

-- CreateIndex
CREATE INDEX "planning_operational_needs_positionId_idx" ON "planning_operational_needs"("positionId");

-- CreateIndex
CREATE INDEX "planning_operational_needs_requiredSkillId_idx" ON "planning_operational_needs"("requiredSkillId");

-- CreateIndex
CREATE INDEX "planning_operational_needs_startDate_idx" ON "planning_operational_needs"("startDate");

-- CreateIndex
CREATE INDEX "planning_operational_needs_priority_idx" ON "planning_operational_needs"("priority");

-- CreateIndex
CREATE INDEX "planning_templates_organizationId_idx" ON "planning_templates"("organizationId");

-- CreateIndex
CREATE INDEX "planning_templates_departmentId_idx" ON "planning_templates"("departmentId");

-- CreateIndex
CREATE INDEX "planning_templates_siteId_idx" ON "planning_templates"("siteId");

-- CreateIndex
CREATE INDEX "planning_templates_isArchived_idx" ON "planning_templates"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "planning_templates_organizationId_name_key" ON "planning_templates"("organizationId", "name");

-- CreateIndex
CREATE INDEX "planning_template_applications_organizationId_idx" ON "planning_template_applications"("organizationId");

-- CreateIndex
CREATE INDEX "planning_template_applications_templateId_idx" ON "planning_template_applications"("templateId");

-- CreateIndex
CREATE INDEX "planning_template_applications_siteId_idx" ON "planning_template_applications"("siteId");

-- CreateIndex
CREATE INDEX "planning_template_applications_startDate_idx" ON "planning_template_applications"("startDate");

-- CreateIndex
CREATE INDEX "planning_template_applications_endDate_idx" ON "planning_template_applications"("endDate");

-- CreateIndex
CREATE INDEX "planning_generations_organizationId_idx" ON "planning_generations"("organizationId");

-- CreateIndex
CREATE INDEX "planning_generations_siteId_idx" ON "planning_generations"("siteId");

-- CreateIndex
CREATE INDEX "planning_generations_startDate_idx" ON "planning_generations"("startDate");

-- CreateIndex
CREATE INDEX "planning_generations_endDate_idx" ON "planning_generations"("endDate");

-- CreateIndex
CREATE INDEX "planning_generations_applied_idx" ON "planning_generations"("applied");

-- CreateIndex
CREATE INDEX "planning_conflicts_organizationId_idx" ON "planning_conflicts"("organizationId");

-- CreateIndex
CREATE INDEX "planning_conflicts_assignmentId_idx" ON "planning_conflicts"("assignmentId");

-- CreateIndex
CREATE INDEX "planning_conflicts_severity_idx" ON "planning_conflicts"("severity");

-- CreateIndex
CREATE INDEX "planning_conflicts_code_idx" ON "planning_conflicts"("code");

-- CreateIndex
CREATE INDEX "planning_conflicts_createdAt_idx" ON "planning_conflicts"("createdAt");

-- CreateIndex
CREATE INDEX "planning_notifications_organizationId_idx" ON "planning_notifications"("organizationId");

-- CreateIndex
CREATE INDEX "planning_notifications_recipientUserId_idx" ON "planning_notifications"("recipientUserId");

-- CreateIndex
CREATE INDEX "planning_notifications_recipientEmployeeId_idx" ON "planning_notifications"("recipientEmployeeId");

-- CreateIndex
CREATE INDEX "planning_notifications_status_idx" ON "planning_notifications"("status");

-- CreateIndex
CREATE INDEX "planning_notifications_eventType_idx" ON "planning_notifications"("eventType");

-- CreateIndex
CREATE INDEX "planning_notifications_createdAt_idx" ON "planning_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "planning_history_organizationId_idx" ON "planning_history"("organizationId");

-- CreateIndex
CREATE INDEX "planning_history_actorUserId_idx" ON "planning_history"("actorUserId");

-- CreateIndex
CREATE INDEX "planning_history_action_idx" ON "planning_history"("action");

-- CreateIndex
CREATE INDEX "planning_history_entityType_idx" ON "planning_history"("entityType");

-- CreateIndex
CREATE INDEX "planning_history_isArchived_idx" ON "planning_history"("isArchived");

-- CreateIndex
CREATE INDEX "planning_history_archivedPeriod_idx" ON "planning_history"("archivedPeriod");

-- CreateIndex
CREATE INDEX "planning_history_createdAt_idx" ON "planning_history"("createdAt");

-- CreateIndex
CREATE INDEX "planning_exports_organizationId_idx" ON "planning_exports"("organizationId");

-- CreateIndex
CREATE INDEX "planning_exports_requestedById_idx" ON "planning_exports"("requestedById");

-- CreateIndex
CREATE INDEX "planning_exports_format_idx" ON "planning_exports"("format");

-- CreateIndex
CREATE INDEX "planning_exports_scope_idx" ON "planning_exports"("scope");

-- CreateIndex
CREATE INDEX "planning_exports_startDate_idx" ON "planning_exports"("startDate");

-- CreateIndex
CREATE INDEX "planning_exports_endDate_idx" ON "planning_exports"("endDate");

-- CreateIndex
CREATE INDEX "planning_exports_siteId_idx" ON "planning_exports"("siteId");

-- CreateIndex
CREATE INDEX "planning_exports_departmentId_idx" ON "planning_exports"("departmentId");

-- CreateIndex
CREATE INDEX "planning_exports_employeeId_idx" ON "planning_exports"("employeeId");

-- CreateIndex
CREATE INDEX "planning_view_preferences_organizationId_idx" ON "planning_view_preferences"("organizationId");

-- CreateIndex
CREATE INDEX "planning_view_preferences_employeeId_idx" ON "planning_view_preferences"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "planning_view_preferences_organizationId_userId_view_key" ON "planning_view_preferences"("organizationId", "userId", "view");

-- CreateIndex
CREATE INDEX "technical_sheet_categories_organizationId_idx" ON "technical_sheet_categories"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_categories_isArchived_idx" ON "technical_sheet_categories"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheet_categories_organizationId_name_key" ON "technical_sheet_categories"("organizationId", "name");

-- CreateIndex
CREATE INDEX "technical_sheets_organizationId_idx" ON "technical_sheets"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheets_categoryId_idx" ON "technical_sheets"("categoryId");

-- CreateIndex
CREATE INDEX "technical_sheets_status_idx" ON "technical_sheets"("status");

-- CreateIndex
CREATE INDEX "technical_sheets_isArchived_idx" ON "technical_sheets"("isArchived");

-- CreateIndex
CREATE INDEX "technical_sheets_updatedAt_idx" ON "technical_sheets"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheets_organizationId_name_key" ON "technical_sheets"("organizationId", "name");

-- CreateIndex
CREATE INDEX "technical_sheet_ingredients_organizationId_idx" ON "technical_sheet_ingredients"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_ingredients_technicalSheetId_idx" ON "technical_sheet_ingredients"("technicalSheetId");

-- CreateIndex
CREATE INDEX "technical_sheet_ingredients_productId_idx" ON "technical_sheet_ingredients"("productId");

-- CreateIndex
CREATE INDEX "technical_sheet_ingredients_unitId_idx" ON "technical_sheet_ingredients"("unitId");

-- CreateIndex
CREATE INDEX "technical_sheet_steps_organizationId_idx" ON "technical_sheet_steps"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_steps_technicalSheetId_idx" ON "technical_sheet_steps"("technicalSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheet_steps_technicalSheetId_order_key" ON "technical_sheet_steps"("technicalSheetId", "order");

-- CreateIndex
CREATE INDEX "technical_sheet_allergens_organizationId_idx" ON "technical_sheet_allergens"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_allergens_isArchived_idx" ON "technical_sheet_allergens"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheet_allergens_organizationId_name_key" ON "technical_sheet_allergens"("organizationId", "name");

-- CreateIndex
CREATE INDEX "technical_sheet_ingredient_allergens_allergenId_idx" ON "technical_sheet_ingredient_allergens"("allergenId");

-- CreateIndex
CREATE INDEX "technical_sheet_cost_snapshots_organizationId_idx" ON "technical_sheet_cost_snapshots"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_cost_snapshots_technicalSheetId_idx" ON "technical_sheet_cost_snapshots"("technicalSheetId");

-- CreateIndex
CREATE INDEX "technical_sheet_cost_snapshots_createdAt_idx" ON "technical_sheet_cost_snapshots"("createdAt");

-- CreateIndex
CREATE INDEX "technical_sheet_simulations_organizationId_idx" ON "technical_sheet_simulations"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_simulations_technicalSheetId_idx" ON "technical_sheet_simulations"("technicalSheetId");

-- CreateIndex
CREATE INDEX "technical_sheet_simulations_createdAt_idx" ON "technical_sheet_simulations"("createdAt");

-- CreateIndex
CREATE INDEX "technical_sheet_exports_organizationId_idx" ON "technical_sheet_exports"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_exports_technicalSheetId_idx" ON "technical_sheet_exports"("technicalSheetId");

-- CreateIndex
CREATE INDEX "technical_sheet_exports_simulationId_idx" ON "technical_sheet_exports"("simulationId");

-- CreateIndex
CREATE INDEX "technical_sheet_exports_createdAt_idx" ON "technical_sheet_exports"("createdAt");

-- CreateIndex
CREATE INDEX "technical_sheet_history_organizationId_idx" ON "technical_sheet_history"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_history_technicalSheetId_idx" ON "technical_sheet_history"("technicalSheetId");

-- CreateIndex
CREATE INDEX "technical_sheet_history_userId_idx" ON "technical_sheet_history"("userId");

-- CreateIndex
CREATE INDEX "technical_sheet_history_action_idx" ON "technical_sheet_history"("action");

-- CreateIndex
CREATE INDEX "technical_sheet_history_createdAt_idx" ON "technical_sheet_history"("createdAt");

-- CreateIndex
CREATE INDEX "production_orders_organizationId_idx" ON "production_orders"("organizationId");

-- CreateIndex
CREATE INDEX "production_orders_technicalSheetId_idx" ON "production_orders"("technicalSheetId");

-- CreateIndex
CREATE INDEX "production_orders_productionDate_idx" ON "production_orders"("productionDate");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "production_orders_priority_idx" ON "production_orders"("priority");

-- CreateIndex
CREATE INDEX "production_orders_serviceId_idx" ON "production_orders"("serviceId");

-- CreateIndex
CREATE INDEX "production_orders_responsibleEmployeeId_idx" ON "production_orders"("responsibleEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_organizationId_number_key" ON "production_orders"("organizationId", "number");

-- CreateIndex
CREATE INDEX "production_material_requirements_organizationId_idx" ON "production_material_requirements"("organizationId");

-- CreateIndex
CREATE INDEX "production_material_requirements_orderId_idx" ON "production_material_requirements"("orderId");

-- CreateIndex
CREATE INDEX "production_material_requirements_productId_idx" ON "production_material_requirements"("productId");

-- CreateIndex
CREATE INDEX "production_material_requirements_status_idx" ON "production_material_requirements"("status");

-- CreateIndex
CREATE INDEX "production_assignments_organizationId_idx" ON "production_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "production_assignments_employeeId_idx" ON "production_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "production_assignments_planningAssignmentId_idx" ON "production_assignments"("planningAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "production_assignments_orderId_employeeId_key" ON "production_assignments"("orderId", "employeeId");

-- CreateIndex
CREATE INDEX "production_alerts_organizationId_idx" ON "production_alerts"("organizationId");

-- CreateIndex
CREATE INDEX "production_alerts_orderId_idx" ON "production_alerts"("orderId");

-- CreateIndex
CREATE INDEX "production_alerts_code_idx" ON "production_alerts"("code");

-- CreateIndex
CREATE INDEX "production_alerts_severity_idx" ON "production_alerts"("severity");

-- CreateIndex
CREATE INDEX "production_alerts_isActive_idx" ON "production_alerts"("isActive");

-- CreateIndex
CREATE INDEX "production_alert_overrides_organizationId_idx" ON "production_alert_overrides"("organizationId");

-- CreateIndex
CREATE INDEX "production_alert_overrides_alertId_idx" ON "production_alert_overrides"("alertId");

-- CreateIndex
CREATE INDEX "production_alert_overrides_confirmedById_idx" ON "production_alert_overrides"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "production_realizations_orderId_key" ON "production_realizations"("orderId");

-- CreateIndex
CREATE INDEX "production_realizations_organizationId_idx" ON "production_realizations"("organizationId");

-- CreateIndex
CREATE INDEX "production_destocking_proposals_organizationId_idx" ON "production_destocking_proposals"("organizationId");

-- CreateIndex
CREATE INDEX "production_destocking_proposals_orderId_idx" ON "production_destocking_proposals"("orderId");

-- CreateIndex
CREATE INDEX "production_destocking_proposals_status_idx" ON "production_destocking_proposals"("status");

-- CreateIndex
CREATE INDEX "production_destocking_lines_organizationId_idx" ON "production_destocking_lines"("organizationId");

-- CreateIndex
CREATE INDEX "production_destocking_lines_proposalId_idx" ON "production_destocking_lines"("proposalId");

-- CreateIndex
CREATE INDEX "production_destocking_lines_productId_idx" ON "production_destocking_lines"("productId");

-- CreateIndex
CREATE INDEX "production_destocking_movements_organizationId_idx" ON "production_destocking_movements"("organizationId");

-- CreateIndex
CREATE INDEX "production_destocking_movements_stockMovementId_idx" ON "production_destocking_movements"("stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "production_destocking_movements_proposalId_stockMovementId_key" ON "production_destocking_movements"("proposalId", "stockMovementId");

-- CreateIndex
CREATE INDEX "production_history_organizationId_idx" ON "production_history"("organizationId");

-- CreateIndex
CREATE INDEX "production_history_orderId_idx" ON "production_history"("orderId");

-- CreateIndex
CREATE INDEX "production_history_actorUserId_idx" ON "production_history"("actorUserId");

-- CreateIndex
CREATE INDEX "production_history_action_idx" ON "production_history"("action");

-- CreateIndex
CREATE INDEX "production_history_createdAt_idx" ON "production_history"("createdAt");

-- CreateIndex
CREATE INDEX "production_exports_organizationId_idx" ON "production_exports"("organizationId");

-- CreateIndex
CREATE INDEX "production_exports_requestedById_idx" ON "production_exports"("requestedById");

-- CreateIndex
CREATE INDEX "production_exports_type_idx" ON "production_exports"("type");

-- CreateIndex
CREATE INDEX "production_exports_format_idx" ON "production_exports"("format");

-- CreateIndex
CREATE INDEX "production_exports_startDate_idx" ON "production_exports"("startDate");

-- CreateIndex
CREATE INDEX "production_exports_endDate_idx" ON "production_exports"("endDate");

-- CreateIndex
CREATE INDEX "production_exports_serviceId_idx" ON "production_exports"("serviceId");

-- CreateIndex
CREATE INDEX "production_exports_orderId_idx" ON "production_exports"("orderId");

-- CreateIndex
CREATE INDEX "menu_diets_organizationId_idx" ON "menu_diets"("organizationId");

-- CreateIndex
CREATE INDEX "menu_diets_isArchived_idx" ON "menu_diets"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "menu_diets_organizationId_name_key" ON "menu_diets"("organizationId", "name");

-- CreateIndex
CREATE INDEX "menus_organizationId_idx" ON "menus"("organizationId");

-- CreateIndex
CREATE INDEX "menus_date_idx" ON "menus"("date");

-- CreateIndex
CREATE INDEX "menus_service_idx" ON "menus"("service");

-- CreateIndex
CREATE INDEX "menus_siteId_idx" ON "menus"("siteId");

-- CreateIndex
CREATE INDEX "menus_status_idx" ON "menus"("status");

-- CreateIndex
CREATE INDEX "menus_cycleId_idx" ON "menus"("cycleId");

-- CreateIndex
CREATE INDEX "menu_items_organizationId_idx" ON "menu_items"("organizationId");

-- CreateIndex
CREATE INDEX "menu_items_menuId_idx" ON "menu_items"("menuId");

-- CreateIndex
CREATE INDEX "menu_items_technicalSheetId_idx" ON "menu_items"("technicalSheetId");

-- CreateIndex
CREATE INDEX "menu_items_section_idx" ON "menu_items"("section");

-- CreateIndex
CREATE INDEX "menu_variants_organizationId_idx" ON "menu_variants"("organizationId");

-- CreateIndex
CREATE INDEX "menu_variants_dietId_idx" ON "menu_variants"("dietId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_variants_menuId_dietId_key" ON "menu_variants"("menuId", "dietId");

-- CreateIndex
CREATE INDEX "menu_variant_replacements_variantId_idx" ON "menu_variant_replacements"("variantId");

-- CreateIndex
CREATE INDEX "menu_variant_replacements_menuItemId_idx" ON "menu_variant_replacements"("menuItemId");

-- CreateIndex
CREATE INDEX "menu_variant_replacements_replacementTechnicalSheetId_idx" ON "menu_variant_replacements"("replacementTechnicalSheetId");

-- CreateIndex
CREATE INDEX "menu_guest_groups_organizationId_idx" ON "menu_guest_groups"("organizationId");

-- CreateIndex
CREATE INDEX "menu_guest_groups_isArchived_idx" ON "menu_guest_groups"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "menu_guest_groups_organizationId_name_key" ON "menu_guest_groups"("organizationId", "name");

-- CreateIndex
CREATE INDEX "menu_guest_forecasts_organizationId_idx" ON "menu_guest_forecasts"("organizationId");

-- CreateIndex
CREATE INDEX "menu_guest_forecasts_menuId_idx" ON "menu_guest_forecasts"("menuId");

-- CreateIndex
CREATE INDEX "menu_guest_forecasts_guestGroupId_idx" ON "menu_guest_forecasts"("guestGroupId");

-- CreateIndex
CREATE INDEX "menu_guest_forecasts_dietId_idx" ON "menu_guest_forecasts"("dietId");

-- CreateIndex
CREATE INDEX "menu_cycles_organizationId_idx" ON "menu_cycles"("organizationId");

-- CreateIndex
CREATE INDEX "menu_cycles_siteId_idx" ON "menu_cycles"("siteId");

-- CreateIndex
CREATE INDEX "menu_cycles_status_idx" ON "menu_cycles"("status");

-- CreateIndex
CREATE INDEX "menu_cycle_items_organizationId_idx" ON "menu_cycle_items"("organizationId");

-- CreateIndex
CREATE INDEX "menu_cycle_items_cycleId_idx" ON "menu_cycle_items"("cycleId");

-- CreateIndex
CREATE INDEX "menu_cycle_items_technicalSheetId_idx" ON "menu_cycle_items"("technicalSheetId");

-- CreateIndex
CREATE INDEX "menu_cycle_items_weekNumber_dayOfWeek_service_idx" ON "menu_cycle_items"("weekNumber", "dayOfWeek", "service");

-- CreateIndex
CREATE INDEX "menu_production_links_organizationId_idx" ON "menu_production_links"("organizationId");

-- CreateIndex
CREATE INDEX "menu_production_links_productionOrderId_idx" ON "menu_production_links"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_production_links_menuId_productionOrderId_key" ON "menu_production_links"("menuId", "productionOrderId");

-- CreateIndex
CREATE INDEX "menu_exports_organizationId_idx" ON "menu_exports"("organizationId");

-- CreateIndex
CREATE INDEX "menu_exports_menuId_idx" ON "menu_exports"("menuId");

-- CreateIndex
CREATE INDEX "menu_exports_requestedById_idx" ON "menu_exports"("requestedById");

-- CreateIndex
CREATE INDEX "menu_exports_format_idx" ON "menu_exports"("format");

-- CreateIndex
CREATE INDEX "menu_exports_audience_idx" ON "menu_exports"("audience");

-- CreateIndex
CREATE INDEX "menu_history_organizationId_idx" ON "menu_history"("organizationId");

-- CreateIndex
CREATE INDEX "menu_history_menuId_idx" ON "menu_history"("menuId");

-- CreateIndex
CREATE INDEX "menu_history_cycleId_idx" ON "menu_history"("cycleId");

-- CreateIndex
CREATE INDEX "menu_history_actorUserId_idx" ON "menu_history"("actorUserId");

-- CreateIndex
CREATE INDEX "menu_history_action_idx" ON "menu_history"("action");

-- CreateIndex
CREATE INDEX "menu_history_createdAt_idx" ON "menu_history"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_idx" ON "audit_logs"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_primarySupplierId_fkey" FOREIGN KEY ("primarySupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_destinationSiteId_fkey" FOREIGN KEY ("destinationSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rnm_product_favorites" ADD CONSTRAINT "rnm_product_favorites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rnm_product_favorites" ADD CONSTRAINT "rnm_product_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_departments" ADD CONSTRAINT "hr_departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_positions" ADD CONSTRAINT "hr_positions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_mainSiteId_fkey" FOREIGN KEY ("mainSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employees" ADD CONSTRAINT "hr_employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_history" ADD CONSTRAINT "hr_employee_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_history" ADD CONSTRAINT "hr_employee_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_history" ADD CONSTRAINT "hr_employee_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_rotations" ADD CONSTRAINT "hr_rotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_rotations" ADD CONSTRAINT "hr_rotations_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_rotation_assignments" ADD CONSTRAINT "hr_rotation_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_rotation_assignments" ADD CONSTRAINT "hr_rotation_assignments_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "hr_rotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_rotation_assignments" ADD CONSTRAINT "hr_rotation_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_rotation_assignments" ADD CONSTRAINT "hr_rotation_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_skills" ADD CONSTRAINT "hr_skills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_skills" ADD CONSTRAINT "hr_employee_skills_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_skills" ADD CONSTRAINT "hr_employee_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "hr_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_position_skills" ADD CONSTRAINT "hr_position_skills_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_position_skills" ADD CONSTRAINT "hr_position_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "hr_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_department_skills" ADD CONSTRAINT "hr_department_skills_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_department_skills" ADD CONSTRAINT "hr_department_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "hr_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_absences" ADD CONSTRAINT "hr_absences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_absences" ADD CONSTRAINT "hr_absences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_absences" ADD CONSTRAINT "hr_absences_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_rotationId_fkey" FOREIGN KEY ("rotationId") REFERENCES "hr_rotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "hr_absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_assignments" ADD CONSTRAINT "planning_assignments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "planning_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "hr_absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_absentEmployeeId_fkey" FOREIGN KEY ("absentEmployeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_replacementEmployeeId_fkey" FOREIGN KEY ("replacementEmployeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_replacements" ADD CONSTRAINT "planning_replacements_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_operational_needs" ADD CONSTRAINT "planning_operational_needs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_operational_needs" ADD CONSTRAINT "planning_operational_needs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_operational_needs" ADD CONSTRAINT "planning_operational_needs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_operational_needs" ADD CONSTRAINT "planning_operational_needs_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_operational_needs" ADD CONSTRAINT "planning_operational_needs_requiredSkillId_fkey" FOREIGN KEY ("requiredSkillId") REFERENCES "hr_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_operational_needs" ADD CONSTRAINT "planning_operational_needs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_templates" ADD CONSTRAINT "planning_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_templates" ADD CONSTRAINT "planning_templates_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_templates" ADD CONSTRAINT "planning_templates_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_templates" ADD CONSTRAINT "planning_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_template_applications" ADD CONSTRAINT "planning_template_applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_template_applications" ADD CONSTRAINT "planning_template_applications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "planning_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_template_applications" ADD CONSTRAINT "planning_template_applications_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_template_applications" ADD CONSTRAINT "planning_template_applications_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_generations" ADD CONSTRAINT "planning_generations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_generations" ADD CONSTRAINT "planning_generations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_generations" ADD CONSTRAINT "planning_generations_launchedById_fkey" FOREIGN KEY ("launchedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_generations" ADD CONSTRAINT "planning_generations_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_conflicts" ADD CONSTRAINT "planning_conflicts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_conflicts" ADD CONSTRAINT "planning_conflicts_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "planning_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_conflicts" ADD CONSTRAINT "planning_conflicts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_notifications" ADD CONSTRAINT "planning_notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_notifications" ADD CONSTRAINT "planning_notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_notifications" ADD CONSTRAINT "planning_notifications_recipientEmployeeId_fkey" FOREIGN KEY ("recipientEmployeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_history" ADD CONSTRAINT "planning_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_history" ADD CONSTRAINT "planning_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_exports" ADD CONSTRAINT "planning_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_exports" ADD CONSTRAINT "planning_exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_exports" ADD CONSTRAINT "planning_exports_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_exports" ADD CONSTRAINT "planning_exports_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_exports" ADD CONSTRAINT "planning_exports_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_view_preferences" ADD CONSTRAINT "planning_view_preferences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_view_preferences" ADD CONSTRAINT "planning_view_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_view_preferences" ADD CONSTRAINT "planning_view_preferences_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_categories" ADD CONSTRAINT "technical_sheet_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "technical_sheet_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheets" ADD CONSTRAINT "technical_sheets_sourceTechnicalSheetId_fkey" FOREIGN KEY ("sourceTechnicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_ingredients" ADD CONSTRAINT "technical_sheet_ingredients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_ingredients" ADD CONSTRAINT "technical_sheet_ingredients_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_ingredients" ADD CONSTRAINT "technical_sheet_ingredients_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_ingredients" ADD CONSTRAINT "technical_sheet_ingredients_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_steps" ADD CONSTRAINT "technical_sheet_steps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_steps" ADD CONSTRAINT "technical_sheet_steps_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_allergens" ADD CONSTRAINT "technical_sheet_allergens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_ingredient_allergens" ADD CONSTRAINT "technical_sheet_ingredient_allergens_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "technical_sheet_ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_ingredient_allergens" ADD CONSTRAINT "technical_sheet_ingredient_allergens_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "technical_sheet_allergens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_cost_snapshots" ADD CONSTRAINT "technical_sheet_cost_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_cost_snapshots" ADD CONSTRAINT "technical_sheet_cost_snapshots_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_simulations" ADD CONSTRAINT "technical_sheet_simulations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_simulations" ADD CONSTRAINT "technical_sheet_simulations_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_exports" ADD CONSTRAINT "technical_sheet_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_exports" ADD CONSTRAINT "technical_sheet_exports_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_exports" ADD CONSTRAINT "technical_sheet_exports_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "technical_sheet_simulations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_history" ADD CONSTRAINT "technical_sheet_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_history" ADD CONSTRAINT "technical_sheet_history_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_history" ADD CONSTRAINT "technical_sheet_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_responsibleEmployeeId_fkey" FOREIGN KEY ("responsibleEmployeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_requirements" ADD CONSTRAINT "production_material_requirements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_requirements" ADD CONSTRAINT "production_material_requirements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_requirements" ADD CONSTRAINT "production_material_requirements_technicalSheetIngredientI_fkey" FOREIGN KEY ("technicalSheetIngredientId") REFERENCES "technical_sheet_ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_requirements" ADD CONSTRAINT "production_material_requirements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_requirements" ADD CONSTRAINT "production_material_requirements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_material_requirements" ADD CONSTRAINT "production_material_requirements_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_assignments" ADD CONSTRAINT "production_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_assignments" ADD CONSTRAINT "production_assignments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_assignments" ADD CONSTRAINT "production_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_assignments" ADD CONSTRAINT "production_assignments_planningAssignmentId_fkey" FOREIGN KEY ("planningAssignmentId") REFERENCES "planning_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_alerts" ADD CONSTRAINT "production_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_alerts" ADD CONSTRAINT "production_alerts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_alert_overrides" ADD CONSTRAINT "production_alert_overrides_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_alert_overrides" ADD CONSTRAINT "production_alert_overrides_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "production_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_alert_overrides" ADD CONSTRAINT "production_alert_overrides_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_realizations" ADD CONSTRAINT "production_realizations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_realizations" ADD CONSTRAINT "production_realizations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_proposals" ADD CONSTRAINT "production_destocking_proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_proposals" ADD CONSTRAINT "production_destocking_proposals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_proposals" ADD CONSTRAINT "production_destocking_proposals_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_lines" ADD CONSTRAINT "production_destocking_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_lines" ADD CONSTRAINT "production_destocking_lines_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "production_destocking_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_lines" ADD CONSTRAINT "production_destocking_lines_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "production_material_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_lines" ADD CONSTRAINT "production_destocking_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_lines" ADD CONSTRAINT "production_destocking_lines_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_movements" ADD CONSTRAINT "production_destocking_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_movements" ADD CONSTRAINT "production_destocking_movements_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "production_destocking_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_destocking_movements" ADD CONSTRAINT "production_destocking_movements_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_history" ADD CONSTRAINT "production_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_history" ADD CONSTRAINT "production_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_history" ADD CONSTRAINT "production_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_exports" ADD CONSTRAINT "production_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_exports" ADD CONSTRAINT "production_exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_exports" ADD CONSTRAINT "production_exports_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_diets" ADD CONSTRAINT "menu_diets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "menu_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_sourceMenuId_fkey" FOREIGN KEY ("sourceMenuId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variants" ADD CONSTRAINT "menu_variants_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "menu_diets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variant_replacements" ADD CONSTRAINT "menu_variant_replacements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "menu_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variant_replacements" ADD CONSTRAINT "menu_variant_replacements_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_variant_replacements" ADD CONSTRAINT "menu_variant_replacements_replacementTechnicalSheetId_fkey" FOREIGN KEY ("replacementTechnicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_guest_groups" ADD CONSTRAINT "menu_guest_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_guest_forecasts" ADD CONSTRAINT "menu_guest_forecasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_guest_forecasts" ADD CONSTRAINT "menu_guest_forecasts_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_guest_forecasts" ADD CONSTRAINT "menu_guest_forecasts_guestGroupId_fkey" FOREIGN KEY ("guestGroupId") REFERENCES "menu_guest_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_guest_forecasts" ADD CONSTRAINT "menu_guest_forecasts_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "menu_diets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_cycles" ADD CONSTRAINT "menu_cycles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_cycles" ADD CONSTRAINT "menu_cycles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_cycle_items" ADD CONSTRAINT "menu_cycle_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_cycle_items" ADD CONSTRAINT "menu_cycle_items_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "menu_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_cycle_items" ADD CONSTRAINT "menu_cycle_items_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_production_links" ADD CONSTRAINT "menu_production_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_production_links" ADD CONSTRAINT "menu_production_links_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_production_links" ADD CONSTRAINT "menu_production_links_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_exports" ADD CONSTRAINT "menu_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_exports" ADD CONSTRAINT "menu_exports_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_exports" ADD CONSTRAINT "menu_exports_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_history" ADD CONSTRAINT "menu_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_history" ADD CONSTRAINT "menu_history_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_history" ADD CONSTRAINT "menu_history_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "menu_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_history" ADD CONSTRAINT "menu_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
