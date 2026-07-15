-- Pays de réglementation global et liaison entre référentiel légal et configurations établissement.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "regulatoryCountryCode" TEXT,
  ADD COLUMN IF NOT EXISTS "regulatoryCountrySelectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "regulatoryCountrySelectedById" UUID;

UPDATE "organizations"
SET
  "regulatoryCountryCode" = "hrCountryCode",
  "regulatoryCountrySelectedAt" = COALESCE("regulatoryCountrySelectedAt", CURRENT_TIMESTAMP)
WHERE "regulatoryCountryCode" IS NULL
  AND "hrCountryCode" IN ('FR', 'FI');

ALTER TABLE "hr_entitlement_rules"
  ADD COLUMN IF NOT EXISTS "sourceRightId" UUID,
  ADD COLUMN IF NOT EXISTS "sourceRuleVersionId" UUID,
  ADD COLUMN IF NOT EXISTS "localSettingsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "overrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedById" UUID;

UPDATE "hr_entitlement_rules"
SET
  "sourceRightId" = NULLIF("metadata"->>'sourceLegalRightId', '')::uuid,
  "sourceRuleVersionId" = NULLIF("metadata"->>'sourceRuleVersionId', '')::uuid
WHERE "metadata" IS NOT NULL
  AND "sourceRightId" IS NULL
  AND ("metadata"->>'sourceLegalRightId') ~* '^[0-9a-f-]{36}$'
  AND (
    "metadata"->>'sourceRuleVersionId' IS NULL
    OR ("metadata"->>'sourceRuleVersionId') ~* '^[0-9a-f-]{36}$'
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_regulatoryCountrySelectedById_fkey') THEN
    ALTER TABLE "organizations"
      ADD CONSTRAINT "organizations_regulatoryCountrySelectedById_fkey"
      FOREIGN KEY ("regulatoryCountrySelectedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_entitlement_rules_updatedById_fkey') THEN
    ALTER TABLE "hr_entitlement_rules"
      ADD CONSTRAINT "hr_entitlement_rules_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_entitlement_rules_sourceRightId_fkey') THEN
    ALTER TABLE "hr_entitlement_rules"
      ADD CONSTRAINT "hr_entitlement_rules_sourceRightId_fkey"
      FOREIGN KEY ("sourceRightId") REFERENCES "legal_rights"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_entitlement_rules_sourceRuleVersionId_fkey') THEN
    ALTER TABLE "hr_entitlement_rules"
      ADD CONSTRAINT "hr_entitlement_rules_sourceRuleVersionId_fkey"
      FOREIGN KEY ("sourceRuleVersionId") REFERENCES "legal_right_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "organizations_regulatoryCountryCode_idx" ON "organizations"("regulatoryCountryCode");
CREATE INDEX IF NOT EXISTS "organizations_regulatoryCountrySelectedById_idx" ON "organizations"("regulatoryCountrySelectedById");
CREATE INDEX IF NOT EXISTS "hr_entitlement_rules_org_source_right_idx" ON "hr_entitlement_rules"("organizationId", "sourceRightId");
CREATE INDEX IF NOT EXISTS "hr_entitlement_rules_source_rule_version_idx" ON "hr_entitlement_rules"("sourceRuleVersionId");
