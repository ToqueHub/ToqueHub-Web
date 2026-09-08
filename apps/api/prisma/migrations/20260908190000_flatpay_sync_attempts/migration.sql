ALTER TABLE "finance_flatpay_connections"
ADD COLUMN "automationLastAttemptAt" TIMESTAMP(3);

UPDATE "finance_flatpay_connections"
SET "automationLastAttemptAt" = "lastSyncedAt"
WHERE "lastSyncedAt" IS NOT NULL;
