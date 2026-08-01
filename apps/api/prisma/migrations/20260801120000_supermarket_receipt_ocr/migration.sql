ALTER TABLE "stock_receptions"
ADD COLUMN "receiptNumber" TEXT;

CREATE TABLE "supplier_ocr_identifiers" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_ocr_identifiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_ocr_identifiers_organizationId_kind_normalizedValue_key"
ON "supplier_ocr_identifiers"("organizationId", "kind", "normalizedValue");

CREATE INDEX "supplier_ocr_identifiers_organizationId_idx"
ON "supplier_ocr_identifiers"("organizationId");

CREATE INDEX "supplier_ocr_identifiers_supplierId_idx"
ON "supplier_ocr_identifiers"("supplierId");

ALTER TABLE "supplier_ocr_identifiers"
ADD CONSTRAINT "supplier_ocr_identifiers_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_ocr_identifiers"
ADD CONSTRAINT "supplier_ocr_identifiers_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
