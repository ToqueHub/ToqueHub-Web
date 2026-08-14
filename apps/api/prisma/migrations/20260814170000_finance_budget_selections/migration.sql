ALTER TABLE "finance_settings"
ADD COLUMN "budgetSelections" JSONB NOT NULL DEFAULT '{}';
