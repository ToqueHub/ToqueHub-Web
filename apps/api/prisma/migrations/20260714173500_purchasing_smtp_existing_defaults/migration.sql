-- Normalize settings created before the STARTTLS default changed.
UPDATE "purchasing_settings"
SET "smtpSecure" = false
WHERE "smtpHost" IS NULL
  AND "smtpSecure" = true
  AND ("smtpPort" IS NULL OR "smtpPort" = 587);
