ALTER TABLE "technical_sheets"
  ADD COLUMN "maxProductionMultiplier" DECIMAL(8,3),
  ADD COLUMN "totalMassGrams" DECIMAL(14,3) NOT NULL DEFAULT 0;

ALTER TABLE "operational_tasks"
  ADD COLUMN "recipeMultiplier" DECIMAL(8,3);
