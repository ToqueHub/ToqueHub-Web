-- Add deterministic deduplication key for planning day statuses.
-- The key is intentionally organization-scoped in the unique index below.

ALTER TABLE "planning_day_statuses" ADD COLUMN "dedupeKey" TEXT;

WITH keyed AS (
  SELECT
    "id",
    CASE
      WHEN "sourceType" = 'HR_ABSENCE' AND NULLIF(BTRIM("sourceId"), '') IS NOT NULL
        THEN CONCAT('hr-absence:', BTRIM("sourceId"), ':', TO_CHAR("date", 'YYYY-MM-DD'))
      WHEN "sourceType" = 'ASSIGNMENT_COMMENT' AND NULLIF(BTRIM("sourceId"), '') IS NOT NULL
        THEN CONCAT('assignment-meta:', BTRIM("sourceId"), ':', TO_CHAR("date", 'YYYY-MM-DD'), ':', LOWER("statusCode"))
      WHEN "sourceType" = 'IMPORT' AND NULLIF(BTRIM("sourceId"), '') IS NOT NULL
        THEN CONCAT('import:', BTRIM("sourceId"), ':', "employeeId"::TEXT, ':', TO_CHAR("date", 'YYYY-MM-DD'), ':', LOWER("statusCode"))
      WHEN NULLIF(BTRIM("sourceId"), '') IS NOT NULL
        THEN CONCAT(LOWER("sourceType"::TEXT), ':', BTRIM("sourceId"), ':', "employeeId"::TEXT, ':', TO_CHAR("date", 'YYYY-MM-DD'), ':', LOWER("statusCode"))
      WHEN "sourceType" = 'IMPORT'
        THEN CONCAT('import:', "employeeId"::TEXT, ':', TO_CHAR("date", 'YYYY-MM-DD'), ':', LOWER("statusCode"))
      ELSE CONCAT('manual:', "employeeId"::TEXT, ':', TO_CHAR("date", 'YYYY-MM-DD'), ':', LOWER("statusCode"))
    END AS "baseKey"
  FROM "planning_day_statuses"
),
ranked AS (
  SELECT
    "id",
    "baseKey",
    ROW_NUMBER() OVER (PARTITION BY "baseKey" ORDER BY "id") AS "rank"
  FROM keyed
)
UPDATE "planning_day_statuses" AS status
SET "dedupeKey" = CASE
  WHEN ranked."rank" = 1 THEN ranked."baseKey"
  ELSE CONCAT(ranked."baseKey", ':legacy-duplicate:', status."id"::TEXT)
END
FROM ranked
WHERE status."id" = ranked."id";

ALTER TABLE "planning_day_statuses" ALTER COLUMN "dedupeKey" SET NOT NULL;

CREATE UNIQUE INDEX "planning_day_statuses_organizationId_dedupeKey_key" ON "planning_day_statuses"("organizationId", "dedupeKey");
CREATE INDEX "planning_day_statuses_dedupeKey_idx" ON "planning_day_statuses"("dedupeKey");
