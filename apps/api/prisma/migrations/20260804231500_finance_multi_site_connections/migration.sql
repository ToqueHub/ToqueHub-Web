DROP INDEX IF EXISTS "finance_pos_connections_organizationId_provider_key";

CREATE UNIQUE INDEX "finance_pos_connections_organizationId_provider_defaultSiteId_key"
  ON "finance_pos_connections"("organizationId", "provider", "defaultSiteId");

CREATE TABLE "finance_flatpay_connections" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "defaultSiteId" UUID NOT NULL,
  "portalUrl" TEXT NOT NULL DEFAULT 'https://portal.flatpay.com',
  "username" TEXT NOT NULL,
  "credentialStorage" TEXT NOT NULL,
  "passwordEncrypted" TEXT,
  "passwordMask" TEXT NOT NULL,
  "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "automationInstalledAt" TIMESTAMP(3),
  "automationInbox" TEXT,
  "automationSchedule" TEXT[] NOT NULL DEFAULT ARRAY['07:00', '15:00', '19:00', '23:00']::TEXT[],
  "historyStart" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "finance_flatpay_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_flatpay_connections_organizationId_defaultSiteId_key"
  ON "finance_flatpay_connections"("organizationId", "defaultSiteId");
CREATE INDEX "finance_flatpay_connections_defaultSiteId_idx"
  ON "finance_flatpay_connections"("defaultSiteId");

ALTER TABLE "finance_flatpay_connections"
  ADD CONSTRAINT "finance_flatpay_connections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_flatpay_connections"
  ADD CONSTRAINT "finance_flatpay_connections_defaultSiteId_fkey"
  FOREIGN KEY ("defaultSiteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprend sans perte l'unique connexion FlatPay historique. Le compte du trousseau macOS
-- reste lisible avec l'identifiant de l'organisation pendant la transition.
INSERT INTO "finance_flatpay_connections" (
  "id", "organizationId", "defaultSiteId", "portalUrl", "username",
  "credentialStorage", "passwordEncrypted", "passwordMask", "configuredAt",
  "lastSyncedAt", "lastError", "automationInstalledAt", "automationInbox",
  "automationSchedule", "historyStart", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  settings."organizationId",
  COALESCE(
    organization."primarySiteId",
    (
      SELECT site."id"
      FROM "sites" AS site
      WHERE site."organizationId" = settings."organizationId"
        AND site."isArchived" = false
      ORDER BY site."createdAt" ASC
      LIMIT 1
    )
  ),
  settings."flatpayPortalUrl",
  settings."flatpayUsername",
  settings."flatpayCredentialStorage",
  settings."flatpayPasswordEncrypted",
  COALESCE(settings."flatpayPasswordMask", '••••••••'),
  COALESCE(settings."flatpayConfiguredAt", CURRENT_TIMESTAMP),
  settings."flatpayLastSyncedAt",
  settings."flatpayLastError",
  settings."flatpayAutomationInstalledAt",
  settings."flatpayAutomationInbox",
  settings."flatpayAutomationSchedule",
  settings."flatpayHistoryStart",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "finance_settings" AS settings
JOIN "organizations" AS organization ON organization."id" = settings."organizationId"
WHERE settings."flatpayUsername" IS NOT NULL
  AND settings."flatpayCredentialStorage" IS NOT NULL
  AND COALESCE(
    organization."primarySiteId",
    (
      SELECT site."id"
      FROM "sites" AS site
      WHERE site."organizationId" = settings."organizationId"
        AND site."isArchived" = false
      ORDER BY site."createdAt" ASC
      LIMIT 1
    )
  ) IS NOT NULL
ON CONFLICT ("organizationId", "defaultSiteId") DO NOTHING;
