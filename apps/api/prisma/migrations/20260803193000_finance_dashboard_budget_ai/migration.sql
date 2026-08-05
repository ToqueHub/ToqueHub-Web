ALTER TABLE "finance_settings"
  ADD COLUMN "dashboardKpis" TEXT[] NOT NULL DEFAULT ARRAY[
    'average_ticket',
    'transactions',
    'contribution_margin',
    'cash',
    'fixed_costs',
    'break_even'
  ]::TEXT[];

CREATE TABLE "finance_budget_plans" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "importBatchId" UUID,
  "name" TEXT NOT NULL,
  "scenario" TEXT,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'LOCAL_IMPORT',
  "isReference" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_budget_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_budget_plan_lines" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "metric" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "finance_budget_plan_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "finance_budget_plans_organizationId_isReference_idx"
  ON "finance_budget_plans"("organizationId", "isReference");
CREATE INDEX "finance_budget_plans_organizationId_startDate_endDate_idx"
  ON "finance_budget_plans"("organizationId", "startDate", "endDate");
CREATE INDEX "finance_budget_plans_importBatchId_idx"
  ON "finance_budget_plans"("importBatchId");
CREATE UNIQUE INDEX "finance_budget_plan_lines_planId_metric_periodStart_key"
  ON "finance_budget_plan_lines"("planId", "metric", "periodStart");
CREATE INDEX "finance_budget_plan_lines_organizationId_metric_periodStart_idx"
  ON "finance_budget_plan_lines"("organizationId", "metric", "periodStart");

ALTER TABLE "finance_budget_plans"
  ADD CONSTRAINT "finance_budget_plans_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_budget_plans"
  ADD CONSTRAINT "finance_budget_plans_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "finance_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "finance_budget_plan_lines"
  ADD CONSTRAINT "finance_budget_plan_lines_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_budget_plan_lines"
  ADD CONSTRAINT "finance_budget_plan_lines_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "finance_budget_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
