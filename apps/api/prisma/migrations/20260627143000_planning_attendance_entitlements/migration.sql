-- Planning attendance persistence and employee entitlements.
-- Additive migration: do not rewrite previous Planning counter migrations.

-- AlterEnum
ALTER TYPE "PlanningCounterSourceType" ADD VALUE IF NOT EXISTS 'ENTITLEMENT_ACCRUAL';

-- CreateEnum
CREATE TYPE "PlanningAttendanceStatus" AS ENUM ('DRAFT', 'SIGNED', 'SUBMITTED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlanningEntitlementAccrualFrequency" AS ENUM ('MONTHLY', 'YEARLY', 'WEEKLY', 'MANUAL', 'EVENT_BASED');

-- CreateTable
CREATE TABLE "planning_attendance_entries" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assignmentId" UUID,
    "employeeId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "plannedStartTime" TIMESTAMP(3),
    "plannedEndTime" TIMESTAMP(3),
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "declaredStartTime" TIMESTAMP(3),
    "declaredEndTime" TIMESTAMP(3),
    "declaredMinutes" INTEGER,
    "validatedStartTime" TIMESTAMP(3),
    "validatedEndTime" TIMESTAMP(3),
    "validatedMinutes" INTEGER,
    "varianceMinutes" INTEGER,
    "status" "PlanningAttendanceStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMP(3),
    "signedById" UUID,
    "validatedAt" TIMESTAMP(3),
    "validatedById" UUID,
    "source" TEXT NOT NULL DEFAULT 'PLANNING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_attendance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_entitlement_rules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "accountType" TEXT NOT NULL,
    "unit" "PlanningTimeUnit" NOT NULL,
    "accrualFrequency" "PlanningEntitlementAccrualFrequency" NOT NULL DEFAULT 'MANUAL',
    "accrualQuantity" DECIMAL(12,3),
    "startsAfterTrialPeriod" BOOLEAN NOT NULL DEFAULT false,
    "minimumSeniorityMonths" INTEGER,
    "prorateByContractTime" BOOLEAN NOT NULL DEFAULT false,
    "maxBalance" INTEGER,
    "carryOverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_entitlement_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_employee_entitlements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "unit" "PlanningTimeUnit" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "entitlementRuleId" UUID,
    "policyProfileId" UUID,
    "counterAccountId" UUID,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planning_employee_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planning_attendance_entries_organizationId_assignmentId_key" ON "planning_attendance_entries"("organizationId", "assignmentId");

-- CreateIndex
CREATE INDEX "planning_attendance_entries_organizationId_idx" ON "planning_attendance_entries"("organizationId");

-- CreateIndex
CREATE INDEX "planning_attendance_entries_assignmentId_idx" ON "planning_attendance_entries"("assignmentId");

-- CreateIndex
CREATE INDEX "planning_attendance_entries_employeeId_idx" ON "planning_attendance_entries"("employeeId");

-- CreateIndex
CREATE INDEX "planning_attendance_entries_date_idx" ON "planning_attendance_entries"("date");

-- CreateIndex
CREATE INDEX "planning_attendance_entries_status_idx" ON "planning_attendance_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "planning_entitlement_rules_organizationId_code_key" ON "planning_entitlement_rules"("organizationId", "code");

-- CreateIndex
CREATE INDEX "planning_entitlement_rules_organizationId_idx" ON "planning_entitlement_rules"("organizationId");

-- CreateIndex
CREATE INDEX "planning_entitlement_rules_accountType_idx" ON "planning_entitlement_rules"("accountType");

-- CreateIndex
CREATE INDEX "planning_entitlement_rules_enabled_idx" ON "planning_entitlement_rules"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "planning_employee_entitlements_organizationId_dedupeKey_key" ON "planning_employee_entitlements"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_organizationId_idx" ON "planning_employee_entitlements"("organizationId");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_employeeId_idx" ON "planning_employee_entitlements"("employeeId");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_code_idx" ON "planning_employee_entitlements"("code");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_entitlementRuleId_idx" ON "planning_employee_entitlements"("entitlementRuleId");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_policyProfileId_idx" ON "planning_employee_entitlements"("policyProfileId");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_counterAccountId_idx" ON "planning_employee_entitlements"("counterAccountId");

-- CreateIndex
CREATE INDEX "planning_employee_entitlements_enabled_idx" ON "planning_employee_entitlements"("enabled");

-- AddForeignKey
ALTER TABLE "planning_attendance_entries" ADD CONSTRAINT "planning_attendance_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_attendance_entries" ADD CONSTRAINT "planning_attendance_entries_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "planning_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_attendance_entries" ADD CONSTRAINT "planning_attendance_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_attendance_entries" ADD CONSTRAINT "planning_attendance_entries_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_attendance_entries" ADD CONSTRAINT "planning_attendance_entries_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_entitlement_rules" ADD CONSTRAINT "planning_entitlement_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_entitlement_rules" ADD CONSTRAINT "planning_entitlement_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_employee_entitlements" ADD CONSTRAINT "planning_employee_entitlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_employee_entitlements" ADD CONSTRAINT "planning_employee_entitlements_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_employee_entitlements" ADD CONSTRAINT "planning_employee_entitlements_entitlementRuleId_fkey" FOREIGN KEY ("entitlementRuleId") REFERENCES "planning_entitlement_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_employee_entitlements" ADD CONSTRAINT "planning_employee_entitlements_policyProfileId_fkey" FOREIGN KEY ("policyProfileId") REFERENCES "planning_policy_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_employee_entitlements" ADD CONSTRAINT "planning_employee_entitlements_counterAccountId_fkey" FOREIGN KEY ("counterAccountId") REFERENCES "planning_counter_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_employee_entitlements" ADD CONSTRAINT "planning_employee_entitlements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
