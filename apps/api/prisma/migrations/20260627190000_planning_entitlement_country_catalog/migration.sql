ALTER TABLE "organizations"
ADD COLUMN "hrCountryCode" TEXT;

CREATE TABLE "planning_entitlement_catalog_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "countryCode" TEXT NOT NULL,
  "organizationType" TEXT,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "unit" "PlanningTimeUnit" NOT NULL,
  "defaultAccrualFrequency" "PlanningEntitlementAccrualFrequency" NOT NULL DEFAULT 'MANUAL',
  "defaultAccrualQuantity" DECIMAL(12,3),
  "startsAfterTrialPeriod" BOOLEAN NOT NULL DEFAULT false,
  "minimumSeniorityMonths" INTEGER,
  "prorateByContractTime" BOOLEAN NOT NULL DEFAULT false,
  "requiresAdminValidation" BOOLEAN NOT NULL DEFAULT true,
  "isSystemTemplate" BOOLEAN NOT NULL DEFAULT true,
  "enabledByDefault" BOOLEAN NOT NULL DEFAULT false,
  "isRecommended" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "sourceTemplateCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "planning_entitlement_catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "planning_entitlement_catalog_items_org_country_code_key"
ON "planning_entitlement_catalog_items"("organizationId", "countryCode", "code");

CREATE INDEX "planning_entitlement_catalog_items_org_idx"
ON "planning_entitlement_catalog_items"("organizationId");

CREATE INDEX "planning_entitlement_catalog_items_country_category_idx"
ON "planning_entitlement_catalog_items"("organizationId", "countryCode", "category");

CREATE INDEX "planning_entitlement_catalog_items_recommended_idx"
ON "planning_entitlement_catalog_items"("organizationId", "countryCode", "isRecommended");

ALTER TABLE "planning_entitlement_catalog_items"
ADD CONSTRAINT "planning_entitlement_catalog_items_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
