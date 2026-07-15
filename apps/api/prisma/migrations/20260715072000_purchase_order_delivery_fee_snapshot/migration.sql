ALTER TABLE "purchase_orders"
ADD COLUMN "deliveryFeeSnapshot" DECIMAL(12,4) NOT NULL DEFAULT 0;
