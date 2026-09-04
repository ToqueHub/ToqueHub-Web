ALTER TYPE "OperationalTaskSource" ADD VALUE IF NOT EXISTS 'PRODUCTION';

CREATE TYPE "ProductionDayClosureStatus" AS ENUM ('DRAFT', 'CLOSED');

CREATE TABLE "operational_task_assignments" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "planningAssignmentId" UUID,
  "isLead" BOOLEAN NOT NULL DEFAULT false,
  "mission" TEXT,
  "plannedMinutes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_task_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_task_assignments_taskId_employeeId_key"
  ON "operational_task_assignments"("taskId", "employeeId");
CREATE INDEX "operational_task_assignments_organizationId_idx"
  ON "operational_task_assignments"("organizationId");
CREATE INDEX "operational_task_assignments_employeeId_idx"
  ON "operational_task_assignments"("employeeId");
CREATE INDEX "operational_task_assignments_planningAssignmentId_idx"
  ON "operational_task_assignments"("planningAssignmentId");

ALTER TABLE "operational_task_assignments"
  ADD CONSTRAINT "operational_task_assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_task_assignments"
  ADD CONSTRAINT "operational_task_assignments_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "operational_tasks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_task_assignments"
  ADD CONSTRAINT "operational_task_assignments_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_task_assignments"
  ADD CONSTRAINT "operational_task_assignments_planningAssignmentId_fkey"
  FOREIGN KEY ("planningAssignmentId") REFERENCES "planning_assignments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "operational_task_assignments" (
  "id",
  "organizationId",
  "taskId",
  "employeeId",
  "planningAssignmentId",
  "isLead",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  "organizationId",
  "id",
  "assignedEmployeeId",
  "planningAssignmentId",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "operational_tasks"
WHERE "assignedEmployeeId" IS NOT NULL
ON CONFLICT ("taskId", "employeeId") DO NOTHING;

CREATE TABLE "production_day_closures" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "siteId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "status" "ProductionDayClosureStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" UUID,
  "closedById" UUID,
  "closedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_day_closures_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_day_closures_organizationId_siteId_date_key"
  ON "production_day_closures"("organizationId", "siteId", "date");
CREATE INDEX "production_day_closures_organizationId_idx"
  ON "production_day_closures"("organizationId");
CREATE INDEX "production_day_closures_siteId_date_idx"
  ON "production_day_closures"("siteId", "date");
CREATE INDEX "production_day_closures_status_idx"
  ON "production_day_closures"("status");

ALTER TABLE "production_day_closures"
  ADD CONSTRAINT "production_day_closures_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_day_closures"
  ADD CONSTRAINT "production_day_closures_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_day_closures"
  ADD CONSTRAINT "production_day_closures_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_day_closures"
  ADD CONSTRAINT "production_day_closures_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "production_day_closure_items" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "closureId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "outputProductId" UUID,
  "productNameSnapshot" TEXT NOT NULL,
  "targetPortions" DECIMAL(12,3) NOT NULL,
  "openingCarryOverPortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "producedPortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "totalAvailablePortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "remainingPortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "discardedPortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "estimatedOutPortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "carryOverNextPortions" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "lossReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_day_closure_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_day_closure_items_closureId_orderId_key"
  ON "production_day_closure_items"("closureId", "orderId");
CREATE INDEX "production_day_closure_items_organizationId_idx"
  ON "production_day_closure_items"("organizationId");
CREATE INDEX "production_day_closure_items_orderId_idx"
  ON "production_day_closure_items"("orderId");
CREATE INDEX "production_day_closure_items_outputProductId_idx"
  ON "production_day_closure_items"("outputProductId");

ALTER TABLE "production_day_closure_items"
  ADD CONSTRAINT "production_day_closure_items_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_day_closure_items"
  ADD CONSTRAINT "production_day_closure_items_closureId_fkey"
  FOREIGN KEY ("closureId") REFERENCES "production_day_closures"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_day_closure_items"
  ADD CONSTRAINT "production_day_closure_items_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "production_orders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_day_closure_items"
  ADD CONSTRAINT "production_day_closure_items_outputProductId_fkey"
  FOREIGN KEY ("outputProductId") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
