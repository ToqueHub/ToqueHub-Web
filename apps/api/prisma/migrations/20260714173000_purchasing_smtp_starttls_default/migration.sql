-- Port 587 uses STARTTLS by default. Keep TLS direct available explicitly for port 465.
ALTER TABLE "purchasing_settings"
ALTER COLUMN "smtpSecure" SET DEFAULT false;

UPDATE "purchasing_settings"
SET "smtpSecure" = false
WHERE "smtpHost" IS NULL
  AND "smtpPort" = 587
  AND "smtpSecure" = true;
