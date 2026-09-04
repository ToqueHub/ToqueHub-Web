CREATE TYPE "OperationalTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OperationalTaskCategory" AS ENUM ('KITCHEN', 'SERVICE', 'HOUSEKEEPING', 'RECEPTION', 'MAINTENANCE', 'LOGISTICS', 'MANAGEMENT', 'OTHER');
CREATE TYPE "OperationalTaskSource" AS ENUM ('MANUAL', 'MENU', 'TECHNICAL_SHEET');

CREATE TABLE "operational_tasks" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" "OperationalTaskCategory" NOT NULL DEFAULT 'OTHER',
  "status" "OperationalTaskStatus" NOT NULL DEFAULT 'TODO',
  "source" "OperationalTaskSource" NOT NULL DEFAULT 'MANUAL',
  "departmentId" UUID NOT NULL,
  "positionId" UUID,
  "siteId" UUID,
  "assignedEmployeeId" UUID,
  "planningAssignmentId" UUID,
  "menuId" UUID,
  "technicalSheetId" UUID,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "quantity" DECIMAL(12,3),
  "unitLabel" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operational_tasks_organizationId_idx" ON "operational_tasks"("organizationId");
CREATE INDEX "operational_tasks_departmentId_idx" ON "operational_tasks"("departmentId");
CREATE INDEX "operational_tasks_positionId_idx" ON "operational_tasks"("positionId");
CREATE INDEX "operational_tasks_siteId_idx" ON "operational_tasks"("siteId");
CREATE INDEX "operational_tasks_assignedEmployeeId_idx" ON "operational_tasks"("assignedEmployeeId");
CREATE INDEX "operational_tasks_planningAssignmentId_idx" ON "operational_tasks"("planningAssignmentId");
CREATE INDEX "operational_tasks_menuId_idx" ON "operational_tasks"("menuId");
CREATE INDEX "operational_tasks_technicalSheetId_idx" ON "operational_tasks"("technicalSheetId");
CREATE INDEX "operational_tasks_startsAt_idx" ON "operational_tasks"("startsAt");
CREATE INDEX "operational_tasks_endsAt_idx" ON "operational_tasks"("endsAt");
CREATE INDEX "operational_tasks_status_idx" ON "operational_tasks"("status");

ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_planningAssignmentId_fkey" FOREIGN KEY ("planningAssignmentId") REFERENCES "planning_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_technicalSheetId_fkey" FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks" ADD CONSTRAINT "operational_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
