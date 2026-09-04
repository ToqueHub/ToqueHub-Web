-- referencePortions représente toujours un nombre de portions obtenues.
-- Répare les anciennes sorties configurées en bac/kg/etc. avant la simplification de l'écran.
WITH "count_units" AS (
  SELECT DISTINCT ON ("organizationId") "organizationId", "id"
  FROM "units"
  WHERE "type" = 'COUNT' AND "isArchived" = false
  ORDER BY "organizationId", "createdAt" ASC
)
UPDATE "technical_sheets" AS "sheet"
SET "yieldUnitId" = "count_units"."id"
FROM "count_units"
WHERE "sheet"."organizationId" = "count_units"."organizationId"
  AND "sheet"."outputProductId" IS NOT NULL;

WITH "count_units" AS (
  SELECT DISTINCT ON ("organizationId") "organizationId", "id"
  FROM "units"
  WHERE "type" = 'COUNT' AND "isArchived" = false
  ORDER BY "organizationId", "createdAt" ASC
)
UPDATE "products" AS "product"
SET
  "unitId" = "count_units"."id",
  "kind" = CASE WHEN "sheet"."mode" = 'PRODUCTION' THEN 'INTERMEDIATE'::"ProductKind" ELSE 'FINISHED'::"ProductKind" END
FROM "technical_sheets" AS "sheet", "count_units"
WHERE "sheet"."outputProductId" = "product"."id"
  AND "sheet"."organizationId" = "count_units"."organizationId";

WITH "count_units" AS (
  SELECT DISTINCT ON ("organizationId") "organizationId", "id"
  FROM "units"
  WHERE "type" = 'COUNT' AND "isArchived" = false
  ORDER BY "organizationId", "createdAt" ASC
)
UPDATE "production_profiles" AS "profile"
SET "yieldUnitId" = "count_units"."id"
FROM "count_units"
WHERE "profile"."organizationId" = "count_units"."organizationId";
