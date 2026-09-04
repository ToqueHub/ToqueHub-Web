CREATE TYPE "HumanSupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');
CREATE TYPE "HumanSupportMessageAuthor" AS ENUM ('USER', 'VOLUNTEER', 'SYSTEM');
CREATE TYPE "HumanSupportDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "human_support_tickets" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "relayTicketId" TEXT,
  "status" "HumanSupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "contactEmail" TEXT NOT NULL,
  "contactPhone" TEXT,
  "transcript" TEXT NOT NULL,
  "assignedVolunteer" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "lastReadAt" TIMESTAMP(3),
  "relayError" TEXT,
  "relayCursor" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "human_support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "human_support_messages" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "author" "HumanSupportMessageAuthor" NOT NULL,
  "content" TEXT NOT NULL,
  "volunteerName" TEXT,
  "relayMessageId" TEXT,
  "deliveryStatus" "HumanSupportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "deliveryError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "human_support_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "human_support_attachments" (
  "id" UUID NOT NULL,
  "messageId" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "relayFileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "human_support_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "human_support_tickets_relayTicketId_key" ON "human_support_tickets"("relayTicketId");
CREATE INDEX "human_support_tickets_organizationId_userId_status_idx" ON "human_support_tickets"("organizationId", "userId", "status");
CREATE INDEX "human_support_tickets_closedAt_idx" ON "human_support_tickets"("closedAt");
CREATE INDEX "human_support_tickets_expiresAt_idx" ON "human_support_tickets"("expiresAt");
CREATE UNIQUE INDEX "human_support_messages_relayMessageId_key" ON "human_support_messages"("relayMessageId");
CREATE INDEX "human_support_messages_ticketId_createdAt_idx" ON "human_support_messages"("ticketId", "createdAt");
CREATE INDEX "human_support_attachments_messageId_idx" ON "human_support_attachments"("messageId");

ALTER TABLE "human_support_tickets" ADD CONSTRAINT "human_support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "human_support_tickets" ADD CONSTRAINT "human_support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "human_support_messages" ADD CONSTRAINT "human_support_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "human_support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "human_support_attachments" ADD CONSTRAINT "human_support_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "human_support_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_relay_installations" (
  "id" UUID NOT NULL, "instanceId" TEXT NOT NULL, "secret" TEXT NOT NULL, "blockedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_relay_installations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "support_relay_tickets" (
  "id" UUID NOT NULL, "installationId" UUID NOT NULL, "localTicketId" TEXT NOT NULL, "telegramTopicId" TEXT, "status" TEXT NOT NULL DEFAULT 'OPEN', "assignedTelegramId" TEXT, "assignedVolunteer" TEXT, "payload" JSONB NOT NULL, "closedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_relay_tickets_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "support_relay_messages" (
  "id" UUID NOT NULL, "ticketId" UUID NOT NULL, "localMessageId" TEXT, "telegramMessageId" TEXT, "author" TEXT NOT NULL, "content" TEXT NOT NULL, "payload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_relay_messages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "support_relay_events" (
  "id" UUID NOT NULL, "ticketId" UUID NOT NULL, "eventKey" TEXT NOT NULL, "payload" JSONB NOT NULL, "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_relay_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "support_relay_nonces" (
  "id" UUID NOT NULL, "installationId" UUID NOT NULL, "nonce" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_relay_nonces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "support_relay_installations_instanceId_key" ON "support_relay_installations"("instanceId");
CREATE UNIQUE INDEX "support_relay_tickets_installationId_localTicketId_key" ON "support_relay_tickets"("installationId", "localTicketId");
CREATE INDEX "support_relay_tickets_telegramTopicId_idx" ON "support_relay_tickets"("telegramTopicId");
CREATE INDEX "support_relay_tickets_expiresAt_idx" ON "support_relay_tickets"("expiresAt");
CREATE UNIQUE INDEX "support_relay_messages_ticketId_localMessageId_key" ON "support_relay_messages"("ticketId", "localMessageId");
CREATE UNIQUE INDEX "support_relay_messages_ticketId_telegramMessageId_key" ON "support_relay_messages"("ticketId", "telegramMessageId");
CREATE UNIQUE INDEX "support_relay_events_eventKey_key" ON "support_relay_events"("eventKey");
CREATE INDEX "support_relay_events_ticketId_deliveredAt_idx" ON "support_relay_events"("ticketId", "deliveredAt");
CREATE UNIQUE INDEX "support_relay_nonces_installationId_nonce_key" ON "support_relay_nonces"("installationId", "nonce");
CREATE INDEX "support_relay_nonces_expiresAt_idx" ON "support_relay_nonces"("expiresAt");
ALTER TABLE "support_relay_tickets" ADD CONSTRAINT "support_relay_tickets_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "support_relay_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_relay_messages" ADD CONSTRAINT "support_relay_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_relay_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_relay_events" ADD CONSTRAINT "support_relay_events_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_relay_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_relay_nonces" ADD CONSTRAINT "support_relay_nonces_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "support_relay_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
