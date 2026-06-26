CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "OcrProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OcrExtractionType" AS ENUM ('INVOICE', 'DELIVERY_NOTE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OcrBusinessExtractionStatus" AS ENUM ('DRAFT', 'REVIEWED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StockReceptionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockReceptionLineMatchingStatus" AS ENUM ('RECOGNIZED', 'NEEDS_REVIEW', 'NOT_FOUND');

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "stockReceptionLineId" UUID;

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "uploadedById" UUID,
    "internalFilename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" UUID,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "OcrProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "rawText" TEXT,
    "rawMarkdown" TEXT,
    "rawJson" JSONB,
    "pageCount" INTEGER,
    "processingDurationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_business_extractions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ocrDocumentId" UUID NOT NULL,
    "type" "OcrExtractionType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "OcrBusinessExtractionStatus" NOT NULL DEFAULT 'DRAFT',
    "extractedJson" JSONB NOT NULL,
    "correctedJson" JSONB,
    "confidenceScore" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocr_business_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID,
    "supplierName" TEXT,
    "documentId" UUID,
    "extractionId" UUID,
    "invoiceNumber" TEXT,
    "deliveryNoteNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "documentDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "totalExcludingTax" DECIMAL(12,4),
    "totalTax" DECIMAL(12,4),
    "totalIncludingTax" DECIMAL(12,4),
    "status" "StockReceptionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID,
    "siteId" UUID,
    "locationId" UUID,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reception_lines" (
    "id" UUID NOT NULL,
    "receptionId" UUID NOT NULL,
    "productId" UUID,
    "ocrLabel" TEXT NOT NULL,
    "reference" TEXT,
    "quantity" DECIMAL(12,3),
    "unit" TEXT,
    "unitId" UUID,
    "unitPrice" DECIMAL(12,4),
    "lineTotal" DECIMAL(12,4),
    "vatRate" DECIMAL(5,2),
    "lotNumber" TEXT,
    "bestBeforeDate" TIMESTAMP(3),
    "matchingStatus" "StockReceptionLineMatchingStatus" NOT NULL DEFAULT 'NOT_FOUND',
    "matchingScore" DECIMAL(5,4),
    "userCorrection" JSONB,
    "lotId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_reception_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_organizationId_idx" ON "documents"("organizationId");
CREATE INDEX "documents_uploadedById_idx" ON "documents"("uploadedById");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "documents_sourceModule_sourceType_sourceId_idx" ON "documents"("sourceModule", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_documents_documentId_key" ON "ocr_documents"("documentId");
CREATE INDEX "ocr_documents_organizationId_idx" ON "ocr_documents"("organizationId");
CREATE INDEX "ocr_documents_documentId_idx" ON "ocr_documents"("documentId");
CREATE INDEX "ocr_documents_status_idx" ON "ocr_documents"("status");

-- CreateIndex
CREATE INDEX "ocr_business_extractions_organizationId_idx" ON "ocr_business_extractions"("organizationId");
CREATE INDEX "ocr_business_extractions_ocrDocumentId_idx" ON "ocr_business_extractions"("ocrDocumentId");
CREATE INDEX "ocr_business_extractions_status_idx" ON "ocr_business_extractions"("status");

-- CreateIndex
CREATE INDEX "stock_receptions_organizationId_idx" ON "stock_receptions"("organizationId");
CREATE INDEX "stock_receptions_supplierId_idx" ON "stock_receptions"("supplierId");
CREATE INDEX "stock_receptions_documentId_idx" ON "stock_receptions"("documentId");
CREATE INDEX "stock_receptions_extractionId_idx" ON "stock_receptions"("extractionId");
CREATE INDEX "stock_receptions_status_idx" ON "stock_receptions"("status");

-- CreateIndex
CREATE INDEX "stock_reception_lines_receptionId_idx" ON "stock_reception_lines"("receptionId");
CREATE INDEX "stock_reception_lines_productId_idx" ON "stock_reception_lines"("productId");
CREATE INDEX "stock_reception_lines_unitId_idx" ON "stock_reception_lines"("unitId");
CREATE INDEX "stock_reception_lines_lotId_idx" ON "stock_reception_lines"("lotId");
CREATE INDEX "stock_movements_stockReceptionLineId_idx" ON "stock_movements"("stockReceptionLineId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ocr_documents" ADD CONSTRAINT "ocr_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ocr_business_extractions" ADD CONSTRAINT "ocr_business_extractions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ocr_business_extractions" ADD CONSTRAINT "ocr_business_extractions_ocrDocumentId_fkey" FOREIGN KEY ("ocrDocumentId") REFERENCES "ocr_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "ocr_business_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receptions" ADD CONSTRAINT "stock_receptions_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_reception_lines" ADD CONSTRAINT "stock_reception_lines_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "stock_receptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_reception_lines" ADD CONSTRAINT "stock_reception_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_reception_lines" ADD CONSTRAINT "stock_reception_lines_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_reception_lines" ADD CONSTRAINT "stock_reception_lines_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockReceptionLineId_fkey" FOREIGN KEY ("stockReceptionLineId") REFERENCES "stock_reception_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed permissions
INSERT INTO "permissions" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'stocks.receptions.create', 'Créer des réceptions Stocks'),
  (gen_random_uuid(), 'stocks.ocr.import', 'Importer des documents OCR Stocks'),
  (gen_random_uuid(), 'stocks.ocr.validate', 'Valider les extractions OCR Stocks')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Administrateur', 'Manager', 'Chef', 'Second', 'Magasinier')
  AND p."key" IN ('stocks.receptions.create', 'stocks.ocr.import', 'stocks.ocr.validate')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
