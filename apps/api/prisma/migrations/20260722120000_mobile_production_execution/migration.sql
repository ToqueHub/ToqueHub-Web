ALTER TABLE "operational_tasks"
  ADD COLUMN "productionBatchId" UUID,
  ADD COLUMN "productionOperationId" UUID;

CREATE INDEX "operational_tasks_productionBatchId_idx"
  ON "operational_tasks"("productionBatchId");

CREATE INDEX "operational_tasks_productionOperationId_idx"
  ON "operational_tasks"("productionOperationId");

ALTER TABLE "operational_tasks"
  ADD CONSTRAINT "operational_tasks_productionBatchId_fkey"
  FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "operational_tasks"
  ADD CONSTRAINT "operational_tasks_productionOperationId_fkey"
  FOREIGN KEY ("productionOperationId") REFERENCES "production_operations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
