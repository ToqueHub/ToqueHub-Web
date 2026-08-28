ALTER TABLE "operational_task_presets"
  ADD COLUMN "positionId" UUID,
  ADD COLUMN "positionTaskPresetId" TEXT;

ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "operational_task_presets_positionId_idx"
  ON "operational_task_presets"("positionId");

CREATE INDEX "operational_task_presets_positionTaskPresetId_idx"
  ON "operational_task_presets"("positionTaskPresetId");
