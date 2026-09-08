-- A POS configuration used to create a second, empty source whenever the
-- synchronized source already had an external location id. Keep every source
-- containing business data and remove only unused placeholders superseded by
-- a real location for the same provider and site.
DELETE FROM "finance_data_sources" AS placeholder
WHERE placeholder."provider" IN ('LOYVERSE', 'PAYPAL_POS')
  AND placeholder."sourceType" = 'POS_API'
  AND placeholder."externalLocationId" IS NULL
  AND placeholder."status" = 'NOT_CONNECTED'
  AND EXISTS (
    SELECT 1
    FROM "finance_data_sources" AS synchronized
    WHERE synchronized."organizationId" = placeholder."organizationId"
      AND synchronized."provider" = placeholder."provider"
      AND synchronized."siteId" IS NOT DISTINCT FROM placeholder."siteId"
      AND synchronized."externalLocationId" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "finance_import_batches" AS batch
    WHERE batch."sourceId" = placeholder."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "finance_ledger_entries" AS entry
    WHERE entry."sourceId" = placeholder."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "finance_sync_runs" AS run
    WHERE run."sourceId" = placeholder."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "finance_daily_sales" AS sale
    WHERE sale."sourceId" = placeholder."id"
  );
