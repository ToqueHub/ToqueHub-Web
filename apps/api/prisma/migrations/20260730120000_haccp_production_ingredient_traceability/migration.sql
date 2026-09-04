CREATE TABLE "haccp_production_ingredient_traceability" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "productionBatchId" UUID NOT NULL,
  "productId" UUID,
  "ingredientKey" TEXT NOT NULL,
  "ingredientNameSnapshot" TEXT NOT NULL,
  "quantitySnapshot" DECIMAL(12, 3) NOT NULL,
  "unitSnapshot" TEXT NOT NULL,
  "lotNumber" TEXT,
  "barcode" TEXT,
  "photos" JSONB NOT NULL DEFAULT '[]',
  "idempotencyKey" TEXT,
  "createdById" UUID,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "haccp_production_ingredient_traceability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "haccp_prod_ing_trace_batch_key_key"
  ON "haccp_production_ingredient_traceability"("productionBatchId", "ingredientKey");
CREATE UNIQUE INDEX "haccp_prod_ing_trace_org_idempotency_key"
  ON "haccp_production_ingredient_traceability"("organizationId", "idempotencyKey");
CREATE INDEX "haccp_prod_ing_trace_organization_idx"
  ON "haccp_production_ingredient_traceability"("organizationId");
CREATE INDEX "haccp_prod_ing_trace_batch_idx"
  ON "haccp_production_ingredient_traceability"("productionBatchId");
CREATE INDEX "haccp_prod_ing_trace_product_idx"
  ON "haccp_production_ingredient_traceability"("productId");
CREATE INDEX "haccp_prod_ing_trace_completed_idx"
  ON "haccp_production_ingredient_traceability"("completedAt");

ALTER TABLE "haccp_production_ingredient_traceability"
  ADD CONSTRAINT "haccp_prod_ing_trace_organization_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "haccp_production_ingredient_traceability"
  ADD CONSTRAINT "haccp_prod_ing_trace_batch_fkey"
  FOREIGN KEY ("productionBatchId") REFERENCES "production_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "haccp_production_ingredient_traceability"
  ADD CONSTRAINT "haccp_prod_ing_trace_product_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
