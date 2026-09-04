CREATE TYPE "PurchasingEmailProvider" AS ENUM ('RESEND', 'SMTP', 'GOOGLE', 'MICROSOFT');
CREATE TYPE "PurchasingEmailConnectionStatus" AS ENUM ('DISCONNECTED', 'CONFIGURED', 'CONNECTED', 'ERROR');

ALTER TABLE "purchasing_settings"
  ADD COLUMN "activeEmailProvider" "PurchasingEmailProvider",
  ADD COLUMN "emailSubjectTemplate" TEXT,
  ADD COLUMN "emailBodyTemplate" TEXT,
  ADD COLUMN "emailSignature" TEXT;

CREATE TABLE "purchasing_email_connections" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "provider" "PurchasingEmailProvider" NOT NULL,
  "status" "PurchasingEmailConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "senderEmail" TEXT,
  "senderName" TEXT,
  "smtpHost" TEXT,
  "smtpPort" INTEGER,
  "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
  "smtpUsername" TEXT,
  "secretCiphertext" TEXT,
  "oauthRefreshToken" TEXT,
  "oauthAccountId" TEXT,
  "lastTestedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchasing_email_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchasing_email_connections_organizationId_provider_key" ON "purchasing_email_connections"("organizationId", "provider");
CREATE INDEX "purchasing_email_connections_organizationId_status_idx" ON "purchasing_email_connections"("organizationId", "status");
ALTER TABLE "purchasing_email_connections" ADD CONSTRAINT "purchasing_email_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_purchasing_profiles"
  ADD COLUMN "emailSubjectTemplate" TEXT,
  ADD COLUMN "emailBodyTemplate" TEXT,
  ADD COLUMN "emailSignature" TEXT;

ALTER TABLE "purchase_order_dispatches"
  ADD COLUMN "provider" "PurchasingEmailProvider",
  ADD COLUMN "senderEmail" TEXT,
  ADD COLUMN "senderName" TEXT,
  ADD COLUMN "renderedBody" TEXT;
