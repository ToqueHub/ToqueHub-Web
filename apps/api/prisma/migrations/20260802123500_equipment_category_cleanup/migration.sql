UPDATE "products"
SET "categoryId" = NULL
WHERE "kind" = 'EQUIPMENT'
  AND "categoryId" IS NOT NULL;
