WITH recipe_mass AS (
  SELECT
    ingredient."technicalSheetId",
    SUM(
      CASE
        WHEN LOWER(unit.symbol) = 'kg' THEN ingredient.quantity * 1000
        WHEN LOWER(unit.symbol) IN ('g', 'gr') THEN ingredient.quantity
        WHEN LOWER(unit.symbol) = 'mg' THEN ingredient.quantity / 1000
        WHEN LOWER(unit.symbol) = 't' THEN ingredient.quantity * 1000000
        WHEN direct_conversion.factor IS NOT NULL THEN ingredient.quantity * direct_conversion.factor
        WHEN reverse_conversion.factor IS NOT NULL AND reverse_conversion.factor <> 0 THEN ingredient.quantity / reverse_conversion.factor
        ELSE 0
      END
    ) AS grams
  FROM "technical_sheet_ingredients" ingredient
  JOIN "units" unit ON unit.id = ingredient."unitId" AND unit.type = 'MASS'
  LEFT JOIN "units" gram_unit
    ON gram_unit."organizationId" = ingredient."organizationId"
    AND gram_unit.type = 'MASS'
    AND LOWER(gram_unit.symbol) = 'g'
    AND gram_unit."isArchived" = false
  LEFT JOIN "unit_conversions" direct_conversion
    ON direct_conversion."organizationId" = ingredient."organizationId"
    AND direct_conversion."fromUnitId" = ingredient."unitId"
    AND direct_conversion."toUnitId" = gram_unit.id
  LEFT JOIN "unit_conversions" reverse_conversion
    ON reverse_conversion."organizationId" = ingredient."organizationId"
    AND reverse_conversion."fromUnitId" = gram_unit.id
    AND reverse_conversion."toUnitId" = ingredient."unitId"
  GROUP BY ingredient."technicalSheetId"
)
UPDATE "technical_sheets" sheet
SET "totalMassGrams" = COALESCE(recipe_mass.grams, 0)
FROM recipe_mass
WHERE recipe_mass."technicalSheetId" = sheet.id;
