-- CreateEnum
CREATE TYPE "PurchasingDeliveryMode" AS ENUM ('SCHEDULED_DAYS', 'ON_DEMAND');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseDispatchStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('DRAFT', 'REVIEW_NEEDED', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseReceiptLineStatus" AS ENUM ('MATCHED', 'SHORT', 'OVER', 'UNEXPECTED', 'SUBSTITUTED', 'NEEDS_REVIEW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MODULE_PURCHASING_INSTALLED';
ALTER TYPE "AuditAction" ADD VALUE 'MODULE_PURCHASING_UNINSTALLED';
ALTER TABLE "organizations" ADD COLUMN     "purchasingInstalledAt" TIMESTAMP(3);

ALTER TABLE "stock_receptions" ADD COLUMN     "purchaseReceiptId" UUID;

-- CreateTable
CREATE TABLE "purchasing_settings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "replenishmentDays" INTEGER NOT NULL DEFAULT 7,
    "consumptionWindowDays" INTEGER NOT NULL DEFAULT 28,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "fromEmail" TEXT,
    "fromName" TEXT,
    "replyTo" TEXT,
    "smtpVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchasing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchasing_onboarding_progress" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'welcome',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skippedSmtp" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchasing_onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchasing_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "orderEmail" TEXT,
    "customerCode" TEXT,
    "deliveryMode" "PurchasingDeliveryMode" NOT NULL DEFAULT 'ON_DEMAND',
    "deliveryWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "cutoffTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "minimumOrder" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "orderingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_purchasing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product_offers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "orderUnitId" UUID,
    "supplierReference" TEXT NOT NULL,
    "supplierLabel" TEXT,
    "unitsPerOrderUnit" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "minimumOrderQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "orderIncrement" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_product_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product_price_history" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_number_sequences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "expectedDeliveryDate" TIMESTAMP(3),
    "supplierNameSnapshot" TEXT NOT NULL,
    "supplierEmailSnapshot" TEXT,
    "customerCodeSnapshot" TEXT,
    "deliveryAddressSnapshot" TEXT,
    "totalExcludingTax" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalTax" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalIncludingTax" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "supplierMessage" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "sentById" UUID,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "offerId" UUID,
    "productId" UUID NOT NULL,
    "unitId" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "productNameSnapshot" TEXT NOT NULL,
    "supplierReferenceSnapshot" TEXT,
    "supplierLabelSnapshot" TEXT,
    "unitSymbolSnapshot" TEXT,
    "orderedQuantity" DECIMAL(12,3) NOT NULL,
    "unitsPerOrderUnit" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "expectedStockQuantity" DECIMAL(12,3) NOT NULL,
    "receivedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "lineExcludingTax" DECIMAL(14,4) NOT NULL,
    "lineTax" DECIMAL(14,4) NOT NULL,
    "lineIncludingTax" DECIMAL(14,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_dispatches" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PurchaseDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "PurchaseReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "siteId" UUID NOT NULL,
    "locationId" UUID,
    "deliveryNoteDocumentId" UUID,
    "extractionId" UUID,
    "deliveryNoteNumber" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "validatedById" UUID,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_lines" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID,
    "productId" UUID,
    "unitId" UUID,
    "reference" TEXT,
    "label" TEXT NOT NULL,
    "deliveredQuantity" DECIMAL(12,3) NOT NULL,
    "acceptedQuantity" DECIMAL(12,3) NOT NULL,
    "unitsPerOrderUnit" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,4),
    "status" "PurchaseReceiptLineStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_events" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actorUserId" UUID,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchasing_settings_organizationId_key" ON "purchasing_settings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "purchasing_onboarding_progress_organizationId_key" ON "purchasing_onboarding_progress"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchasing_profiles_supplierId_key" ON "supplier_purchasing_profiles"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_purchasing_profiles_organizationId_idx" ON "supplier_purchasing_profiles"("organizationId");

-- CreateIndex
CREATE INDEX "supplier_purchasing_profiles_orderingEnabled_idx" ON "supplier_purchasing_profiles"("orderingEnabled");

-- CreateIndex
CREATE INDEX "supplier_product_offers_organizationId_supplierId_isActive_idx" ON "supplier_product_offers"("organizationId", "supplierId", "isActive");

-- CreateIndex
CREATE INDEX "supplier_product_offers_organizationId_productId_isActive_idx" ON "supplier_product_offers"("organizationId", "productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_offers_organizationId_supplierId_supplierR_key" ON "supplier_product_offers"("organizationId", "supplierId", "supplierReference");

-- CreateIndex
CREATE INDEX "supplier_product_price_history_organizationId_recordedAt_idx" ON "supplier_product_price_history"("organizationId", "recordedAt");

-- CreateIndex
CREATE INDEX "supplier_product_price_history_offerId_recordedAt_idx" ON "supplier_product_price_history"("offerId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_number_sequences_organizationId_year_key" ON "purchase_number_sequences"("organizationId", "year");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_status_createdAt_idx" ON "purchase_orders"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_supplierId_createdAt_idx" ON "purchase_orders"("organizationId", "supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_orders_organizationId_expectedDeliveryDate_idx" ON "purchase_orders"("organizationId", "expectedDeliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_organizationId_number_key" ON "purchase_orders"("organizationId", "number");

-- CreateIndex
CREATE INDEX "purchase_order_lines_organizationId_orderId_idx" ON "purchase_order_lines"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_organizationId_productId_idx" ON "purchase_order_lines"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "purchase_order_dispatches_organizationId_status_createdAt_idx" ON "purchase_order_dispatches"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_dispatches_orderId_idempotencyKey_key" ON "purchase_order_dispatches"("orderId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_deliveryNoteDocumentId_key" ON "purchase_receipts"("deliveryNoteDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_extractionId_key" ON "purchase_receipts"("extractionId");

-- CreateIndex
CREATE INDEX "purchase_receipts_organizationId_status_createdAt_idx" ON "purchase_receipts"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_receipts_organizationId_orderId_createdAt_idx" ON "purchase_receipts"("organizationId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_organizationId_receiptId_idx" ON "purchase_receipt_lines"("organizationId", "receiptId");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_purchaseOrderLineId_idx" ON "purchase_receipt_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "purchase_receipt_lines_productId_idx" ON "purchase_receipt_lines"("productId");

-- CreateIndex
CREATE INDEX "purchase_order_events_organizationId_createdAt_idx" ON "purchase_order_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "purchase_order_events_orderId_createdAt_idx" ON "purchase_order_events"("orderId", "createdAt");
CREATE UNIQUE INDEX "stock_receptions_purchaseReceiptId_key" ON "stock_receptions"("purchaseReceiptId");

-- AddForeignKey
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchasing_settings" ADD CONSTRAINT "purchasing_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchasing_onboarding_progress" ADD CONSTRAINT "purchasing_onboarding_progress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchasing_profiles" ADD CONSTRAINT "supplier_purchasing_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchasing_profiles" ADD CONSTRAINT "supplier_purchasing_profiles_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_offers" ADD CONSTRAINT "supplier_product_offers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_offers" ADD CONSTRAINT "supplier_product_offers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_offers" ADD CONSTRAINT "supplier_product_offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_offers" ADD CONSTRAINT "supplier_product_offers_orderUnitId_fkey" FOREIGN KEY ("orderUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_price_history" ADD CONSTRAINT "supplier_product_price_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_price_history" ADD CONSTRAINT "supplier_product_price_history_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "supplier_product_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_number_sequences" ADD CONSTRAINT "purchase_number_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "supplier_product_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_dispatches" ADD CONSTRAINT "purchase_order_dispatches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_dispatches" ADD CONSTRAINT "purchase_order_dispatches_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_deliveryNoteDocumentId_fkey" FOREIGN KEY ("deliveryNoteDocumentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "ocr_business_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
