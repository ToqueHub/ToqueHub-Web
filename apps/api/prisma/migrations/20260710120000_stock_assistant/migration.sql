CREATE TYPE "StockProposalType" AS ENUM ('RECEIPT', 'WASTE', 'TRANSFER', 'INVENTORY_COUNT', 'ADJUSTMENT');
CREATE TYPE "StockProposalStatus" AS ENUM ('NEEDS_REVIEW', 'APPROVED', 'APPLIED', 'REJECTED', 'FAILED');
CREATE TYPE "StockProposalSourceType" AS ENUM ('CHAT', 'INVOICE');
CREATE TYPE "StockProposalLineMatchStatus" AS ENUM ('MATCHED', 'AMBIGUOUS', 'UNMATCHED');
CREATE TYPE "StockAssistantMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

ALTER TABLE "documents" ADD COLUMN "contentSha256" TEXT;
CREATE INDEX "documents_organizationId_contentSha256_idx" ON "documents"("organizationId", "contentSha256");

CREATE TABLE "stock_conversations" ("id" UUID NOT NULL, "organizationId" UUID NOT NULL, "userId" UUID NOT NULL, "locationId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "stock_conversations_pkey" PRIMARY KEY ("id"));
CREATE INDEX "stock_conversations_organizationId_userId_idx" ON "stock_conversations"("organizationId", "userId");
CREATE TABLE "stock_assistant_messages" ("id" UUID NOT NULL, "conversationId" UUID NOT NULL, "role" "StockAssistantMessageRole" NOT NULL, "content" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "stock_assistant_messages_pkey" PRIMARY KEY ("id"));
CREATE INDEX "stock_assistant_messages_conversationId_createdAt_idx" ON "stock_assistant_messages"("conversationId", "createdAt");
CREATE TABLE "stock_proposals" ("id" UUID NOT NULL, "organizationId" UUID NOT NULL, "locationId" UUID, "sourceLocationId" UUID, "destinationLocationId" UUID, "supplierId" UUID, "type" "StockProposalType" NOT NULL, "status" "StockProposalStatus" NOT NULL DEFAULT 'NEEDS_REVIEW', "sourceType" "StockProposalSourceType" NOT NULL, "sourceDocumentId" UUID, "sourceExtractionId" UUID, "conversationId" UUID, "confidence" DECIMAL(5,4), "duplicateWarning" JSONB, "duplicateOverrideReason" TEXT, "metadata" JSONB, "version" INTEGER NOT NULL DEFAULT 1, "createdByUserId" UUID NOT NULL, "appliedAt" TIMESTAMP(3), "appliedByUserId" UUID, "rejectedAt" TIMESTAMP(3), "rejectedByUserId" UUID, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "stock_proposals_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "stock_proposals_organizationId_sourceExtractionId_key" ON "stock_proposals"("organizationId", "sourceExtractionId");
CREATE INDEX "stock_proposals_organizationId_status_idx" ON "stock_proposals"("organizationId", "status");
CREATE TABLE "stock_proposal_lines" ("id" UUID NOT NULL, "proposalId" UUID NOT NULL, "productId" UUID, "rawLabel" TEXT NOT NULL, "supplierSku" TEXT, "quantity" DECIMAL(12,3) NOT NULL, "purchaseUnit" TEXT, "inputUnitId" UUID, "stockQuantity" DECIMAL(12,3), "stockUnit" TEXT, "unitPriceExVat" DECIMAL(12,4), "lotNumber" TEXT, "expiryDate" TIMESTAMP(3), "matchConfidence" DECIMAL(5,4), "matchStatus" "StockProposalLineMatchStatus" NOT NULL DEFAULT 'UNMATCHED', "notes" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "stock_proposal_lines_pkey" PRIMARY KEY ("id"));
CREATE INDEX "stock_proposal_lines_proposalId_idx" ON "stock_proposal_lines"("proposalId");
CREATE TABLE "product_aliases" ("id" UUID NOT NULL, "organizationId" UUID NOT NULL, "supplierId" UUID, "alias" TEXT NOT NULL, "normalizedAlias" TEXT NOT NULL, "supplierSku" TEXT, "productId" UUID NOT NULL, "purchaseUnit" TEXT, "conversionFactor" DECIMAL(18,6), "stockUnit" TEXT, "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "product_aliases_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "product_aliases_organizationId_supplierId_normalizedAlias_key" ON "product_aliases"("organizationId", "supplierId", "normalizedAlias");
CREATE TABLE "stock_proposal_movements" ("id" UUID NOT NULL, "proposalId" UUID NOT NULL, "stockMovementId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "stock_proposal_movements_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "stock_proposal_movements_proposalId_stockMovementId_key" ON "stock_proposal_movements"("proposalId", "stockMovementId");
