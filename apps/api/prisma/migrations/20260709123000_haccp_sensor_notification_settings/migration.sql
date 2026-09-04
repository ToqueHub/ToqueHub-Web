CREATE TABLE IF NOT EXISTS "haccp_sensor_notification_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "repeatIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
  "repeatEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "haccp_sensor_notification_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "haccp_sensor_notification_settings_organizationId_key"
  ON "haccp_sensor_notification_settings"("organizationId");

ALTER TABLE "haccp_sensor_notification_settings"
  ADD CONSTRAINT "haccp_sensor_notification_settings_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
