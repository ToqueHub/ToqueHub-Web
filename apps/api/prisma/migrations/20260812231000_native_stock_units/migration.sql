-- Add the fixed Centilitre unit to existing organizations.
INSERT INTO "units" (
  "id",
  "name",
  "symbol",
  "type",
  "isArchived",
  "archivedAt",
  "organizationId",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  'Centilitre',
  'cL',
  'VOLUME'::"UnitType",
  false,
  NULL,
  organization."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" organization
WHERE NOT EXISTS (
  SELECT 1
  FROM "units" unit
  WHERE unit."organizationId" = organization."id"
    AND unit."symbol" = 'cL'
);

-- Restore the immutable labels and statuses of the six native units.
UPDATE "units"
SET
  "name" = CASE "symbol"
    WHEN 'kg' THEN 'Kilogramme'
    WHEN 'g' THEN 'Gramme'
    WHEN 'L' THEN 'Litre'
    WHEN 'cL' THEN 'Centilitre'
    WHEN 'pièce' THEN 'Pièce'
    WHEN 'caisse' THEN 'Caisse'
  END,
  "type" = CASE "symbol"
    WHEN 'kg' THEN 'MASS'::"UnitType"
    WHEN 'g' THEN 'MASS'::"UnitType"
    WHEN 'L' THEN 'VOLUME'::"UnitType"
    WHEN 'cL' THEN 'VOLUME'::"UnitType"
    WHEN 'pièce' THEN 'COUNT'::"UnitType"
    WHEN 'caisse' THEN 'PACKAGE'::"UnitType"
  END,
  "isArchived" = false,
  "archivedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" IN ('kg', 'g', 'L', 'cL', 'pièce', 'caisse');

-- Keep the internal L/cL conversions available even though they are hidden from users.
INSERT INTO "unit_conversions" (
  "id",
  "organizationId",
  "fromUnitId",
  "toUnitId",
  "factor",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  litre."organizationId",
  litre."id",
  centilitre."id",
  100,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "units" litre
JOIN "units" centilitre
  ON centilitre."organizationId" = litre."organizationId"
 AND centilitre."symbol" = 'cL'
WHERE litre."symbol" = 'L'
ON CONFLICT ("organizationId", "fromUnitId", "toUnitId")
DO UPDATE SET "factor" = EXCLUDED."factor", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "unit_conversions" (
  "id",
  "organizationId",
  "fromUnitId",
  "toUnitId",
  "factor",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  centilitre."organizationId",
  centilitre."id",
  litre."id",
  0.01,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "units" centilitre
JOIN "units" litre
  ON litre."organizationId" = centilitre."organizationId"
 AND litre."symbol" = 'L'
WHERE centilitre."symbol" = 'cL'
ON CONFLICT ("organizationId", "fromUnitId", "toUnitId")
DO UPDATE SET "factor" = EXCLUDED."factor", "updatedAt" = CURRENT_TIMESTAMP;
