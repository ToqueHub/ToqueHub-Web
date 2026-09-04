ALTER TABLE "finance_settings"
  ADD COLUMN IF NOT EXISTS "flatpayAutomationInstalledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "flatpayAutomationInbox" TEXT,
  ADD COLUMN IF NOT EXISTS "flatpayHistoryStart" TIMESTAMP(3);
