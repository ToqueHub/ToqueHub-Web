-- Resend now follows the same organization-level API-key lifecycle as Mistral.
-- The former encrypted Purchasing column is intentionally kept to avoid
-- destructive data loss during upgrades, but the application no longer reads it.
ALTER TABLE "organizations"
  ADD COLUMN "resendApiKey" TEXT,
  ADD COLUMN "resendApiKeyUpdatedAt" TIMESTAMP(3);
