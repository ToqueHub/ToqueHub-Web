CREATE TYPE "FinancePosAuthMode" AS ENUM ('PERSONAL_TOKEN', 'ASSERTION_GRANT');

ALTER TABLE "finance_data_sources"
  ADD COLUMN "siteId" UUID,
  ADD COLUMN "externalLocationId" TEXT;

UPDATE "finance_data_sources" AS source
SET "siteId" = COALESCE(
  organization."primarySiteId",
  (
    SELECT site."id"
    FROM "sites" AS site
    WHERE site."organizationId" = source."organizationId"
      AND site."isArchived" = false
    ORDER BY site."createdAt" ASC
    LIMIT 1
  )
)
FROM "organizations" AS organization
WHERE organization."id" = source."organizationId"
  AND source."provider" <> 'FENNOA';

CREATE TABLE "finance_pos_connections" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "defaultSiteId" UUID NOT NULL,
  "provider" "FinanceProvider" NOT NULL,
  "authMode" "FinancePosAuthMode" NOT NULL,
  "clientId" TEXT,
  "secretEncrypted" TEXT NOT NULL,
  "secretMask" TEXT NOT NULL,
  "apiBaseUrl" TEXT NOT NULL,
  "historyStart" TIMESTAMP(3),
  "schedule" TEXT[] NOT NULL DEFAULT ARRAY['07:00', '15:00', '19:00', '23:00']::TEXT[],
  "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "syncCursor" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "finance_pos_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_pos_connections_organizationId_provider_key"
  ON "finance_pos_connections"("organizationId", "provider");
CREATE INDEX "finance_pos_connections_defaultSiteId_idx"
  ON "finance_pos_connections"("defaultSiteId");
CREATE INDEX "finance_data_sources_siteId_idx"
  ON "finance_data_sources"("siteId");

ALTER TABLE "finance_data_sources"
  ADD CONSTRAINT "finance_data_sources_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_pos_connections"
  ADD CONSTRAINT "finance_pos_connections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "finance_pos_connections"
  ADD CONSTRAINT "finance_pos_connections_defaultSiteId_fkey"
  FOREIGN KEY ("defaultSiteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Les organisations déjà équipées de Finance voient immédiatement les deux connecteurs,
-- même si elles n'avaient encore jamais importé de rapport PayPal POS ou Loyverse.
INSERT INTO "finance_data_sources" (
  "id",
  "organizationId",
  "siteId",
  "provider",
  "name",
  "sourceType",
  "status",
  "isPrimarySales",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  organization."id",
  COALESCE(
    organization."primarySiteId",
    (
      SELECT site."id"
      FROM "sites" AS site
      WHERE site."organizationId" = organization."id"
        AND site."isArchived" = false
      ORDER BY site."createdAt" ASC
      LIMIT 1
    )
  ),
  connector.provider::"FinanceProvider",
  connector.name,
  'POS_API'::"FinanceSourceType",
  'NOT_CONNECTED'::"FinanceSourceStatus",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" AS organization
CROSS JOIN (
  VALUES ('LOYVERSE', 'Loyverse'), ('PAYPAL_POS', 'PayPal POS')
) AS connector(provider, name)
WHERE organization."financeInstalledAt" IS NOT NULL
ON CONFLICT ("organizationId", "provider", "name") DO NOTHING;
