ALTER TABLE "haccp_process_sessions"
  ADD COLUMN "productionSessionId" UUID,
  ADD COLUMN "lotNumber" TEXT,
  ADD COLUMN "quantity" DECIMAL(12, 3),
  ADD COLUMN "unit" TEXT;

CREATE UNIQUE INDEX "haccp_process_sessions_productionSessionId_type_key"
  ON "haccp_process_sessions"("productionSessionId", "type");

CREATE INDEX "haccp_process_sessions_productionSessionId_idx"
  ON "haccp_process_sessions"("productionSessionId");

ALTER TABLE "haccp_process_sessions"
  ADD CONSTRAINT "haccp_process_sessions_productionSessionId_fkey"
  FOREIGN KEY ("productionSessionId") REFERENCES "haccp_production_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
