ALTER TABLE "finance_data_sources"
ADD COLUMN "isPrimaryPos" BOOLEAN NOT NULL DEFAULT false;

WITH ranked_sources AS (
  SELECT
    source."id",
    ROW_NUMBER() OVER (
      PARTITION BY source."organizationId"
      ORDER BY
        CASE
          WHEN source."provider" = 'FLATPAY' AND source."status" = 'READY' THEN 0
          WHEN source."provider" = 'FLATPAY' THEN 1
          WHEN source."isPrimarySales" = true AND source."status" = 'READY' THEN 2
          WHEN source."isPrimarySales" = true THEN 3
          ELSE 4
        END,
        source."lastSyncedAt" DESC NULLS LAST,
        source."createdAt" ASC
    ) AS source_rank
  FROM "finance_data_sources" source
  WHERE source."sourceType" <> 'ACCOUNTING_API'
)
UPDATE "finance_data_sources" source
SET "isPrimaryPos" = true
FROM ranked_sources ranked
WHERE source."id" = ranked."id"
  AND ranked.source_rank = 1;

CREATE UNIQUE INDEX "finance_data_sources_one_primary_pos_per_organization"
ON "finance_data_sources" ("organizationId")
WHERE "isPrimaryPos" = true;
