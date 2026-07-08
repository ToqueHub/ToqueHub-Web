CREATE TABLE IF NOT EXISTS "mobile_push_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT,
  "deviceId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRegisteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mobile_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_push_tokens_token_key" ON "mobile_push_tokens"("token");
CREATE INDEX IF NOT EXISTS "mobile_push_tokens_organizationId_idx" ON "mobile_push_tokens"("organizationId");
CREATE INDEX IF NOT EXISTS "mobile_push_tokens_userId_idx" ON "mobile_push_tokens"("userId");
CREATE INDEX IF NOT EXISTS "mobile_push_tokens_isActive_idx" ON "mobile_push_tokens"("isActive");
CREATE INDEX IF NOT EXISTS "mobile_push_tokens_lastRegisteredAt_idx" ON "mobile_push_tokens"("lastRegisteredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mobile_push_tokens_organizationId_fkey'
  ) THEN
    ALTER TABLE "mobile_push_tokens"
    ADD CONSTRAINT "mobile_push_tokens_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mobile_push_tokens_userId_fkey'
  ) THEN
    ALTER TABLE "mobile_push_tokens"
    ADD CONSTRAINT "mobile_push_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "iot_alert_events"
  ADD COLUMN IF NOT EXISTS "notificationLastSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notificationCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "iot_alert_events_notificationLastSentAt_idx" ON "iot_alert_events"("notificationLastSentAt");
