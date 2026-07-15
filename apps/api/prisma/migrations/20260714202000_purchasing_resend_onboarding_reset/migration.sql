-- Existing SMTP onboarding completion cannot prove that Resend is configured.
-- Reopen the email step while preserving all purchasing business data.
UPDATE "purchasing_onboarding_progress"
SET
  "currentStep" = 'email',
  "completedSteps" = array_remove("completedSteps", 'email'),
  "skippedEmailSetup" = false,
  "completedAt" = NULL;
