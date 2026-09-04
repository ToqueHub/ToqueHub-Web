ALTER TABLE "operational_tasks"
  ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "operational_tasks_organizationId_sourceKey_key"
  ON "operational_tasks"("organizationId", "sourceKey");
