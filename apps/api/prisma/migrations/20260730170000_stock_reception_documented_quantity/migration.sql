ALTER TABLE "stock_reception_lines"
ADD COLUMN "documentedQuantity" DECIMAL(12,3);

UPDATE "stock_reception_lines"
SET "documentedQuantity" = COALESCE("deliveredQuantity", "quantity")
WHERE "documentedQuantity" IS NULL;
