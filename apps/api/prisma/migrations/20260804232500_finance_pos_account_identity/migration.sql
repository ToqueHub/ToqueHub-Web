ALTER TABLE "finance_pos_connections"
  ADD COLUMN "accountFingerprint" TEXT;

UPDATE "finance_pos_connections"
SET "accountFingerprint" = 'legacy:' || "id"::TEXT;

ALTER TABLE "finance_pos_connections"
  ALTER COLUMN "accountFingerprint" SET NOT NULL;

CREATE UNIQUE INDEX "finance_pos_connections_organizationId_provider_accountFingerprint_key"
  ON "finance_pos_connections"("organizationId", "provider", "accountFingerprint");

ALTER TABLE "finance_flatpay_connections"
  ADD COLUMN "accountFingerprint" TEXT;

UPDATE "finance_flatpay_connections"
SET "accountFingerprint" = 'flatpay:' || LOWER(TRIM("username"));

ALTER TABLE "finance_flatpay_connections"
  ALTER COLUMN "accountFingerprint" SET NOT NULL;

CREATE UNIQUE INDEX "finance_flatpay_connections_organizationId_accountFingerprint_key"
  ON "finance_flatpay_connections"("organizationId", "accountFingerprint");
