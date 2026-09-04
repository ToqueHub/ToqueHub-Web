-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "haccpInstalledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "haccp_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dlc" TIMESTAMP(3),
    "dlcDays" INTEGER,
    "description" TEXT,
    "price" DECIMAL(12,4),
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_temperature_equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_temperature_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_temperature_readings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "equipmentId" UUID NOT NULL,
    "temperature" DECIMAL(7,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_temperature_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_receptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "supplier" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productType" TEXT,
    "temperature" TEXT NOT NULL,
    "lotNumber" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "photo" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_receptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_traceability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "date" TIMESTAMP(3) NOT NULL,
    "photo" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "barcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_traceability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_process_equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "capacity" TEXT,
    "temperatureMin" DECIMAL(7,2),
    "temperatureMax" DECIMAL(7,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_process_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_process_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "type" TEXT NOT NULL,
    "productId" UUID NOT NULL,
    "equipmentId" UUID NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "startTemperature" DECIMAL(7,2) NOT NULL,
    "endTemperature" DECIMAL(7,2),
    "status" TEXT NOT NULL DEFAULT 'en_cours',
    "notes" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_process_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_oil_equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "capacity" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_oil_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_oil_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "equipmentId" UUID NOT NULL,
    "testMethod" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "photo" TEXT,
    "photoDocumentId" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_oil_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_cleaning_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_cleaning_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_cleaning_surfaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "zoneId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "lastCleaned" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_cleaning_surfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_cleaning_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "totalSurfaces" INTEGER NOT NULL DEFAULT 0,
    "completedSurfaces" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_cleaning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_cleaned_surfaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "sessionId" UUID NOT NULL,
    "surfaceId" UUID NOT NULL,
    "surfaceName" TEXT NOT NULL,
    "zoneId" UUID NOT NULL,
    "zoneName" TEXT NOT NULL,
    "cleanedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "haccp_cleaned_surfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_production_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "lotNumber" TEXT NOT NULL,
    "finishedProductId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "photos" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'en_cours',
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_production_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "haccp_daily_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "modules" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdfPath" TEXT,
    "fileSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "haccp_daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "haccp_products_organizationId_idx" ON "haccp_products"("organizationId");
CREATE INDEX "haccp_products_createdById_idx" ON "haccp_products"("createdById");
CREATE INDEX "haccp_products_type_idx" ON "haccp_products"("type");
CREATE INDEX "haccp_products_isActive_idx" ON "haccp_products"("isActive");
CREATE INDEX "haccp_temperature_equipment_organizationId_idx" ON "haccp_temperature_equipment"("organizationId");
CREATE INDEX "haccp_temperature_equipment_createdById_idx" ON "haccp_temperature_equipment"("createdById");
CREATE INDEX "haccp_temperature_equipment_type_idx" ON "haccp_temperature_equipment"("type");
CREATE INDEX "haccp_temperature_equipment_isActive_idx" ON "haccp_temperature_equipment"("isActive");
CREATE INDEX "haccp_temperature_readings_organizationId_idx" ON "haccp_temperature_readings"("organizationId");
CREATE INDEX "haccp_temperature_readings_createdById_idx" ON "haccp_temperature_readings"("createdById");
CREATE INDEX "haccp_temperature_readings_equipmentId_idx" ON "haccp_temperature_readings"("equipmentId");
CREATE INDEX "haccp_temperature_readings_date_idx" ON "haccp_temperature_readings"("date");
CREATE INDEX "haccp_receptions_organizationId_idx" ON "haccp_receptions"("organizationId");
CREATE INDEX "haccp_receptions_createdById_idx" ON "haccp_receptions"("createdById");
CREATE INDEX "haccp_receptions_date_idx" ON "haccp_receptions"("date");
CREATE INDEX "haccp_receptions_supplier_idx" ON "haccp_receptions"("supplier");
CREATE INDEX "haccp_receptions_lotNumber_idx" ON "haccp_receptions"("lotNumber");
CREATE INDEX "haccp_traceability_organizationId_idx" ON "haccp_traceability"("organizationId");
CREATE INDEX "haccp_traceability_createdById_idx" ON "haccp_traceability"("createdById");
CREATE INDEX "haccp_traceability_date_idx" ON "haccp_traceability"("date");
CREATE INDEX "haccp_traceability_lotNumber_idx" ON "haccp_traceability"("lotNumber");
CREATE INDEX "haccp_traceability_barcode_idx" ON "haccp_traceability"("barcode");
CREATE INDEX "haccp_process_equipment_organizationId_idx" ON "haccp_process_equipment"("organizationId");
CREATE INDEX "haccp_process_equipment_createdById_idx" ON "haccp_process_equipment"("createdById");
CREATE INDEX "haccp_process_equipment_type_idx" ON "haccp_process_equipment"("type");
CREATE INDEX "haccp_process_equipment_isActive_idx" ON "haccp_process_equipment"("isActive");
CREATE INDEX "haccp_process_sessions_organizationId_idx" ON "haccp_process_sessions"("organizationId");
CREATE INDEX "haccp_process_sessions_createdById_idx" ON "haccp_process_sessions"("createdById");
CREATE INDEX "haccp_process_sessions_type_idx" ON "haccp_process_sessions"("type");
CREATE INDEX "haccp_process_sessions_sessionDate_idx" ON "haccp_process_sessions"("sessionDate");
CREATE INDEX "haccp_process_sessions_status_idx" ON "haccp_process_sessions"("status");
CREATE INDEX "haccp_process_sessions_productId_idx" ON "haccp_process_sessions"("productId");
CREATE INDEX "haccp_process_sessions_equipmentId_idx" ON "haccp_process_sessions"("equipmentId");
CREATE INDEX "haccp_oil_equipment_organizationId_idx" ON "haccp_oil_equipment"("organizationId");
CREATE INDEX "haccp_oil_equipment_createdById_idx" ON "haccp_oil_equipment"("createdById");
CREATE INDEX "haccp_oil_equipment_type_idx" ON "haccp_oil_equipment"("type");
CREATE INDEX "haccp_oil_equipment_isActive_idx" ON "haccp_oil_equipment"("isActive");
CREATE INDEX "haccp_oil_sessions_organizationId_idx" ON "haccp_oil_sessions"("organizationId");
CREATE INDEX "haccp_oil_sessions_createdById_idx" ON "haccp_oil_sessions"("createdById");
CREATE INDEX "haccp_oil_sessions_equipmentId_idx" ON "haccp_oil_sessions"("equipmentId");
CREATE INDEX "haccp_oil_sessions_sessionDate_idx" ON "haccp_oil_sessions"("sessionDate");
CREATE INDEX "haccp_oil_sessions_action_idx" ON "haccp_oil_sessions"("action");
CREATE INDEX "haccp_cleaning_zones_organizationId_idx" ON "haccp_cleaning_zones"("organizationId");
CREATE INDEX "haccp_cleaning_zones_createdById_idx" ON "haccp_cleaning_zones"("createdById");
CREATE INDEX "haccp_cleaning_zones_isActive_idx" ON "haccp_cleaning_zones"("isActive");
CREATE INDEX "haccp_cleaning_surfaces_organizationId_idx" ON "haccp_cleaning_surfaces"("organizationId");
CREATE INDEX "haccp_cleaning_surfaces_createdById_idx" ON "haccp_cleaning_surfaces"("createdById");
CREATE INDEX "haccp_cleaning_surfaces_zoneId_idx" ON "haccp_cleaning_surfaces"("zoneId");
CREATE INDEX "haccp_cleaning_surfaces_frequency_idx" ON "haccp_cleaning_surfaces"("frequency");
CREATE INDEX "haccp_cleaning_surfaces_isActive_idx" ON "haccp_cleaning_surfaces"("isActive");
CREATE INDEX "haccp_cleaning_sessions_organizationId_idx" ON "haccp_cleaning_sessions"("organizationId");
CREATE INDEX "haccp_cleaning_sessions_createdById_idx" ON "haccp_cleaning_sessions"("createdById");
CREATE INDEX "haccp_cleaning_sessions_sessionDate_idx" ON "haccp_cleaning_sessions"("sessionDate");
CREATE INDEX "haccp_cleaning_sessions_status_idx" ON "haccp_cleaning_sessions"("status");
CREATE UNIQUE INDEX "haccp_cleaned_surfaces_sessionId_surfaceId_key" ON "haccp_cleaned_surfaces"("sessionId", "surfaceId");
CREATE INDEX "haccp_cleaned_surfaces_organizationId_idx" ON "haccp_cleaned_surfaces"("organizationId");
CREATE INDEX "haccp_cleaned_surfaces_createdById_idx" ON "haccp_cleaned_surfaces"("createdById");
CREATE INDEX "haccp_cleaned_surfaces_sessionId_idx" ON "haccp_cleaned_surfaces"("sessionId");
CREATE INDEX "haccp_cleaned_surfaces_surfaceId_idx" ON "haccp_cleaned_surfaces"("surfaceId");
CREATE INDEX "haccp_cleaned_surfaces_zoneId_idx" ON "haccp_cleaned_surfaces"("zoneId");
CREATE INDEX "haccp_cleaned_surfaces_cleanedAt_idx" ON "haccp_cleaned_surfaces"("cleanedAt");
CREATE INDEX "haccp_production_sessions_organizationId_idx" ON "haccp_production_sessions"("organizationId");
CREATE INDEX "haccp_production_sessions_createdById_idx" ON "haccp_production_sessions"("createdById");
CREATE INDEX "haccp_production_sessions_finishedProductId_idx" ON "haccp_production_sessions"("finishedProductId");
CREATE INDEX "haccp_production_sessions_productionDate_idx" ON "haccp_production_sessions"("productionDate");
CREATE INDEX "haccp_production_sessions_status_idx" ON "haccp_production_sessions"("status");
CREATE UNIQUE INDEX "haccp_daily_reports_organizationId_reportDate_key" ON "haccp_daily_reports"("organizationId", "reportDate");
CREATE INDEX "haccp_daily_reports_organizationId_idx" ON "haccp_daily_reports"("organizationId");
CREATE INDEX "haccp_daily_reports_createdById_idx" ON "haccp_daily_reports"("createdById");
CREATE INDEX "haccp_daily_reports_status_idx" ON "haccp_daily_reports"("status");

-- AddForeignKey
ALTER TABLE "haccp_products" ADD CONSTRAINT "haccp_products_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_products" ADD CONSTRAINT "haccp_products_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_temperature_equipment" ADD CONSTRAINT "haccp_temperature_equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_temperature_equipment" ADD CONSTRAINT "haccp_temperature_equipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_temperature_readings" ADD CONSTRAINT "haccp_temperature_readings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_temperature_readings" ADD CONSTRAINT "haccp_temperature_readings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_temperature_readings" ADD CONSTRAINT "haccp_temperature_readings_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "haccp_temperature_equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_receptions" ADD CONSTRAINT "haccp_receptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_receptions" ADD CONSTRAINT "haccp_receptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_traceability" ADD CONSTRAINT "haccp_traceability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_traceability" ADD CONSTRAINT "haccp_traceability_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_process_equipment" ADD CONSTRAINT "haccp_process_equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_process_equipment" ADD CONSTRAINT "haccp_process_equipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_process_sessions" ADD CONSTRAINT "haccp_process_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_process_sessions" ADD CONSTRAINT "haccp_process_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_process_sessions" ADD CONSTRAINT "haccp_process_sessions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "haccp_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_process_sessions" ADD CONSTRAINT "haccp_process_sessions_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "haccp_process_equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_oil_equipment" ADD CONSTRAINT "haccp_oil_equipment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_oil_equipment" ADD CONSTRAINT "haccp_oil_equipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_oil_sessions" ADD CONSTRAINT "haccp_oil_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_oil_sessions" ADD CONSTRAINT "haccp_oil_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_oil_sessions" ADD CONSTRAINT "haccp_oil_sessions_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "haccp_oil_equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_oil_sessions" ADD CONSTRAINT "haccp_oil_sessions_photoDocumentId_fkey" FOREIGN KEY ("photoDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_zones" ADD CONSTRAINT "haccp_cleaning_zones_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_zones" ADD CONSTRAINT "haccp_cleaning_zones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_surfaces" ADD CONSTRAINT "haccp_cleaning_surfaces_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_surfaces" ADD CONSTRAINT "haccp_cleaning_surfaces_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_surfaces" ADD CONSTRAINT "haccp_cleaning_surfaces_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "haccp_cleaning_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_sessions" ADD CONSTRAINT "haccp_cleaning_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaning_sessions" ADD CONSTRAINT "haccp_cleaning_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaned_surfaces" ADD CONSTRAINT "haccp_cleaned_surfaces_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaned_surfaces" ADD CONSTRAINT "haccp_cleaned_surfaces_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaned_surfaces" ADD CONSTRAINT "haccp_cleaned_surfaces_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "haccp_cleaning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaned_surfaces" ADD CONSTRAINT "haccp_cleaned_surfaces_surfaceId_fkey" FOREIGN KEY ("surfaceId") REFERENCES "haccp_cleaning_surfaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_cleaned_surfaces" ADD CONSTRAINT "haccp_cleaned_surfaces_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "haccp_cleaning_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_production_sessions" ADD CONSTRAINT "haccp_production_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_production_sessions" ADD CONSTRAINT "haccp_production_sessions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "haccp_production_sessions" ADD CONSTRAINT "haccp_production_sessions_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "haccp_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "haccp_daily_reports" ADD CONSTRAINT "haccp_daily_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "haccp_daily_reports" ADD CONSTRAINT "haccp_daily_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
