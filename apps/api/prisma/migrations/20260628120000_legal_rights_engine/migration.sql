CREATE TABLE "legal_import_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sourceVersion" TEXT NOT NULL,
  "sourceFile" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "counts" JSONB,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_regimes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sourceUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_regimes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collective_agreements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'FR',
  "idcc" TEXT,
  "name" TEXT NOT NULL,
  "sector" TEXT,
  "establishmentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "routingHints" TEXT,
  "rightsToExtract" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "sourceUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "collective_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_regimes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'FR',
  "name" TEXT NOT NULL,
  "publicFunctionType" TEXT,
  "sourceUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_regimes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_rights" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_rights_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_job_families" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "examples" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_job_families_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_right_rule_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stableId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "rightId" UUID NOT NULL,
  "regimeId" UUID,
  "agreementId" UUID,
  "publicRegimeId" UUID,
  "countryCode" TEXT NOT NULL,
  "sector" TEXT NOT NULL,
  "establishmentType" TEXT,
  "contractType" TEXT,
  "jobFamilyCode" TEXT,
  "minSeniorityMonths" INTEGER,
  "maxSeniorityMonths" INTEGER,
  "fullTimeEquivalent" DECIMAL(6,4),
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "unit" TEXT NOT NULL,
  "value" DECIMAL(12,4),
  "formulaType" TEXT NOT NULL,
  "formulaJson" JSONB,
  "conditionsJson" JSONB,
  "sourceLabel" TEXT,
  "sourceUrl" TEXT,
  "validationStatus" TEXT NOT NULL DEFAULT 'requires_review',
  "confidenceLevel" DECIMAL(5,4),
  "lastVerifiedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "importBatchId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_right_rule_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_job_to_agreement_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stableKey" TEXT NOT NULL,
  "jobFamilyId" UUID NOT NULL,
  "agreementId" UUID,
  "publicRegimeId" UUID,
  "establishmentType" TEXT,
  "confidenceLevel" DECIMAL(5,4),
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_job_to_agreement_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_legal_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "establishmentId" UUID,
  "regimeType" TEXT NOT NULL,
  "agreementId" UUID,
  "publicRegimeId" UUID,
  "contractType" TEXT,
  "weeklyHours" DECIMAL(8,3),
  "annualHours" DECIMAL(8,3),
  "seniorityStartDate" TIMESTAMP(3),
  "fullTimeEquivalent" DECIMAL(6,4),
  "isSeasonal" BOOLEAN NOT NULL DEFAULT false,
  "localAgreementJson" JSONB,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_legal_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_calculation_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "resultHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_calculation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_right_counters" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "rightId" UUID NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "acquired" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "used" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "remaining" DECIMAL(12,4) NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "calculationRunId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_right_counters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_right_counter_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "counterId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(12,4) NOT NULL,
  "reason" TEXT,
  "sourceEventId" TEXT,
  "sourceRuleVersionId" UUID,
  "calculationRunId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_right_counter_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_calculation_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "calculationRunId" UUID NOT NULL,
  "ruleVersionId" UUID,
  "message" TEXT NOT NULL,
  "inputJson" JSONB,
  "outputJson" JSONB,
  "sourceUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legal_calculation_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_import_batches_sourceHash_key" ON "legal_import_batches"("sourceHash");
CREATE INDEX "legal_import_batches_sourceVersion_idx" ON "legal_import_batches"("sourceVersion");
CREATE INDEX "legal_import_batches_importedAt_idx" ON "legal_import_batches"("importedAt");

CREATE UNIQUE INDEX "legal_regimes_code_key" ON "legal_regimes"("code");
CREATE INDEX "legal_regimes_countryCode_idx" ON "legal_regimes"("countryCode");
CREATE INDEX "legal_regimes_type_idx" ON "legal_regimes"("type");
CREATE INDEX "legal_regimes_active_idx" ON "legal_regimes"("active");

CREATE UNIQUE INDEX "collective_agreements_key_key" ON "collective_agreements"("key");
CREATE INDEX "collective_agreements_countryCode_idx" ON "collective_agreements"("countryCode");
CREATE INDEX "collective_agreements_idcc_idx" ON "collective_agreements"("idcc");
CREATE INDEX "collective_agreements_sector_idx" ON "collective_agreements"("sector");
CREATE INDEX "collective_agreements_active_idx" ON "collective_agreements"("active");

CREATE UNIQUE INDEX "public_regimes_code_key" ON "public_regimes"("code");
CREATE INDEX "public_regimes_countryCode_idx" ON "public_regimes"("countryCode");
CREATE INDEX "public_regimes_publicFunctionType_idx" ON "public_regimes"("publicFunctionType");
CREATE INDEX "public_regimes_active_idx" ON "public_regimes"("active");

CREATE UNIQUE INDEX "legal_rights_code_key" ON "legal_rights"("code");
CREATE INDEX "legal_rights_category_idx" ON "legal_rights"("category");
CREATE INDEX "legal_rights_active_idx" ON "legal_rights"("active");

CREATE UNIQUE INDEX "legal_job_families_code_key" ON "legal_job_families"("code");
CREATE INDEX "legal_job_families_label_idx" ON "legal_job_families"("label");

CREATE UNIQUE INDEX "legal_right_rule_versions_stableId_key" ON "legal_right_rule_versions"("stableId");
CREATE INDEX "legal_right_rule_versions_rightId_idx" ON "legal_right_rule_versions"("rightId");
CREATE INDEX "legal_right_rule_versions_countryCode_idx" ON "legal_right_rule_versions"("countryCode");
CREATE INDEX "legal_right_rule_versions_sector_idx" ON "legal_right_rule_versions"("sector");
CREATE INDEX "legal_right_rule_versions_agreementId_idx" ON "legal_right_rule_versions"("agreementId");
CREATE INDEX "legal_right_rule_versions_publicRegimeId_idx" ON "legal_right_rule_versions"("publicRegimeId");
CREATE INDEX "legal_right_rule_versions_effectiveFrom_idx" ON "legal_right_rule_versions"("effectiveFrom");
CREATE INDEX "legal_right_rule_versions_effectiveTo_idx" ON "legal_right_rule_versions"("effectiveTo");
CREATE INDEX "legal_right_rule_versions_validationStatus_idx" ON "legal_right_rule_versions"("validationStatus");
CREATE INDEX "legal_right_rule_versions_active_idx" ON "legal_right_rule_versions"("active");

CREATE INDEX "legal_job_to_agreement_mappings_jobFamilyId_idx" ON "legal_job_to_agreement_mappings"("jobFamilyId");
CREATE UNIQUE INDEX "legal_job_to_agreement_mappings_stableKey_key" ON "legal_job_to_agreement_mappings"("stableKey");
CREATE INDEX "legal_job_to_agreement_mappings_agreementId_idx" ON "legal_job_to_agreement_mappings"("agreementId");
CREATE INDEX "legal_job_to_agreement_mappings_publicRegimeId_idx" ON "legal_job_to_agreement_mappings"("publicRegimeId");
CREATE INDEX "legal_job_to_agreement_mappings_establishmentType_idx" ON "legal_job_to_agreement_mappings"("establishmentType");

CREATE INDEX "employee_legal_profiles_organizationId_idx" ON "employee_legal_profiles"("organizationId");
CREATE INDEX "employee_legal_profiles_employeeId_idx" ON "employee_legal_profiles"("employeeId");
CREATE INDEX "employee_legal_profiles_establishmentId_idx" ON "employee_legal_profiles"("establishmentId");
CREATE INDEX "employee_legal_profiles_regimeType_idx" ON "employee_legal_profiles"("regimeType");
CREATE INDEX "employee_legal_profiles_agreementId_idx" ON "employee_legal_profiles"("agreementId");
CREATE INDEX "employee_legal_profiles_publicRegimeId_idx" ON "employee_legal_profiles"("publicRegimeId");
CREATE INDEX "employee_legal_profiles_effectiveFrom_idx" ON "employee_legal_profiles"("effectiveFrom");

CREATE INDEX "legal_calculation_runs_organizationId_idx" ON "legal_calculation_runs"("organizationId");
CREATE INDEX "legal_calculation_runs_employeeId_idx" ON "legal_calculation_runs"("employeeId");
CREATE INDEX "legal_calculation_runs_periodStart_idx" ON "legal_calculation_runs"("periodStart");
CREATE INDEX "legal_calculation_runs_periodEnd_idx" ON "legal_calculation_runs"("periodEnd");
CREATE INDEX "legal_calculation_runs_status_idx" ON "legal_calculation_runs"("status");
CREATE INDEX "legal_calculation_runs_inputHash_idx" ON "legal_calculation_runs"("inputHash");

CREATE UNIQUE INDEX "legal_right_counters_organizationId_employeeId_rightId_periodStart_periodEnd_key" ON "legal_right_counters"("organizationId", "employeeId", "rightId", "periodStart", "periodEnd");
CREATE INDEX "legal_right_counters_organizationId_idx" ON "legal_right_counters"("organizationId");
CREATE INDEX "legal_right_counters_employeeId_idx" ON "legal_right_counters"("employeeId");
CREATE INDEX "legal_right_counters_rightId_idx" ON "legal_right_counters"("rightId");
CREATE INDEX "legal_right_counters_periodStart_idx" ON "legal_right_counters"("periodStart");
CREATE INDEX "legal_right_counters_periodEnd_idx" ON "legal_right_counters"("periodEnd");
CREATE INDEX "legal_right_counters_status_idx" ON "legal_right_counters"("status");

CREATE INDEX "legal_right_counter_transactions_organizationId_idx" ON "legal_right_counter_transactions"("organizationId");
CREATE INDEX "legal_right_counter_transactions_counterId_idx" ON "legal_right_counter_transactions"("counterId");
CREATE INDEX "legal_right_counter_transactions_employeeId_idx" ON "legal_right_counter_transactions"("employeeId");
CREATE INDEX "legal_right_counter_transactions_date_idx" ON "legal_right_counter_transactions"("date");
CREATE INDEX "legal_right_counter_transactions_type_idx" ON "legal_right_counter_transactions"("type");
CREATE INDEX "legal_right_counter_transactions_sourceRuleVersionId_idx" ON "legal_right_counter_transactions"("sourceRuleVersionId");
CREATE INDEX "legal_right_counter_transactions_calculationRunId_idx" ON "legal_right_counter_transactions"("calculationRunId");

CREATE INDEX "legal_calculation_audit_logs_organizationId_idx" ON "legal_calculation_audit_logs"("organizationId");
CREATE INDEX "legal_calculation_audit_logs_calculationRunId_idx" ON "legal_calculation_audit_logs"("calculationRunId");
CREATE INDEX "legal_calculation_audit_logs_ruleVersionId_idx" ON "legal_calculation_audit_logs"("ruleVersionId");

ALTER TABLE "legal_right_rule_versions" ADD CONSTRAINT "legal_right_rule_versions_rightId_fkey" FOREIGN KEY ("rightId") REFERENCES "legal_rights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_rule_versions" ADD CONSTRAINT "legal_right_rule_versions_regimeId_fkey" FOREIGN KEY ("regimeId") REFERENCES "legal_regimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_right_rule_versions" ADD CONSTRAINT "legal_right_rule_versions_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "collective_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_right_rule_versions" ADD CONSTRAINT "legal_right_rule_versions_publicRegimeId_fkey" FOREIGN KEY ("publicRegimeId") REFERENCES "public_regimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_right_rule_versions" ADD CONSTRAINT "legal_right_rule_versions_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "legal_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legal_job_to_agreement_mappings" ADD CONSTRAINT "legal_job_to_agreement_mappings_jobFamilyId_fkey" FOREIGN KEY ("jobFamilyId") REFERENCES "legal_job_families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_job_to_agreement_mappings" ADD CONSTRAINT "legal_job_to_agreement_mappings_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "collective_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_job_to_agreement_mappings" ADD CONSTRAINT "legal_job_to_agreement_mappings_publicRegimeId_fkey" FOREIGN KEY ("publicRegimeId") REFERENCES "public_regimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_legal_profiles" ADD CONSTRAINT "employee_legal_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_legal_profiles" ADD CONSTRAINT "employee_legal_profiles_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_legal_profiles" ADD CONSTRAINT "employee_legal_profiles_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_legal_profiles" ADD CONSTRAINT "employee_legal_profiles_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "collective_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_legal_profiles" ADD CONSTRAINT "employee_legal_profiles_publicRegimeId_fkey" FOREIGN KEY ("publicRegimeId") REFERENCES "public_regimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legal_calculation_runs" ADD CONSTRAINT "legal_calculation_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_calculation_runs" ADD CONSTRAINT "legal_calculation_runs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_right_counters" ADD CONSTRAINT "legal_right_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_counters" ADD CONSTRAINT "legal_right_counters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_counters" ADD CONSTRAINT "legal_right_counters_rightId_fkey" FOREIGN KEY ("rightId") REFERENCES "legal_rights"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_counters" ADD CONSTRAINT "legal_right_counters_calculationRunId_fkey" FOREIGN KEY ("calculationRunId") REFERENCES "legal_calculation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legal_right_counter_transactions" ADD CONSTRAINT "legal_right_counter_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_counter_transactions" ADD CONSTRAINT "legal_right_counter_transactions_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "legal_right_counters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_counter_transactions" ADD CONSTRAINT "legal_right_counter_transactions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_right_counter_transactions" ADD CONSTRAINT "legal_right_counter_transactions_sourceRuleVersionId_fkey" FOREIGN KEY ("sourceRuleVersionId") REFERENCES "legal_right_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_right_counter_transactions" ADD CONSTRAINT "legal_right_counter_transactions_calculationRunId_fkey" FOREIGN KEY ("calculationRunId") REFERENCES "legal_calculation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legal_calculation_audit_logs" ADD CONSTRAINT "legal_calculation_audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_calculation_audit_logs" ADD CONSTRAINT "legal_calculation_audit_logs_calculationRunId_fkey" FOREIGN KEY ("calculationRunId") REFERENCES "legal_calculation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_calculation_audit_logs" ADD CONSTRAINT "legal_calculation_audit_logs_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "legal_right_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
