ALTER TABLE "haccp_products"
  ADD COLUMN "sourceProductId" UUID;

ALTER TABLE "haccp_production_sessions"
  ADD COLUMN "productionBatchId" UUID,
  ADD COLUMN "outputLotId" UUID,
  ADD COLUMN "plannedQuantity" DECIMAL(12, 3),
  ADD COLUMN "lostQuantity" DECIMAL(12, 3),
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "conservationState" "ConservationState",
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "haccp_products_organizationId_sourceProductId_key"
  ON "haccp_products"("organizationId", "sourceProductId");
CREATE INDEX "haccp_products_sourceProductId_idx"
  ON "haccp_products"("sourceProductId");

CREATE UNIQUE INDEX "haccp_production_sessions_productionBatchId_key"
  ON "haccp_production_sessions"("productionBatchId");
CREATE UNIQUE INDEX "haccp_production_sessions_outputLotId_key"
  ON "haccp_production_sessions"("outputLotId");
CREATE INDEX "haccp_production_sessions_productionBatchId_idx"
  ON "haccp_production_sessions"("productionBatchId");
CREATE INDEX "haccp_production_sessions_outputLotId_idx"
  ON "haccp_production_sessions"("outputLotId");

ALTER TABLE "haccp_products"
  ADD CONSTRAINT "haccp_products_sourceProductId_fkey"
  FOREIGN KEY ("sourceProductId") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "haccp_production_sessions"
  ADD CONSTRAINT "haccp_production_sessions_productionBatchId_fkey"
  FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "haccp_production_sessions"
  ADD CONSTRAINT "haccp_production_sessions_outputLotId_fkey"
  FOREIGN KEY ("outputLotId") REFERENCES "lots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
