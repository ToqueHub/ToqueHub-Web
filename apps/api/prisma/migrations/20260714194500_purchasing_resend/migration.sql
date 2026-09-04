-- Purchasing email delivery is handled exclusively through the Resend API.
ALTER TABLE "purchasing_settings"
  ADD COLUMN "resendApiKeyEncrypted" TEXT,
  ADD COLUMN "resendVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "resendLastTestEmailId" TEXT,
  DROP COLUMN "smtpHost",
  DROP COLUMN "smtpPort",
  DROP COLUMN "smtpSecure",
  DROP COLUMN "smtpUsername",
  DROP COLUMN "smtpPasswordEncrypted",
  DROP COLUMN "smtpVerifiedAt";

ALTER TABLE "purchasing_onboarding_progress"
  RENAME COLUMN "skippedSmtp" TO "skippedEmailSetup";

UPDATE "purchasing_onboarding_progress"
SET "currentStep" = 'email'
WHERE "currentStep" = 'smtp';

UPDATE "purchasing_onboarding_progress"
SET "completedSteps" = array_replace("completedSteps", 'smtp', 'email');
