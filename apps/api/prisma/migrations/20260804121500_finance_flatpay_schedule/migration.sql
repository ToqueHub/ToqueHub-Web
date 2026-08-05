ALTER TABLE "finance_settings"
  ADD COLUMN IF NOT EXISTS "flatpayAutomationSchedule" TEXT[] NOT NULL
  DEFAULT ARRAY['07:00', '15:00', '19:00', '23:00']::TEXT[];

UPDATE "finance_data_sources" AS source
SET "name" = 'Rapports de caisse par FlatPay'
WHERE source."provider" = 'FLATPAY'
  AND source."name" = 'Rapports de caisse'
  AND NOT EXISTS (
    SELECT 1
    FROM "finance_data_sources" AS existing
    WHERE existing."organizationId" = source."organizationId"
      AND existing."provider" = 'FLATPAY'
      AND existing."name" = 'Rapports de caisse par FlatPay'
  );
