ALTER TABLE "hr_positions"
ADD COLUMN "taskPresets" JSONB;

ALTER TABLE "operational_tasks"
ADD COLUMN "technicalSheetStepId" UUID,
ADD COLUMN "positionTaskPresetId" TEXT;

CREATE INDEX "operational_tasks_technicalSheetStepId_idx"
ON "operational_tasks"("technicalSheetStepId");

ALTER TABLE "operational_tasks"
ADD CONSTRAINT "operational_tasks_technicalSheetStepId_fkey"
FOREIGN KEY ("technicalSheetStepId") REFERENCES "technical_sheet_steps"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

