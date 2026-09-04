-- Link HR positions to their primary department when known.
ALTER TABLE "hr_positions" ADD COLUMN "departmentId" UUID;

CREATE INDEX "hr_positions_departmentId_idx" ON "hr_positions"("departmentId");

ALTER TABLE "hr_positions"
  ADD CONSTRAINT "hr_positions_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "hr_departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
