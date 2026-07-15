-- CreateEnum
CREATE TYPE "PlanningTimeUnit" AS ENUM ('MINUTES', 'DAYS');

-- CreateEnum
CREATE TYPE "PlanningCounterDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "PlanningCounterSourceType" AS ENUM ('ASSIGNMENT', 'DAY_STATUS', 'HR_ABSENCE', 'ATTENDANCE', 'MANUAL_ADJUSTMENT', 'IMPORT', 'TEMPLATE', 'REPLACEMENT', 'RECOMPUTE');

-- CreateEnum
CREATE TYPE "PlanningDayStatusSourceType" AS ENUM ('MANUAL', 'ASSIGNMENT_COMMENT', 'HR_ABSENCE', 'IMPORT', 'TEMPLATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PlanningVisibilityLevel" AS ENUM ('EMPLOYEE', 'MANAGER', 'ADMIN', 'INTERNAL');

-- CreateTable
CREATE TABLE "planning_day_statuses" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "statusCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceType" "PlanningDayStatusSourceType" NOT NULL DEFAULT 'MANUAL',
    "sourceId" TEXT,
    "affectsPlanning" BOOLEAN NOT NULL DEFAULT true,
    "affectsCounters" BOOLEAN NOT NULL DEFAULT false,
    "visibilityLevel" "PlanningVisibilityLevel" NOT NULL DEFAULT 'MANAGER',
    "metadata" JSONB,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_day_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_code_dictionary" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "rawCode" TEXT NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultStatusCode" TEXT,
    "accountType" TEXT,
    "unit" "PlanningTimeUnit",
    "defaultQuantity" INTEGER,
    "affectsWorkedTime" BOOLEAN NOT NULL DEFAULT false,
    "affectsPaidTime" BOOLEAN NOT NULL DEFAULT false,
    "affectsLeaveBalance" BOOLEAN NOT NULL DEFAULT false,
    "visibleInPlanning" BOOLEAN NOT NULL DEFAULT true,
    "visibleInCounters" BOOLEAN NOT NULL DEFAULT false,
    "requiresAdminValidation" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_code_dictionary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_policy_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sector" TEXT,
    "annualReferenceMinutes" INTEGER,
    "defaultWeeklyMinutes" INTEGER,
    "defaultDailyMinutes" INTEGER,
    "defaultBreakMinutes" INTEGER,
    "maxDailyMinutes" INTEGER,
    "maxWeeklyMinutes" INTEGER,
    "minDailyRestMinutes" INTEGER,
    "minWeeklyRestMinutes" INTEGER,
    "leaveUnit" "PlanningTimeUnit" NOT NULL DEFAULT 'DAYS',
    "overtimeMode" TEXT,
    "rttMode" TEXT,
    "annualizationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "countersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "customRules" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_policy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_counter_accounts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "accountType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" "PlanningTimeUnit" NOT NULL,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "accrued" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "adjusted" INTEGER NOT NULL DEFAULT 0,
    "closingBalance" INTEGER NOT NULL DEFAULT 0,
    "visibleToEmployee" BOOLEAN NOT NULL DEFAULT false,
    "visibleToManager" BOOLEAN NOT NULL DEFAULT true,
    "visibleToAdmin" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_counter_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_counter_transactions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" "PlanningTimeUnit" NOT NULL,
    "direction" "PlanningCounterDirection" NOT NULL,
    "sourceType" "PlanningCounterSourceType" NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT,
    "label" TEXT NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_counter_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planning_day_statuses_organizationId_employeeId_date_statusCode_sourceType_sourceId_key" ON "planning_day_statuses"("organizationId", "employeeId", "date", "statusCode", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "planning_day_statuses_organizationId_idx" ON "planning_day_statuses"("organizationId");

-- CreateIndex
CREATE INDEX "planning_day_statuses_employeeId_idx" ON "planning_day_statuses"("employeeId");

-- CreateIndex
CREATE INDEX "planning_day_statuses_date_idx" ON "planning_day_statuses"("date");

-- CreateIndex
CREATE INDEX "planning_day_statuses_statusCode_idx" ON "planning_day_statuses"("statusCode");

-- CreateIndex
CREATE INDEX "planning_day_statuses_sourceType_idx" ON "planning_day_statuses"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "planning_code_dictionary_organizationId_normalizedCode_key" ON "planning_code_dictionary"("organizationId", "normalizedCode");

-- CreateIndex
CREATE INDEX "planning_code_dictionary_organizationId_idx" ON "planning_code_dictionary"("organizationId");

-- CreateIndex
CREATE INDEX "planning_code_dictionary_rawCode_idx" ON "planning_code_dictionary"("rawCode");

-- CreateIndex
CREATE INDEX "planning_code_dictionary_category_idx" ON "planning_code_dictionary"("category");

-- CreateIndex
CREATE INDEX "planning_code_dictionary_defaultStatusCode_idx" ON "planning_code_dictionary"("defaultStatusCode");

-- CreateIndex
CREATE UNIQUE INDEX "planning_policy_profiles_organizationId_name_key" ON "planning_policy_profiles"("organizationId", "name");

-- CreateIndex
CREATE INDEX "planning_policy_profiles_organizationId_idx" ON "planning_policy_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "planning_policy_profiles_sector_idx" ON "planning_policy_profiles"("sector");

-- CreateIndex
CREATE INDEX "planning_policy_profiles_isDefault_idx" ON "planning_policy_profiles"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "planning_counter_accounts_organizationId_employeeId_periodYear_code_key" ON "planning_counter_accounts"("organizationId", "employeeId", "periodYear", "code");

-- CreateIndex
CREATE INDEX "planning_counter_accounts_organizationId_idx" ON "planning_counter_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "planning_counter_accounts_employeeId_idx" ON "planning_counter_accounts"("employeeId");

-- CreateIndex
CREATE INDEX "planning_counter_accounts_periodYear_idx" ON "planning_counter_accounts"("periodYear");

-- CreateIndex
CREATE INDEX "planning_counter_accounts_accountType_idx" ON "planning_counter_accounts"("accountType");

-- CreateIndex
CREATE INDEX "planning_counter_accounts_code_idx" ON "planning_counter_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "planning_counter_transactions_organizationId_idempotencyKey_key" ON "planning_counter_transactions"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "planning_counter_transactions_organizationId_idx" ON "planning_counter_transactions"("organizationId");

-- CreateIndex
CREATE INDEX "planning_counter_transactions_accountId_idx" ON "planning_counter_transactions"("accountId");

-- CreateIndex
CREATE INDEX "planning_counter_transactions_employeeId_idx" ON "planning_counter_transactions"("employeeId");

-- CreateIndex
CREATE INDEX "planning_counter_transactions_date_idx" ON "planning_counter_transactions"("date");

-- CreateIndex
CREATE INDEX "planning_counter_transactions_sourceType_idx" ON "planning_counter_transactions"("sourceType");

-- CreateIndex
CREATE INDEX "planning_counter_transactions_sourceId_idx" ON "planning_counter_transactions"("sourceId");

-- AddForeignKey
ALTER TABLE "planning_day_statuses" ADD CONSTRAINT "planning_day_statuses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_day_statuses" ADD CONSTRAINT "planning_day_statuses_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_day_statuses" ADD CONSTRAINT "planning_day_statuses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_day_statuses" ADD CONSTRAINT "planning_day_statuses_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_code_dictionary" ADD CONSTRAINT "planning_code_dictionary_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_policy_profiles" ADD CONSTRAINT "planning_policy_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_policy_profiles" ADD CONSTRAINT "planning_policy_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_counter_accounts" ADD CONSTRAINT "planning_counter_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_counter_accounts" ADD CONSTRAINT "planning_counter_accounts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_counter_transactions" ADD CONSTRAINT "planning_counter_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_counter_transactions" ADD CONSTRAINT "planning_counter_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "planning_counter_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_counter_transactions" ADD CONSTRAINT "planning_counter_transactions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_counter_transactions" ADD CONSTRAINT "planning_counter_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
