CREATE TABLE "hr_employee_sensitive_data" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "personalIdentityNumberCiphertext" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "hr_employee_sensitive_data_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hr_employee_sensitive_data_employeeId_key"
  ON "hr_employee_sensitive_data"("employeeId");

CREATE INDEX "hr_employee_sensitive_data_organizationId_idx"
  ON "hr_employee_sensitive_data"("organizationId");

ALTER TABLE "hr_employee_sensitive_data"
  ADD CONSTRAINT "hr_employee_sensitive_data_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
