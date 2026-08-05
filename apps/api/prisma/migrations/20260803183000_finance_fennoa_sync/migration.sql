CREATE TYPE "FinanceAccountCategory" AS ENUM ('REVENUE', 'MATERIAL_PURCHASES', 'PAYROLL', 'OTHER_OPEX', 'CASH', 'FINANCIAL', 'TAX', 'OTHER');
CREATE TYPE "FinanceSyncRunType" AS ENUM ('TEST', 'FULL', 'INCREMENTAL');
CREATE TYPE "FinanceSyncRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "finance_settings"
  ADD COLUMN "fennoaApiKeyCipherVersion" INTEGER,
  ADD COLUMN "fennoaApiKeyEncrypted" TEXT,
  ADD COLUMN "fennoaApiKeyMask" TEXT,
  ADD COLUMN "fennoaApiKeyUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "fennoaApiVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "fennoaBaseUrl" TEXT NOT NULL DEFAULT 'https://app.fennoa.com/api',
  ADD COLUMN "fennoaLastError" TEXT,
  ADD COLUMN "fennoaLastTestedAt" TIMESTAMP(3),
  ADD COLUMN "fennoaUsername" TEXT;

CREATE TABLE "finance_accounts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameSv" TEXT,
  "nameEn" TEXT,
  "vatCodeId" INTEGER,
  "vatCodeType" INTEGER,
  "vatCode" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "category" "FinanceAccountCategory" NOT NULL DEFAULT 'OTHER',
  "categoryOverride" BOOLEAN NOT NULL DEFAULT false,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_accounting_periods" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "externalId" INTEGER NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "accountingLockedAt" TIMESTAMP(3),
  "salesLockedAt" TIMESTAMP(3),
  "purchasesLockedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_ledger_entries" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "externalKey" TEXT NOT NULL,
  "externalStatementId" TEXT,
  "accountCode" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL,
  "debit" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "credit" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "openingBalance" DECIMAL(14,4),
  "closingBalance" DECIMAL(14,4),
  "description" TEXT,
  "series" TEXT,
  "number" INTEGER,
  "entryType" INTEGER,
  "sourceEntityId" TEXT,
  "sourceUrl" TEXT,
  "dimensions" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_budget_lines" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "externalKey" TEXT NOT NULL,
  "externalBudgetId" INTEGER,
  "budgetName" TEXT,
  "accountingPeriodExternalId" INTEGER NOT NULL,
  "accountCode" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "amount" DECIMAL(14,4) NOT NULL,
  "dimensions" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_sync_runs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "type" "FinanceSyncRunType" NOT NULL,
  "status" "FinanceSyncRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "accountsCount" INTEGER NOT NULL DEFAULT 0,
  "ledgerRowsCount" INTEGER NOT NULL DEFAULT 0,
  "budgetRowsCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_daily_sales" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "sourceId" UUID NOT NULL,
  "importBatchId" UUID,
  "externalKey" TEXT NOT NULL,
  "saleDate" TIMESTAMP(3) NOT NULL,
  "grossAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "vatAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "refundAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "costAmount" DECIMAL(14,4),
  "transactionCount" INTEGER NOT NULL DEFAULT 0,
  "paymentMethod" TEXT,
  "productCategory" TEXT,
  "isRevenueRecord" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_daily_sales_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finance_accounts_organizationId_category_idx" ON "finance_accounts"("organizationId", "category");
CREATE UNIQUE INDEX "finance_accounts_organizationId_code_key" ON "finance_accounts"("organizationId", "code");
CREATE INDEX "finance_accounting_periods_organizationId_startDate_endDate_idx" ON "finance_accounting_periods"("organizationId", "startDate", "endDate");
CREATE UNIQUE INDEX "finance_accounting_periods_organizationId_externalId_key" ON "finance_accounting_periods"("organizationId", "externalId");
CREATE INDEX "finance_ledger_entries_organizationId_entryDate_idx" ON "finance_ledger_entries"("organizationId", "entryDate");
CREATE INDEX "finance_ledger_entries_organizationId_accountCode_entryDate_idx" ON "finance_ledger_entries"("organizationId", "accountCode", "entryDate");
CREATE INDEX "finance_ledger_entries_sourceId_idx" ON "finance_ledger_entries"("sourceId");
CREATE UNIQUE INDEX "finance_ledger_entries_organizationId_externalKey_key" ON "finance_ledger_entries"("organizationId", "externalKey");
CREATE INDEX "finance_budget_lines_organizationId_accountingPeriodExterna_idx" ON "finance_budget_lines"("organizationId", "accountingPeriodExternalId", "month");
CREATE INDEX "finance_budget_lines_organizationId_accountCode_idx" ON "finance_budget_lines"("organizationId", "accountCode");
CREATE UNIQUE INDEX "finance_budget_lines_organizationId_externalKey_key" ON "finance_budget_lines"("organizationId", "externalKey");
CREATE INDEX "finance_sync_runs_organizationId_startedAt_idx" ON "finance_sync_runs"("organizationId", "startedAt");
CREATE INDEX "finance_sync_runs_sourceId_status_idx" ON "finance_sync_runs"("sourceId", "status");
CREATE INDEX "finance_daily_sales_organizationId_saleDate_idx" ON "finance_daily_sales"("organizationId", "saleDate");
CREATE INDEX "finance_daily_sales_sourceId_saleDate_idx" ON "finance_daily_sales"("sourceId", "saleDate");
CREATE INDEX "finance_daily_sales_importBatchId_idx" ON "finance_daily_sales"("importBatchId");
CREATE UNIQUE INDEX "finance_daily_sales_organizationId_sourceId_externalKey_key" ON "finance_daily_sales"("organizationId", "sourceId", "externalKey");

ALTER TABLE "finance_accounts" ADD CONSTRAINT "finance_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_accounting_periods" ADD CONSTRAINT "finance_accounting_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_ledger_entries" ADD CONSTRAINT "finance_ledger_entries_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_budget_lines" ADD CONSTRAINT "finance_budget_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_sync_runs" ADD CONSTRAINT "finance_sync_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_sync_runs" ADD CONSTRAINT "finance_sync_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_daily_sales" ADD CONSTRAINT "finance_daily_sales_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_daily_sales" ADD CONSTRAINT "finance_daily_sales_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_daily_sales" ADD CONSTRAINT "finance_daily_sales_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "finance_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
