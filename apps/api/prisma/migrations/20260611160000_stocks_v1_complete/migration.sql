-- Stocks V1 complete backend schema extension.
-- Keeps historical business rows; all destructive business operations are replaced by archival flags.

CREATE TYPE "UnitType" AS ENUM ('MASS', 'VOLUME', 'COUNT', 'PACKAGE', 'OTHER');
CREATE TYPE "InventoryStatus" AS ENUM ('DRAFT', 'VALIDATED');
CREATE TYPE "AuditAction" AS ENUM (
  'MODULE_STOCKS_INSTALLED','MODULE_STOCKS_UNINSTALLED',
  'CATEGORY_CREATED','CATEGORY_UPDATED','CATEGORY_ARCHIVED',
  'UNIT_CREATED','UNIT_UPDATED','UNIT_ARCHIVED',
  'SUPPLIER_CREATED','SUPPLIER_UPDATED','SUPPLIER_ARCHIVED',
  'PRODUCT_CREATED','PRODUCT_UPDATED','PRODUCT_ARCHIVED',
  'SITE_CREATED','SITE_UPDATED','SITE_ARCHIVED',
  'LOCATION_CREATED','LOCATION_UPDATED','LOCATION_ARCHIVED',
  'LOT_CREATED','LOT_UPDATED','MOVEMENT_CREATED','TRANSFER_CREATED',
  'INVENTORY_CREATED','INVENTORY_UPDATED','INVENTORY_VALIDATED'
);

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'IN';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'OUT';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER';

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "type" "UnitType" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "averagePrice" DECIMAL(12,4) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "minimumStock" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "primarySupplierId" UUID;

CREATE TABLE IF NOT EXISTS "sites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "organizationId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "organizationId" UUID NOT NULL,
  "siteId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "siteId" UUID;
ALTER TABLE "lots" ADD COLUMN IF NOT EXISTS "locationId" UUID;
ALTER TABLE "stocks" ADD COLUMN IF NOT EXISTS "siteId" UUID;
ALTER TABLE "stocks" ADD COLUMN IF NOT EXISTS "locationId" UUID;

ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "inputQuantity" DECIMAL(12,3);
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "unitId" UUID;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "unitSymbolSnapshot" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "sourceSiteId" UUID;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "sourceLocationId" UUID;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "destinationSiteId" UUID;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "destinationLocationId" UUID;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "inventoryId" UUID;

CREATE TABLE IF NOT EXISTS "unit_conversions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "fromUnitId" UUID NOT NULL,
  "toUnitId" UUID NOT NULL,
  "factor" DECIMAL(18,6) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "inventory_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inventoryId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "lotId" UUID,
  "theoreticalQuantity" DECIMAL(12,3) NOT NULL,
  "countedQuantity" DECIMAL(12,3),
  "varianceQuantity" DECIMAL(12,3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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

DROP INDEX IF EXISTS "stocks_organizationId_productId_lotId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "stocks_organizationId_productId_lotId_siteId_locationId_key" ON "stocks"("organizationId", "productId", "lotId", "siteId", "locationId");
CREATE UNIQUE INDEX IF NOT EXISTS "sites_organizationId_name_key" ON "sites"("organizationId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "locations_organizationId_siteId_name_key" ON "locations"("organizationId", "siteId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "unit_conversions_organizationId_fromUnitId_toUnitId_key" ON "unit_conversions"("organizationId", "fromUnitId", "toUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_lines_inventoryId_productId_lotId_key" ON "inventory_lines"("inventoryId", "productId", "lotId");

CREATE INDEX IF NOT EXISTS "categories_isArchived_idx" ON "categories"("isArchived");
CREATE INDEX IF NOT EXISTS "units_isArchived_idx" ON "units"("isArchived");
CREATE INDEX IF NOT EXISTS "suppliers_isArchived_idx" ON "suppliers"("isArchived");
CREATE INDEX IF NOT EXISTS "products_isArchived_idx" ON "products"("isArchived");
CREATE INDEX IF NOT EXISTS "sites_organizationId_idx" ON "sites"("organizationId");
CREATE INDEX IF NOT EXISTS "locations_organizationId_idx" ON "locations"("organizationId");
CREATE INDEX IF NOT EXISTS "locations_siteId_idx" ON "locations"("siteId");
CREATE INDEX IF NOT EXISTS "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

ALTER TABLE "products" ADD CONSTRAINT "products_primarySupplierId_fkey" FOREIGN KEY ("primarySupplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sites" ADD CONSTRAINT "sites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lots" ADD CONSTRAINT "lots_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lots" ADD CONSTRAINT "lots_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sourceSiteId_fkey" FOREIGN KEY ("sourceSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_destinationSiteId_fkey" FOREIGN KEY ("destinationSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_fromUnitId_fkey" FOREIGN KEY ("fromUnitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
