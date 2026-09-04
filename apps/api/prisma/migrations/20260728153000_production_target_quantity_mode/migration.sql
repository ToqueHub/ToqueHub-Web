ALTER TABLE "production_orders"
ADD COLUMN "targetMode" "TechnicalSheetYieldMode",
ADD COLUMN "targetQuantity" DECIMAL(14, 3);
