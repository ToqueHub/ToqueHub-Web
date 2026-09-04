ALTER TYPE "AuditAction" ADD VALUE 'OPERATIONAL_TASK_PRESET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPERATIONAL_TASK_PRESET_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPERATIONAL_TASK_PRESET_ARCHIVED';

CREATE TABLE "operational_task_presets" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" "OperationalTaskCategory" NOT NULL DEFAULT 'KITCHEN',
  "departmentId" UUID NOT NULL,
  "siteId" UUID,
  "assignedEmployeeId" UUID NOT NULL,
  "technicalSheetId" UUID,
  "technicalSheetStepId" UUID,
  "serviceWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "leadDays" INTEGER NOT NULL DEFAULT 1,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  "quantity" DECIMAL(12,3),
  "unitLabel" TEXT,
  "startsOn" DATE,
  "endsOn" DATE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "operational_task_presets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "operational_tasks" ADD COLUMN "operationalTaskPresetId" UUID;

CREATE INDEX "operational_task_presets_organizationId_isActive_isArchived_idx"
  ON "operational_task_presets"("organizationId", "isActive", "isArchived");
CREATE INDEX "operational_task_presets_departmentId_idx"
  ON "operational_task_presets"("departmentId");
CREATE INDEX "operational_task_presets_siteId_idx"
  ON "operational_task_presets"("siteId");
CREATE INDEX "operational_task_presets_assignedEmployeeId_idx"
  ON "operational_task_presets"("assignedEmployeeId");
CREATE INDEX "operational_task_presets_technicalSheetId_idx"
  ON "operational_task_presets"("technicalSheetId");
CREATE INDEX "operational_tasks_operationalTaskPresetId_idx"
  ON "operational_tasks"("operationalTaskPresetId");

ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_assignedEmployeeId_fkey"
  FOREIGN KEY ("assignedEmployeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_technicalSheetId_fkey"
  FOREIGN KEY ("technicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_technicalSheetStepId_fkey"
  FOREIGN KEY ("technicalSheetStepId") REFERENCES "technical_sheet_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_task_presets"
  ADD CONSTRAINT "operational_task_presets_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "operational_tasks"
  ADD CONSTRAINT "operational_tasks_operationalTaskPresetId_fkey"
  FOREIGN KEY ("operationalTaskPresetId") REFERENCES "operational_task_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
