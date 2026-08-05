CREATE TYPE "FinanceProvider" AS ENUM ('FENNOA', 'FLATPAY', 'PAYPAL_POS', 'LOYVERSE', 'GENERIC');
CREATE TYPE "FinanceSourceType" AS ENUM ('ACCOUNTING_API', 'POS_API', 'FILE_IMPORT');
CREATE TYPE "FinanceSourceStatus" AS ENUM ('NOT_CONNECTED', 'READY', 'ATTENTION', 'ERROR');
CREATE TYPE "FinanceImportStatus" AS ENUM ('UPLOADED', 'NEEDS_REVIEW', 'READY', 'FAILED');
CREATE TYPE "FinanceReportKind" AS ENUM ('SALES_ORDERS', 'PRODUCT_SALES', 'DAILY_CLOSURE', 'RECEIPTS', 'ACCOUNTING', 'BUDGET', 'UNKNOWN');

ALTER TYPE "AuditAction" ADD VALUE 'MODULE_FINANCE_INSTALLED';
ALTER TYPE "AuditAction" ADD VALUE 'MODULE_FINANCE_UNINSTALLED';
ALTER TYPE "AuditAction" ADD VALUE 'FINANCE_IMPORT_UPLOADED';

ALTER TABLE "organizations" ADD COLUMN "financeInstalledAt" TIMESTAMP(3);

CREATE TABLE "finance_settings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_data_sources" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "FinanceProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" "FinanceSourceType" NOT NULL,
    "status" "FinanceSourceStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "isPrimarySales" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "coverageStart" TIMESTAMP(3),
    "coverageEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_data_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_import_batches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceId" UUID,
    "uploadedById" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER NOT NULL,
    "status" "FinanceImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "provider" "FinanceProvider" NOT NULL,
    "reportKind" "FinanceReportKind" NOT NULL DEFAULT 'UNKNOWN',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "rowCount" INTEGER,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "grossTotal" DECIMAL(14,4),
    "netTotal" DECIMAL(14,4),
    "vatTotal" DECIMAL(14,4),
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "finance_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_settings_organizationId_key" ON "finance_settings"("organizationId");
CREATE UNIQUE INDEX "finance_data_sources_organizationId_provider_name_key" ON "finance_data_sources"("organizationId", "provider", "name");
CREATE INDEX "finance_data_sources_organizationId_status_idx" ON "finance_data_sources"("organizationId", "status");
CREATE UNIQUE INDEX "finance_import_batches_organizationId_fileHash_key" ON "finance_import_batches"("organizationId", "fileHash");
CREATE INDEX "finance_import_batches_organizationId_createdAt_idx" ON "finance_import_batches"("organizationId", "createdAt");
CREATE INDEX "finance_import_batches_sourceId_idx" ON "finance_import_batches"("sourceId");
CREATE INDEX "finance_import_batches_uploadedById_idx" ON "finance_import_batches"("uploadedById");

ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_data_sources" ADD CONSTRAINT "finance_data_sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_import_batches" ADD CONSTRAINT "finance_import_batches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_import_batches" ADD CONSTRAINT "finance_import_batches_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_import_batches" ADD CONSTRAINT "finance_import_batches_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
