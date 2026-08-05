ALTER TABLE "finance_settings"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  ADD COLUMN IF NOT EXISTS "flatpayPortalUrl" TEXT NOT NULL DEFAULT 'https://portal.flatpay.com',
  ADD COLUMN IF NOT EXISTS "flatpayUsername" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayCredentialStorage" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayPasswordEncrypted" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayPasswordMask" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayConfiguredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "flatpayLastSyncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "flatpayLastError" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayAutomationInstalledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "flatpayAutomationInbox" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayHistoryStart" TIMESTAMP(3);
