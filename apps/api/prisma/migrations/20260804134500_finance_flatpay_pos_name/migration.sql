UPDATE "finance_data_sources" AS source
SET "name" = 'FlatPay POS'
WHERE source."provider" = 'FLATPAY'
  AND source."name" IN ('Rapports de caisse', 'Rapports de caisse par FlatPay')
  AND NOT EXISTS (
    SELECT 1
    FROM "finance_data_sources" AS existing
    WHERE existing."organizationId" = source."organizationId"
      AND existing."provider" = 'FLATPAY'
      AND existing."name" = 'FlatPay POS'
  );
