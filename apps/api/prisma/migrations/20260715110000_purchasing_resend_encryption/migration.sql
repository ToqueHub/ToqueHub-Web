-- Progressive, non-destructive encryption support for the organization Resend key.
-- Existing plaintext values remain readable until the application migrates them
-- with the configured server-side encryption key.
ALTER TABLE "organizations"
  ADD COLUMN "resendApiKeyEncrypted" TEXT,
  ADD COLUMN "resendApiKeyMask" TEXT,
  ADD COLUMN "resendApiKeyCipherVersion" INTEGER;
