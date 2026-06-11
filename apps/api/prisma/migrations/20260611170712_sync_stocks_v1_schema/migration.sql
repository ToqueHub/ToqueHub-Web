-- DropIndex
DROP INDEX "audit_logs_organizationId_createdAt_idx";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inventories" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inventory_lines" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "locations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "unit_conversions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

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
CREATE INDEX "locations_isArchived_idx" ON "locations"("isArchived");

-- CreateIndex
CREATE INDEX "lots_siteId_idx" ON "lots"("siteId");

-- CreateIndex
CREATE INDEX "lots_locationId_idx" ON "lots"("locationId");

-- CreateIndex
CREATE INDEX "products_primarySupplierId_idx" ON "products"("primarySupplierId");

-- CreateIndex
CREATE INDEX "sites_isArchived_idx" ON "sites"("isArchived");

-- CreateIndex
CREATE INDEX "stock_movements_sourceSiteId_idx" ON "stock_movements"("sourceSiteId");

-- CreateIndex
CREATE INDEX "stock_movements_sourceLocationId_idx" ON "stock_movements"("sourceLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_destinationSiteId_idx" ON "stock_movements"("destinationSiteId");

-- CreateIndex
CREATE INDEX "stock_movements_destinationLocationId_idx" ON "stock_movements"("destinationLocationId");

-- CreateIndex
CREATE INDEX "stock_movements_movementDate_idx" ON "stock_movements"("movementDate");

-- CreateIndex
CREATE INDEX "stocks_siteId_idx" ON "stocks"("siteId");

-- CreateIndex
CREATE INDEX "stocks_locationId_idx" ON "stocks"("locationId");

-- CreateIndex
CREATE INDEX "unit_conversions_organizationId_idx" ON "unit_conversions"("organizationId");
