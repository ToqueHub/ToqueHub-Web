CREATE TYPE "HaccpReceptionControlStatus" AS ENUM ('CONFORMING', 'PARTIAL', 'REJECTED');

ALTER TABLE "stock_receptions"
  ADD COLUMN "deliveryTemperature" DECIMAL(7,2),
  ADD COLUMN "controlStatus" "HaccpReceptionControlStatus",
  ADD COLUMN "controlNotes" TEXT;

ALTER TABLE "stock_reception_lines"
  ADD COLUMN "deliveredQuantity" DECIMAL(12,3),
  ADD COLUMN "acceptedQuantity" DECIMAL(12,3);

ALTER TABLE "purchase_receipts"
  ADD COLUMN "deliveryTemperature" DECIMAL(7,2),
  ADD COLUMN "controlConforming" BOOLEAN,
  ADD COLUMN "controlNotes" TEXT;
