-- Move entitlement and time-account ownership from Planning to RH without data loss.
-- This migration intentionally renames existing objects instead of dropping/recreating them.

ALTER TYPE "PlanningCounterDirection" RENAME TO "HrTimeAccountDirection";
ALTER TYPE "PlanningCounterSourceType" RENAME TO "HrTimeAccountSourceType";
ALTER TYPE "PlanningEntitlementAccrualFrequency" RENAME TO "HrEntitlementAccrualFrequency";

ALTER TABLE "planning_counter_accounts" RENAME TO "hr_time_accounts";
ALTER TABLE "planning_counter_transactions" RENAME TO "hr_time_account_transactions";
ALTER TABLE "planning_entitlement_catalog_items" RENAME TO "hr_entitlement_catalog_items";
ALTER TABLE "planning_entitlement_rules" RENAME TO "hr_entitlement_rules";
ALTER TABLE "planning_employee_entitlements" RENAME TO "hr_employee_entitlements";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_accounts_pkey') THEN
    ALTER TABLE "hr_time_accounts" RENAME CONSTRAINT "planning_counter_accounts_pkey" TO "hr_time_accounts_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_transactions_pkey') THEN
    ALTER TABLE "hr_time_account_transactions" RENAME CONSTRAINT "planning_counter_transactions_pkey" TO "hr_time_account_transactions_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_entitlement_catalog_items_pkey') THEN
    ALTER TABLE "hr_entitlement_catalog_items" RENAME CONSTRAINT "planning_entitlement_catalog_items_pkey" TO "hr_entitlement_catalog_items_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_entitlement_rules_pkey') THEN
    ALTER TABLE "hr_entitlement_rules" RENAME CONSTRAINT "planning_entitlement_rules_pkey" TO "hr_entitlement_rules_pkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_pkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_pkey" TO "hr_employee_entitlements_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_organizationId_employeeId_periodY_key') THEN
    ALTER INDEX "planning_counter_accounts_organizationId_employeeId_periodY_key" RENAME TO "hr_time_accounts_org_employee_year_code_key";
  ELSIF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_organizationId_employeeId_periodYear_code_key') THEN
    ALTER INDEX "planning_counter_accounts_organizationId_employeeId_periodYear_code_key" RENAME TO "hr_time_accounts_org_employee_year_code_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_organizationId_idx') THEN
    ALTER INDEX "planning_counter_accounts_organizationId_idx" RENAME TO "hr_time_accounts_organizationId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_employeeId_idx') THEN
    ALTER INDEX "planning_counter_accounts_employeeId_idx" RENAME TO "hr_time_accounts_employeeId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_periodYear_idx') THEN
    ALTER INDEX "planning_counter_accounts_periodYear_idx" RENAME TO "hr_time_accounts_periodYear_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_accountType_idx') THEN
    ALTER INDEX "planning_counter_accounts_accountType_idx" RENAME TO "hr_time_accounts_accountType_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_accounts_code_idx') THEN
    ALTER INDEX "planning_counter_accounts_code_idx" RENAME TO "hr_time_accounts_code_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_organizationId_idempotencyKey_key') THEN
    ALTER INDEX "planning_counter_transactions_organizationId_idempotencyKey_key" RENAME TO "hr_time_account_transactions_org_idempotency_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_organizationId_idx') THEN
    ALTER INDEX "planning_counter_transactions_organizationId_idx" RENAME TO "hr_time_account_transactions_organizationId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_accountId_idx') THEN
    ALTER INDEX "planning_counter_transactions_accountId_idx" RENAME TO "hr_time_account_transactions_accountId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_employeeId_idx') THEN
    ALTER INDEX "planning_counter_transactions_employeeId_idx" RENAME TO "hr_time_account_transactions_employeeId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_date_idx') THEN
    ALTER INDEX "planning_counter_transactions_date_idx" RENAME TO "hr_time_account_transactions_date_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_sourceType_idx') THEN
    ALTER INDEX "planning_counter_transactions_sourceType_idx" RENAME TO "hr_time_account_transactions_sourceType_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_counter_transactions_sourceId_idx') THEN
    ALTER INDEX "planning_counter_transactions_sourceId_idx" RENAME TO "hr_time_account_transactions_sourceId_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_catalog_items_org_country_code_key') THEN
    ALTER INDEX "planning_entitlement_catalog_items_org_country_code_key" RENAME TO "hr_entitlement_catalog_items_org_country_code_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_catalog_items_org_idx') THEN
    ALTER INDEX "planning_entitlement_catalog_items_org_idx" RENAME TO "hr_entitlement_catalog_items_org_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_catalog_items_country_category_idx') THEN
    ALTER INDEX "planning_entitlement_catalog_items_country_category_idx" RENAME TO "hr_entitlement_catalog_items_country_category_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_catalog_items_recommended_idx') THEN
    ALTER INDEX "planning_entitlement_catalog_items_recommended_idx" RENAME TO "hr_entitlement_catalog_items_recommended_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_catalog_items_framework_idx') THEN
    ALTER INDEX "planning_entitlement_catalog_items_framework_idx" RENAME TO "hr_entitlement_catalog_items_framework_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_catalog_items_common_advanced_idx') THEN
    ALTER INDEX "planning_entitlement_catalog_items_common_advanced_idx" RENAME TO "hr_entitlement_catalog_items_common_advanced_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_rules_organizationId_code_key') THEN
    ALTER INDEX "planning_entitlement_rules_organizationId_code_key" RENAME TO "hr_entitlement_rules_organizationId_code_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_rules_organizationId_idx') THEN
    ALTER INDEX "planning_entitlement_rules_organizationId_idx" RENAME TO "hr_entitlement_rules_organizationId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_rules_accountType_idx') THEN
    ALTER INDEX "planning_entitlement_rules_accountType_idx" RENAME TO "hr_entitlement_rules_accountType_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_entitlement_rules_enabled_idx') THEN
    ALTER INDEX "planning_entitlement_rules_enabled_idx" RENAME TO "hr_entitlement_rules_enabled_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_organizationId_dedupeKey_key') THEN
    ALTER INDEX "planning_employee_entitlements_organizationId_dedupeKey_key" RENAME TO "hr_employee_entitlements_organizationId_dedupeKey_key";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_organizationId_idx') THEN
    ALTER INDEX "planning_employee_entitlements_organizationId_idx" RENAME TO "hr_employee_entitlements_organizationId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_employeeId_idx') THEN
    ALTER INDEX "planning_employee_entitlements_employeeId_idx" RENAME TO "hr_employee_entitlements_employeeId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_code_idx') THEN
    ALTER INDEX "planning_employee_entitlements_code_idx" RENAME TO "hr_employee_entitlements_code_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_entitlementRuleId_idx') THEN
    ALTER INDEX "planning_employee_entitlements_entitlementRuleId_idx" RENAME TO "hr_employee_entitlements_entitlementRuleId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_policyProfileId_idx') THEN
    ALTER INDEX "planning_employee_entitlements_policyProfileId_idx" RENAME TO "hr_employee_entitlements_policyProfileId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_counterAccountId_idx') THEN
    ALTER INDEX "planning_employee_entitlements_counterAccountId_idx" RENAME TO "hr_employee_entitlements_counterAccountId_idx";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = 'planning_employee_entitlements_enabled_idx') THEN
    ALTER INDEX "planning_employee_entitlements_enabled_idx" RENAME TO "hr_employee_entitlements_enabled_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_accounts_organizationId_fkey') THEN
    ALTER TABLE "hr_time_accounts" RENAME CONSTRAINT "planning_counter_accounts_organizationId_fkey" TO "hr_time_accounts_organizationId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_accounts_employeeId_fkey') THEN
    ALTER TABLE "hr_time_accounts" RENAME CONSTRAINT "planning_counter_accounts_employeeId_fkey" TO "hr_time_accounts_employeeId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_transactions_organizationId_fkey') THEN
    ALTER TABLE "hr_time_account_transactions" RENAME CONSTRAINT "planning_counter_transactions_organizationId_fkey" TO "hr_time_account_transactions_organizationId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_transactions_accountId_fkey') THEN
    ALTER TABLE "hr_time_account_transactions" RENAME CONSTRAINT "planning_counter_transactions_accountId_fkey" TO "hr_time_account_transactions_accountId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_transactions_employeeId_fkey') THEN
    ALTER TABLE "hr_time_account_transactions" RENAME CONSTRAINT "planning_counter_transactions_employeeId_fkey" TO "hr_time_account_transactions_employeeId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_counter_transactions_createdById_fkey') THEN
    ALTER TABLE "hr_time_account_transactions" RENAME CONSTRAINT "planning_counter_transactions_createdById_fkey" TO "hr_time_account_transactions_createdById_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_entitlement_catalog_items_organizationId_fkey') THEN
    ALTER TABLE "hr_entitlement_catalog_items" RENAME CONSTRAINT "planning_entitlement_catalog_items_organizationId_fkey" TO "hr_entitlement_catalog_items_organizationId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_entitlement_rules_organizationId_fkey') THEN
    ALTER TABLE "hr_entitlement_rules" RENAME CONSTRAINT "planning_entitlement_rules_organizationId_fkey" TO "hr_entitlement_rules_organizationId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_entitlement_rules_createdById_fkey') THEN
    ALTER TABLE "hr_entitlement_rules" RENAME CONSTRAINT "planning_entitlement_rules_createdById_fkey" TO "hr_entitlement_rules_createdById_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_organizationId_fkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_organizationId_fkey" TO "hr_employee_entitlements_organizationId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_employeeId_fkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_employeeId_fkey" TO "hr_employee_entitlements_employeeId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_entitlementRuleId_fkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_entitlementRuleId_fkey" TO "hr_employee_entitlements_entitlementRuleId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_policyProfileId_fkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_policyProfileId_fkey" TO "hr_employee_entitlements_policyProfileId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_counterAccountId_fkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_counterAccountId_fkey" TO "hr_employee_entitlements_counterAccountId_fkey";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planning_employee_entitlements_createdById_fkey') THEN
    ALTER TABLE "hr_employee_entitlements" RENAME CONSTRAINT "planning_employee_entitlements_createdById_fkey" TO "hr_employee_entitlements_createdById_fkey";
  END IF;
END $$;
