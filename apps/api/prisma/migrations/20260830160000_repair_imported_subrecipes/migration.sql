BEGIN;

-- Les anciens imports Kespro créaient parfois un produit temporaire
-- « ... (ingrédient Kespro) » alors qu'une fabrication active du même nom
-- existait déjà. Seules les correspondances exactes et uniques sont réparées.
CREATE TEMP TABLE "_repair_imported_subrecipes" ON COMMIT DROP AS
SELECT
  ingredient.id AS "ingredientId",
  parent.id AS "parentId",
  source.id AS "sourceId",
  source."outputProductId" AS "sourceProductId",
  source_product.name AS "sourceProductName",
  source_product."unitId" AS "sourceProductUnitId",
  source_unit.symbol AS "sourceProductUnitSymbol",
  COUNT(*) OVER (PARTITION BY ingredient.id) AS "candidateCount"
FROM technical_sheet_ingredients ingredient
JOIN technical_sheets parent
  ON parent.id = ingredient."technicalSheetId"
JOIN products imported_product
  ON imported_product.id = ingredient."productId"
JOIN technical_sheets source
  ON source."organizationId" = parent."organizationId"
 AND LOWER(source.name) = LOWER(
   BTRIM(
     REGEXP_REPLACE(
       imported_product.name,
       '\s*\((ingr[eé]dient|ingredient)\s+kespro\)\s*$',
       '',
       'i'
     )
   )
 )
JOIN products source_product
  ON source_product.id = source."outputProductId"
JOIN units source_unit
  ON source_unit.id = source_product."unitId"
WHERE ingredient."sourceTechnicalSheetId" IS NULL
  AND imported_product.name ~* '\((ingr[eé]dient|ingredient)\s+kespro\)\s*$'
  AND parent."isArchived" = FALSE
  AND source.id <> parent.id
  AND source."isArchived" = FALSE
  AND source.mode = 'PRODUCTION'
  AND source.status IN ('ACTIVE', 'VALIDATED')
  AND source."outputProductId" IS NOT NULL
  AND source."yieldUnitId" IS NOT NULL
  AND source_product."isArchived" = FALSE;

DELETE FROM "_repair_imported_subrecipes"
WHERE "candidateCount" <> 1;

UPDATE technical_sheets parent
SET mode = 'ASSEMBLY',
    "updatedAt" = NOW()
FROM (
  SELECT DISTINCT "parentId"
  FROM "_repair_imported_subrecipes"
) repair
WHERE parent.id = repair."parentId";

UPDATE products output_product
SET kind = 'FINISHED',
    "updatedAt" = NOW()
FROM technical_sheets parent
JOIN (
  SELECT DISTINCT "parentId"
  FROM "_repair_imported_subrecipes"
) repair
  ON repair."parentId" = parent.id
WHERE output_product.id = parent."outputProductId";

UPDATE technical_sheet_ingredients ingredient
SET "sourceTechnicalSheetId" = repair."sourceId",
    "productId" = repair."sourceProductId",
    "productNameSnapshot" = repair."sourceProductName",
    "productUnitIdSnapshot" = repair."sourceProductUnitId",
    "productUnitSymbolSnapshot" = repair."sourceProductUnitSymbol",
    "productArchivedSnapshot" = FALSE,
    "isCalculable" = TRUE,
    "nonCalculableReason" = NULL,
    "updatedAt" = NOW()
FROM "_repair_imported_subrecipes" repair
WHERE ingredient.id = repair."ingredientId";

INSERT INTO technical_sheet_history (
  id,
  "organizationId",
  "technicalSheetId",
  action,
  summary,
  details
)
SELECT
  gen_random_uuid(),
  parent."organizationId",
  parent.id,
  'INGREDIENTS_UPDATED',
  'Sous-recettes Kespro rapprochées automatiquement',
  JSONB_BUILD_OBJECT(
    'source', 'migration-20260830160000',
    'repairedIngredientCount', COUNT(repair."ingredientId")
  )
FROM "_repair_imported_subrecipes" repair
JOIN technical_sheets parent
  ON parent.id = repair."parentId"
GROUP BY parent."organizationId", parent.id;

COMMIT;
