ALTER TABLE "planning_entitlement_catalog_items"
ADD COLUMN "employmentFramework" TEXT,
ADD COLUMN "shortDescription" TEXT,
ADD COLUMN "longDescription" TEXT,
ADD COLUMN "examples" JSONB,
ADD COLUMN "defaultStartCondition" TEXT,
ADD COLUMN "maxBalance" INTEGER,
ADD COLUMN "carryOverEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isCommon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isAdvanced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sourceLabel" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceReference" TEXT;

CREATE INDEX "planning_entitlement_catalog_items_framework_idx"
ON "planning_entitlement_catalog_items"("organizationId", "countryCode", "employmentFramework");

CREATE INDEX "planning_entitlement_catalog_items_common_advanced_idx"
ON "planning_entitlement_catalog_items"("organizationId", "countryCode", "isCommon", "isAdvanced");
