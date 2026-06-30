-- Additive internal establishment work-time regulation settings.
-- This table stores client/internal rules only and does not duplicate or reference LegalRight.
CREATE TABLE "establishment_work_time_regulations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "nightWorkEnabled" BOOLEAN NOT NULL DEFAULT false,
  "nightWorkStartTime" TEXT,
  "nightWorkEndTime" TEXT,
  "publicHolidayWorkEnabled" BOOLEAN NOT NULL DEFAULT false,
  "publicHolidayDates" JSONB,
  "weekendWorkEnabled" BOOLEAN NOT NULL DEFAULT false,
  "saturdayWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
  "sundayWorkAllowed" BOOLEAN NOT NULL DEFAULT false,
  "compensationsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "teleworkEnabled" BOOLEAN NOT NULL DEFAULT false,
  "teleworkStartTime" TEXT,
  "teleworkEndTime" TEXT,
  "teleworkMinBreakMinutes" INTEGER,
  "teleworkDailyQuotaMinutes" INTEGER,
  "teleworkMaxDaysPerWeek" INTEGER,
  "teleworkMaxDaysPerYearFullTime" INTEGER,
  "teleworkMaxDaysPerYearPartTime" INTEGER,
  "internalRulesSourceDocumentId" UUID,
  "sourceDocumentName" TEXT,
  "sourceDocumentMetadata" JSONB,
  "extractedRules" JSONB,
  "rulesToConfirm" JSONB,
  "positionMapping" JSONB,
  "validationStatus" TEXT NOT NULL DEFAULT 'requires_review',
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "establishment_work_time_regulations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "establishment_work_time_regulations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "establishment_work_time_regulations_organizationId_key" ON "establishment_work_time_regulations"("organizationId");
CREATE INDEX "establishment_work_time_regulations_organizationId_idx" ON "establishment_work_time_regulations"("organizationId");
CREATE INDEX "establishment_work_time_regulations_validationStatus_idx" ON "establishment_work_time_regulations"("validationStatus");
