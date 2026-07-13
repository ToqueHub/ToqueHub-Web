CREATE TYPE "TechnicalSheetAssistantMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "TechnicalSheetAssistantDraftStatus" AS ENUM ('PENDING_REVIEW', 'APPLIED', 'DISCARDED', 'EXPIRED');

CREATE TABLE "technical_sheet_assistant_conversations" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "state" JSONB,
  "summary" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technical_sheet_assistant_conversations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "technical_sheet_assistant_messages" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "role" "TechnicalSheetAssistantMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "technical_sheet_assistant_messages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "technical_sheet_assistant_drafts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "targetTechnicalSheetId" UUID,
  "status" "TechnicalSheetAssistantDraftStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "payload" JSONB NOT NULL,
  "metadata" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technical_sheet_assistant_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "technical_sheet_assistant_conversations_organizationId_userId_idx" ON "technical_sheet_assistant_conversations"("organizationId", "userId");
CREATE INDEX "technical_sheet_assistant_conversations_expiresAt_idx" ON "technical_sheet_assistant_conversations"("expiresAt");
CREATE INDEX "technical_sheet_assistant_messages_conversationId_createdAt_idx" ON "technical_sheet_assistant_messages"("conversationId", "createdAt");
CREATE INDEX "technical_sheet_assistant_drafts_organizationId_status_idx" ON "technical_sheet_assistant_drafts"("organizationId", "status");
CREATE INDEX "technical_sheet_assistant_drafts_conversationId_idx" ON "technical_sheet_assistant_drafts"("conversationId");
CREATE INDEX "technical_sheet_assistant_drafts_expiresAt_idx" ON "technical_sheet_assistant_drafts"("expiresAt");
ALTER TABLE "technical_sheet_assistant_messages" ADD CONSTRAINT "technical_sheet_assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "technical_sheet_assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_sheet_assistant_drafts" ADD CONSTRAINT "technical_sheet_assistant_drafts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "technical_sheet_assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
