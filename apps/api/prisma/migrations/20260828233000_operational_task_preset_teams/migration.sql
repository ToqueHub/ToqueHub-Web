CREATE TABLE "operational_task_preset_assignments" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "presetId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "isLead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operational_task_preset_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operational_task_preset_assignments_presetId_employeeId_key"
  ON "operational_task_preset_assignments"("presetId", "employeeId");
CREATE INDEX "operational_task_preset_assignments_organizationId_idx"
  ON "operational_task_preset_assignments"("organizationId");
CREATE INDEX "operational_task_preset_assignments_employeeId_idx"
  ON "operational_task_preset_assignments"("employeeId");

ALTER TABLE "operational_task_preset_assignments"
  ADD CONSTRAINT "operational_task_preset_assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_task_preset_assignments"
  ADD CONSTRAINT "operational_task_preset_assignments_presetId_fkey"
  FOREIGN KEY ("presetId") REFERENCES "operational_task_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "operational_task_preset_assignments"
  ADD CONSTRAINT "operational_task_preset_assignments_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "operational_task_preset_assignments" (
  "id",
  "organizationId",
  "presetId",
  "employeeId",
  "isLead",
  "createdAt"
)
SELECT
  gen_random_uuid(),
  preset."organizationId",
  preset."id",
  preset."assignedEmployeeId",
  true,
  preset."createdAt"
FROM "operational_task_presets" preset
ON CONFLICT ("presetId", "employeeId") DO NOTHING;
