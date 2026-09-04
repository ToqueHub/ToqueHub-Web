-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('UNSPECIFIED', 'RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED', 'PACKAGED');

-- CreateEnum
CREATE TYPE "ConservationState" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN', 'THAWING', 'THAWED', 'COOLING', 'BLOCKED', 'EXPIRED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "ProductionNeedSource" AS ENUM ('MANUAL', 'MENU', 'CATERING_ORDER', 'STOCK_TARGET', 'STOCK_MINIMUM', 'SALES_FORECAST', 'RESERVATION', 'SUB_RECIPE', 'TRANSFER_REQUEST');

-- CreateEnum
CREATE TYPE "ProductionNeedStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_COVERED', 'COVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionProfileMode" AS ENUM ('FIXED', 'MULTIPLES', 'FLEXIBLE', 'FORMATS', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "ProductionRoundingMode" AS ENUM ('UP', 'DOWN', 'NEAREST');

-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('TO_PREPARE', 'PREPARING', 'COOKING', 'COOLING', 'FREEZING', 'COMPLETED', 'PARTIALLY_LOST', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionOperationType" AS ENUM ('PREPARATION', 'THAWING', 'COOKING', 'COOLING', 'FREEZING', 'ASSEMBLY', 'FINISHING', 'PACKAGING', 'TRANSFER', 'DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductionOperationStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionConsumptionKind" AS ENUM ('PLANNED', 'ACTUAL', 'LOSS');

-- CreateEnum
CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockReservationTarget" AS ENUM ('NEED', 'ORDER', 'MENU', 'CAMPAIGN', 'TRANSFER', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductionOrderStatus" ADD VALUE 'DRAFT';
ALTER TYPE "ProductionOrderStatus" ADD VALUE 'PROPOSED';
ALTER TYPE "ProductionOrderStatus" ADD VALUE 'PARTIALLY_COMPLETED';
ALTER TYPE "ProductionOrderStatus" ADD VALUE 'BLOCKED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'CONSUMPTION';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION_RELEASE';
ALTER TYPE "StockMovementType" ADD VALUE 'BREAKAGE';
ALTER TYPE "StockMovementType" ADD VALUE 'TASTING';
ALTER TYPE "StockMovementType" ADD VALUE 'EXPIRATION';
ALTER TYPE "StockMovementType" ADD VALUE 'DESTRUCTION';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE';
ALTER TYPE "StockMovementType" ADD VALUE 'RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'FREEZE';
ALTER TYPE "StockMovementType" ADD VALUE 'THAW';
ALTER TYPE "StockMovementType" ADD VALUE 'COOLING';
ALTER TYPE "StockMovementType" ADD VALUE 'PACKAGING';
ALTER TYPE "StockMovementType" ADD VALUE 'UNPACKAGING';

-- DropIndex
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "stocks"
    GROUP BY "organizationId", "productId", "lotId", "siteId", "locationId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Production foundation migration blocked: duplicate logical stock rows must be consolidated first';
  END IF;
END $$;

DROP INDEX "stocks_organizationId_productId_lotId_siteId_locationId_key";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'UNSPECIFIED';

-- AlterTable
ALTER TABLE "lots" ADD COLUMN     "availableAt" TIMESTAMP(3),
ADD COLUMN     "conservationState" "ConservationState" NOT NULL DEFAULT 'AMBIENT',
ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "initialQuantity" DECIMAL(12,3),
ADD COLUMN     "producedAt" TIMESTAMP(3),
ADD COLUMN     "productionBatchId" UUID,
ADD COLUMN     "recipeVersionId" UUID,
ADD COLUMN     "thawedAt" TIMESTAMP(3),
ADD COLUMN     "variantId" UUID;

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "variantId" UUID;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "destinationState" "ConservationState",
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "sourceEntityId" TEXT,
ADD COLUMN     "sourceEntityType" TEXT,
ADD COLUMN     "sourceState" "ConservationState",
ADD COLUMN     "variantId" UUID;

-- AlterTable
ALTER TABLE "production_orders" ADD COLUMN     "grossRequirement" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "netRequirement" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "optimisticVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "outputProductId" UUID,
ADD COLUMN     "outputVariantId" UUID,
ADD COLUMN     "proposedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "recipeVersionId" UUID,
ADD COLUMN     "reservedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "siteId" UUID,
ADD COLUMN     "surplusQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN     "validatedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Preserve the meaning of existing production orders in the new campaign fields.
UPDATE "production_orders"
SET "grossRequirement" = "plannedPortions",
    "netRequirement" = "plannedPortions",
    "proposedQuantity" = "plannedPortions",
    "validatedQuantity" = "plannedPortions";

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_composition_items" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "outputProductId" UUID NOT NULL,
    "outputVariantId" UUID,
    "componentProductId" UUID NOT NULL,
    "componentVariantId" UUID,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_composition_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_sheet_versions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "referenceYield" DECIMAL(12,3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technical_sheet_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "technicalSheetId" UUID NOT NULL,
    "outputProductId" UUID NOT NULL,
    "outputVariantId" UUID,
    "yieldUnitId" UUID NOT NULL,
    "mode" "ProductionProfileMode" NOT NULL DEFAULT 'FIXED',
    "referenceYield" DECIMAL(12,3) NOT NULL,
    "minimumQuantity" DECIMAL(12,3),
    "optimalQuantity" DECIMAL(12,3),
    "maximumQuantity" DECIMAL(12,3),
    "stepQuantity" DECIMAL(12,3),
    "allowedFormats" JSONB,
    "allowHalfBatch" BOOLEAN NOT NULL DEFAULT false,
    "allowDoubleBatch" BOOLEAN NOT NULL DEFAULT false,
    "averageLossPercent" DECIMAL(7,3) NOT NULL DEFAULT 0,
    "safetyMarginPercent" DECIMAL(7,3) NOT NULL DEFAULT 0,
    "quantityPerMold" DECIMAL(12,3),
    "quantityPerTray" DECIMAL(12,3),
    "quantityPerContainer" DECIMAL(12,3),
    "quantityPerCycle" DECIMAL(12,3),
    "maximumCycles" INTEGER,
    "canFreeze" BOOLEAN NOT NULL DEFAULT false,
    "shelfLifeHours" INTEGER,
    "frozenShelfLifeHours" INTEGER,
    "shelfLifeAfterThawHours" INTEGER,
    "thawingTimeMinutes" INTEGER,
    "canRefreeze" BOOLEAN NOT NULL DEFAULT false,
    "roundingMode" "ProductionRoundingMode" NOT NULL DEFAULT 'UP',
    "optimisticVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_needs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "unitId" UUID NOT NULL,
    "serviceId" UUID,
    "source" "ProductionNeedSource" NOT NULL,
    "sourceReferenceType" TEXT,
    "sourceReferenceId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "coveredQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "neededAt" TIMESTAMP(3) NOT NULL,
    "priority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ProductionNeedStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_need_allocations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "needId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "plannedQuantity" DECIMAL(12,3) NOT NULL,
    "reservedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "consumedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_need_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_batches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "recipeVersionId" UUID,
    "unitId" UUID NOT NULL,
    "destinationLocationId" UUID,
    "producerUserId" UUID,
    "completedById" UUID,
    "number" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(12,3) NOT NULL,
    "actualQuantity" DECIMAL(12,3),
    "lostQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "status" "ProductionBatchStatus" NOT NULL DEFAULT 'TO_PREPARE',
    "plannedStartAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "optimisticVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_operations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "responsibleEmployeeId" UUID,
    "type" "ProductionOperationType" NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "plannedAt" TIMESTAMP(3),
    "activeMinutes" INTEGER,
    "passiveMinutes" INTEGER,
    "workstation" TEXT,
    "resourceReference" TEXT,
    "status" "ProductionOperationStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_operation_dependencies" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "prerequisiteId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_operation_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_batch_consumptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "lotId" UUID,
    "unitId" UUID NOT NULL,
    "stockMovementId" UUID,
    "kind" "ProductionConsumptionKind" NOT NULL DEFAULT 'ACTUAL',
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_batch_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "stockId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "lotId" UUID,
    "siteId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "needId" UUID,
    "orderId" UUID,
    "menuId" UUID,
    "target" "StockReservationTarget" NOT NULL,
    "targetReferenceId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdById" UUID,
    "idempotencyKey" TEXT,
    "optimisticVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_organizationId_idx" ON "product_variants"("organizationId");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_isArchived_idx" ON "product_variants"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organizationId_productId_name_key" ON "product_variants"("organizationId", "productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_organizationId_sku_key" ON "product_variants"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "packaging_composition_items_organizationId_idx" ON "packaging_composition_items"("organizationId");

-- CreateIndex
CREATE INDEX "packaging_composition_items_outputProductId_outputVariantId_idx" ON "packaging_composition_items"("outputProductId", "outputVariantId");

-- CreateIndex
CREATE INDEX "packaging_composition_items_componentProductId_componentVar_idx" ON "packaging_composition_items"("componentProductId", "componentVariantId");

-- CreateIndex
CREATE INDEX "technical_sheet_versions_organizationId_idx" ON "technical_sheet_versions"("organizationId");

-- CreateIndex
CREATE INDEX "technical_sheet_versions_technicalSheetId_idx" ON "technical_sheet_versions"("technicalSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheet_versions_technicalSheetId_version_key" ON "technical_sheet_versions"("technicalSheetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "technical_sheet_versions_technicalSheetId_sourceUpdatedAt_key" ON "technical_sheet_versions"("technicalSheetId", "sourceUpdatedAt");

-- CreateIndex
CREATE INDEX "production_profiles_organizationId_idx" ON "production_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "production_profiles_siteId_idx" ON "production_profiles"("siteId");

-- CreateIndex
CREATE INDEX "production_profiles_technicalSheetId_idx" ON "production_profiles"("technicalSheetId");

-- CreateIndex
CREATE INDEX "production_profiles_outputProductId_outputVariantId_idx" ON "production_profiles"("outputProductId", "outputVariantId");

-- A profile is unique for a site, recipe and output, including a null variant.
-- PostgreSQL 14 does not support `NULLS NOT DISTINCT`; UUID text cannot be empty,
-- so an empty-string normalization preserves the same uniqueness semantics.
CREATE UNIQUE INDEX "production_profiles_site_sheet_output_key"
ON "production_profiles"("organizationId", "siteId", "technicalSheetId", "outputProductId", COALESCE("outputVariantId"::text, ''));

-- CreateIndex
CREATE INDEX "production_needs_organizationId_idx" ON "production_needs"("organizationId");

-- CreateIndex
CREATE INDEX "production_needs_siteId_neededAt_idx" ON "production_needs"("siteId", "neededAt");

-- CreateIndex
CREATE INDEX "production_needs_productId_variantId_idx" ON "production_needs"("productId", "variantId");

-- CreateIndex
CREATE INDEX "production_needs_status_idx" ON "production_needs"("status");

-- CreateIndex
CREATE INDEX "production_needs_source_sourceReferenceType_sourceReference_idx" ON "production_needs"("source", "sourceReferenceType", "sourceReferenceId");

-- CreateIndex
CREATE INDEX "production_need_allocations_organizationId_idx" ON "production_need_allocations"("organizationId");

-- CreateIndex
CREATE INDEX "production_need_allocations_orderId_idx" ON "production_need_allocations"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "production_need_allocations_needId_orderId_key" ON "production_need_allocations"("needId", "orderId");

-- CreateIndex
CREATE INDEX "production_batches_organizationId_idx" ON "production_batches"("organizationId");

-- CreateIndex
CREATE INDEX "production_batches_orderId_idx" ON "production_batches"("orderId");

-- CreateIndex
CREATE INDEX "production_batches_status_idx" ON "production_batches"("status");

-- CreateIndex
CREATE INDEX "production_batches_plannedStartAt_idx" ON "production_batches"("plannedStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "production_batches_orderId_number_key" ON "production_batches"("orderId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "production_batches_organizationId_reference_key" ON "production_batches"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "production_batches_organizationId_idempotencyKey_key" ON "production_batches"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "production_operations_organizationId_idx" ON "production_operations"("organizationId");

-- CreateIndex
CREATE INDEX "production_operations_batchId_idx" ON "production_operations"("batchId");

-- CreateIndex
CREATE INDEX "production_operations_responsibleEmployeeId_idx" ON "production_operations"("responsibleEmployeeId");

-- CreateIndex
CREATE INDEX "production_operations_plannedAt_status_idx" ON "production_operations"("plannedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "production_operations_batchId_position_key" ON "production_operations"("batchId", "position");

-- CreateIndex
CREATE INDEX "production_operation_dependencies_organizationId_idx" ON "production_operation_dependencies"("organizationId");

-- CreateIndex
CREATE INDEX "production_operation_dependencies_prerequisiteId_idx" ON "production_operation_dependencies"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "production_operation_dependencies_operationId_prerequisiteI_key" ON "production_operation_dependencies"("operationId", "prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "production_batch_consumptions_stockMovementId_key" ON "production_batch_consumptions"("stockMovementId");

-- CreateIndex
CREATE INDEX "production_batch_consumptions_organizationId_idx" ON "production_batch_consumptions"("organizationId");

-- CreateIndex
CREATE INDEX "production_batch_consumptions_batchId_idx" ON "production_batch_consumptions"("batchId");

-- CreateIndex
CREATE INDEX "production_batch_consumptions_productId_variantId_idx" ON "production_batch_consumptions"("productId", "variantId");

-- CreateIndex
CREATE INDEX "production_batch_consumptions_lotId_idx" ON "production_batch_consumptions"("lotId");

-- CreateIndex
CREATE INDEX "stock_reservations_organizationId_idx" ON "stock_reservations"("organizationId");

-- CreateIndex
CREATE INDEX "stock_reservations_stockId_status_idx" ON "stock_reservations"("stockId", "status");

-- CreateIndex
CREATE INDEX "stock_reservations_productId_variantId_siteId_status_idx" ON "stock_reservations"("productId", "variantId", "siteId", "status");

-- CreateIndex
CREATE INDEX "stock_reservations_needId_idx" ON "stock_reservations"("needId");

-- CreateIndex
CREATE INDEX "stock_reservations_orderId_idx" ON "stock_reservations"("orderId");

-- CreateIndex
CREATE INDEX "stock_reservations_menuId_idx" ON "stock_reservations"("menuId");

-- CreateIndex
CREATE INDEX "stock_reservations_expiresAt_idx" ON "stock_reservations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_organizationId_idempotencyKey_key" ON "stock_reservations"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "lots_variantId_idx" ON "lots"("variantId");

-- CreateIndex
CREATE INDEX "lots_productionBatchId_idx" ON "lots"("productionBatchId");

-- CreateIndex
CREATE INDEX "lots_recipeVersionId_idx" ON "lots"("recipeVersionId");

-- CreateIndex
CREATE INDEX "lots_conservationState_idx" ON "lots"("conservationState");

-- CreateIndex
CREATE INDEX "stocks_variantId_idx" ON "stocks"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_organizationId_productId_variantId_lotId_siteId_loca_key"
ON "stocks"(
  "organizationId",
  "productId",
  COALESCE("variantId"::text, ''),
  COALESCE("lotId"::text, ''),
  COALESCE("siteId"::text, ''),
  COALESCE("locationId"::text, '')
);

-- CreateIndex
CREATE INDEX "stock_movements_variantId_idx" ON "stock_movements"("variantId");

-- CreateIndex
CREATE INDEX "stock_movements_sourceEntityType_sourceEntityId_idx" ON "stock_movements"("sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_organizationId_idempotencyKey_key" ON "stock_movements"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "production_orders_siteId_idx" ON "production_orders"("siteId");

-- CreateIndex
CREATE INDEX "production_orders_recipeVersionId_idx" ON "production_orders"("recipeVersionId");

-- CreateIndex
CREATE INDEX "production_orders_outputProductId_outputVariantId_idx" ON "production_orders"("outputProductId", "outputVariantId");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_composition_items" ADD CONSTRAINT "packaging_composition_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_composition_items" ADD CONSTRAINT "packaging_composition_items_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_composition_items" ADD CONSTRAINT "packaging_composition_items_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_composition_items" ADD CONSTRAINT "packaging_composition_items_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_composition_items" ADD CONSTRAINT "packaging_composition_items_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_composition_items" ADD CONSTRAINT "packaging_composition_items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_productionBatchId_fkey" FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "technical_sheet_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_versions" ADD CONSTRAINT "technical_sheet_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_sheet_versions" ADD CONSTRAINT "technical_sheet_versions_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_profiles" ADD CONSTRAINT "production_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_profiles" ADD CONSTRAINT "production_profiles_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_profiles" ADD CONSTRAINT "production_profiles_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_profiles" ADD CONSTRAINT "production_profiles_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_profiles" ADD CONSTRAINT "production_profiles_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_profiles" ADD CONSTRAINT "production_profiles_yieldUnitId_fkey" FOREIGN KEY ("yieldUnitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_needs" ADD CONSTRAINT "production_needs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_need_allocations" ADD CONSTRAINT "production_need_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_need_allocations" ADD CONSTRAINT "production_need_allocations_needId_fkey" FOREIGN KEY ("needId") REFERENCES "production_needs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_need_allocations" ADD CONSTRAINT "production_need_allocations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "technical_sheet_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "technical_sheet_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_producerUserId_fkey" FOREIGN KEY ("producerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_responsibleEmployeeId_fkey" FOREIGN KEY ("responsibleEmployeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_operation_dependencies" ADD CONSTRAINT "production_operation_dependencies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_operation_dependencies" ADD CONSTRAINT "production_operation_dependencies_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "production_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_operation_dependencies" ADD CONSTRAINT "production_operation_dependencies_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "production_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_consumptions" ADD CONSTRAINT "production_batch_consumptions_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_needId_fkey" FOREIGN KEY ("needId") REFERENCES "production_needs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
