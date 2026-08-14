ALTER TABLE "caterer_clients"
  ADD COLUMN "name2" TEXT,
  ADD COLUMN "fax" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "countryCode" TEXT,
  ADD COLUMN "businessId" TEXT,
  ADD COLUMN "vatNumber" TEXT,
  ADD COLUMN "accountTypeId" INTEGER,
  ADD COLUMN "accountCode" TEXT,
  ADD COLUMN "customerNumber" TEXT,
  ADD COLUMN "customerGroupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN "eInvoiceAddress" TEXT,
  ADD COLUMN "eInvoiceOperatorId" TEXT,
  ADD COLUMN "eInvoiceUnitNumber" INTEGER,
  ADD COLUMN "invoiceDeliveryMethod" TEXT,
  ADD COLUMN "localeId" INTEGER,
  ADD COLUMN "localeCode" TEXT,
  ADD COLUMN "paymentTermId" INTEGER,
  ADD COLUMN "auxiliaryNameId" INTEGER,
  ADD COLUMN "salesPriceListId" INTEGER,
  ADD COLUMN "salesTaxClassId" INTEGER,
  ADD COLUMN "invoiceIncludesVat" BOOLEAN,
  ADD COLUMN "factoringPartnerId" INTEGER,
  ADD COLUMN "autoReminderOverride" BOOLEAN,
  ADD COLUMN "autoReminderEnabled" BOOLEAN,
  ADD COLUMN "autoReminderCount" INTEGER,
  ADD COLUMN "autoReminderInterval" INTEGER,
  ADD COLUMN "autoReminderLastStep" INTEGER,
  ADD COLUMN "ourReference" TEXT,
  ADD COLUMN "yourReference" TEXT,
  ADD COLUMN "shippingName" TEXT,
  ADD COLUMN "shippingName2" TEXT,
  ADD COLUMN "shippingAddress" TEXT,
  ADD COLUMN "shippingPostalCode" TEXT,
  ADD COLUMN "shippingCity" TEXT,
  ADD COLUMN "shippingCountryCode" TEXT,
  ADD COLUMN "shippingCountryId" INTEGER,
  ADD COLUMN "currencyId" INTEGER,
  ADD COLUMN "salesIsRefused" BOOLEAN,
  ADD COLUMN "fennoaId" INTEGER,
  ADD COLUMN "fennoaOwnerUserId" INTEGER,
  ADD COLUMN "fennoaDescription" TEXT,
  ADD COLUMN "fennoaTitle" TEXT,
  ADD COLUMN "fennoaModifiedAt" TIMESTAMP(3),
  ADD COLUMN "fennoaSyncedAt" TIMESTAMP(3),
  ADD COLUMN "fennoaPayload" JSONB,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "caterer_client_invoices" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "clientId" UUID,
  "fennoaId" INTEGER NOT NULL,
  "invoiceNumber" TEXT,
  "invoiceTypeId" INTEGER,
  "status" TEXT,
  "customerFennoaId" INTEGER,
  "customerName" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "dueDate" TIMESTAMP(3),
  "createdInFennoaAt" TIMESTAMP(3),
  "totalNet" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalGross" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalVat" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalPaid" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalDue" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "currencyCode" TEXT,
  "bankingReference" TEXT,
  "ourReference" TEXT,
  "yourReference" TEXT,
  "deliveryMethod" TEXT,
  "deliveryTerms" TEXT,
  "orderIdentifier" TEXT,
  "agreementIdentifier" TEXT,
  "notesInternal" TEXT,
  "invoiceRows" JSONB,
  "payments" JSONB,
  "deliveries" JSONB,
  "fennoaPayload" JSONB,
  "fennoaSyncedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "caterer_client_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "caterer_clients_organizationId_fennoaId_key"
  ON "caterer_clients"("organizationId", "fennoaId");
CREATE INDEX "caterer_clients_organizationId_customerNumber_idx"
  ON "caterer_clients"("organizationId", "customerNumber");
CREATE INDEX "caterer_clients_organizationId_businessId_idx"
  ON "caterer_clients"("organizationId", "businessId");
CREATE INDEX "caterer_clients_organizationId_vatNumber_idx"
  ON "caterer_clients"("organizationId", "vatNumber");
CREATE UNIQUE INDEX "caterer_client_invoices_organizationId_fennoaId_key"
  ON "caterer_client_invoices"("organizationId", "fennoaId");
CREATE INDEX "caterer_client_invoices_organizationId_invoiceDate_idx"
  ON "caterer_client_invoices"("organizationId", "invoiceDate");
CREATE INDEX "caterer_client_invoices_clientId_invoiceDate_idx"
  ON "caterer_client_invoices"("clientId", "invoiceDate");
CREATE INDEX "caterer_client_invoices_customerFennoaId_idx"
  ON "caterer_client_invoices"("customerFennoaId");

ALTER TABLE "caterer_client_invoices"
  ADD CONSTRAINT "caterer_client_invoices_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caterer_client_invoices"
  ADD CONSTRAINT "caterer_client_invoices_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "caterer_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
