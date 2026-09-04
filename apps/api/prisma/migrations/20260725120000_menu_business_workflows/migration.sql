CREATE TYPE "MenuActivity" AS ENUM ('RESTAURANT_CAFE', 'CATERER', 'CENTRAL_KITCHEN');
CREATE TYPE "CatererEventStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CatererFulfillmentMode" AS ENUM ('DELIVERY', 'PICKUP', 'ON_SITE');
CREATE TYPE "MenuDispatchStatus" AS ENUM ('PLANNED', 'PREPARED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

ALTER TABLE "menus"
  ADD COLUMN "activity" "MenuActivity" NOT NULL DEFAULT 'RESTAURANT_CAFE',
  ADD COLUMN "needsActivityReview" BOOLEAN NOT NULL DEFAULT false;

UPDATE "menus" AS m
SET "activity" = CASE
  WHEN ms."usageProfile" = 'CATERER' THEN 'CATERER'::"MenuActivity"
  WHEN ms."usageProfile" = 'CENTRAL_KITCHEN' THEN 'CENTRAL_KITCHEN'::"MenuActivity"
  WHEN ms."usageProfile" = 'CUSTOM' AND (m."kind" = 'EVENT') THEN 'CATERER'::"MenuActivity"
  WHEN ms."usageProfile" = 'CUSTOM' AND (m."cycleId" IS NOT NULL OR m."kind" = 'CYCLE') THEN 'CENTRAL_KITCHEN'::"MenuActivity"
  ELSE 'RESTAURANT_CAFE'::"MenuActivity"
END,
"needsActivityReview" = (ms."usageProfile" = 'CUSTOM' AND m."kind" = 'SERVICE' AND m."cycleId" IS NULL)
FROM "menu_settings" AS ms
WHERE ms."organizationId" = m."organizationId";

CREATE TABLE "caterer_clients" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "caterer_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "caterer_event_sequences" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "caterer_event_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "caterer_events" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientId" UUID,
  "clientSnapshot" JSONB,
  "productionSiteId" UUID,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "venueName" TEXT,
  "address" TEXT,
  "accessNotes" TEXT,
  "fulfillmentMode" "CatererFulfillmentMode" NOT NULL,
  "status" "CatererEventStatus" NOT NULL DEFAULT 'DRAFT',
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "caterer_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "caterer_prestations" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "menuId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "service" "MenuServiceType" NOT NULL,
  "readyAt" TIMESTAMP(3),
  "handoffAt" TIMESTAMP(3),
  "serviceAt" TIMESTAMP(3),
  "expectedGuests" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "caterer_prestations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_dispatches" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "menuId" UUID NOT NULL,
  "destinationSiteId" UUID NOT NULL,
  "departureAt" TIMESTAMP(3),
  "deliveryAt" TIMESTAMP(3),
  "status" "MenuDispatchStatus" NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_cycle_forecasts" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "cycleId" UUID NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "service" "MenuServiceType" NOT NULL,
  "destinationSiteId" UUID NOT NULL,
  "guestGroupId" UUID NOT NULL,
  "dietId" UUID,
  "count" INTEGER NOT NULL,
  "departureTime" TEXT,
  "deliveryTime" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_cycle_forecasts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menu_guest_forecasts"
  ADD COLUMN "destinationSiteId" UUID,
  ADD COLUMN "dispatchId" UUID;

ALTER TABLE "menu_items" ADD COLUMN "dietId" UUID;
ALTER TABLE "menu_cycle_items" ADD COLUMN "dietId" UUID;

CREATE UNIQUE INDEX "caterer_clients_organizationId_name_key" ON "caterer_clients"("organizationId", "name");
CREATE UNIQUE INDEX "caterer_event_sequences_organizationId_year_key" ON "caterer_event_sequences"("organizationId", "year");
CREATE UNIQUE INDEX "caterer_events_organizationId_reference_key" ON "caterer_events"("organizationId", "reference");
CREATE UNIQUE INDEX "caterer_prestations_menuId_key" ON "caterer_prestations"("menuId");
CREATE UNIQUE INDEX "menu_dispatches_menuId_destinationSiteId_key" ON "menu_dispatches"("menuId", "destinationSiteId");

CREATE INDEX "menus_activity_idx" ON "menus"("activity");
CREATE INDEX "menus_needsActivityReview_idx" ON "menus"("needsActivityReview");
CREATE INDEX "caterer_clients_organizationId_idx" ON "caterer_clients"("organizationId");
CREATE INDEX "caterer_clients_isArchived_idx" ON "caterer_clients"("isArchived");
CREATE INDEX "caterer_event_sequences_organizationId_idx" ON "caterer_event_sequences"("organizationId");
CREATE INDEX "caterer_events_organizationId_idx" ON "caterer_events"("organizationId");
CREATE INDEX "caterer_events_clientId_idx" ON "caterer_events"("clientId");
CREATE INDEX "caterer_events_productionSiteId_idx" ON "caterer_events"("productionSiteId");
CREATE INDEX "caterer_events_startsAt_idx" ON "caterer_events"("startsAt");
CREATE INDEX "caterer_events_status_idx" ON "caterer_events"("status");
CREATE INDEX "caterer_prestations_organizationId_idx" ON "caterer_prestations"("organizationId");
CREATE INDEX "caterer_prestations_eventId_idx" ON "caterer_prestations"("eventId");
CREATE INDEX "caterer_prestations_serviceAt_idx" ON "caterer_prestations"("serviceAt");
CREATE INDEX "menu_dispatches_organizationId_idx" ON "menu_dispatches"("organizationId");
CREATE INDEX "menu_dispatches_destinationSiteId_idx" ON "menu_dispatches"("destinationSiteId");
CREATE INDEX "menu_dispatches_status_idx" ON "menu_dispatches"("status");
CREATE INDEX "menu_cycle_forecasts_organizationId_idx" ON "menu_cycle_forecasts"("organizationId");
CREATE INDEX "menu_cycle_forecasts_cycleId_idx" ON "menu_cycle_forecasts"("cycleId");
CREATE INDEX "menu_cycle_forecasts_destinationSiteId_idx" ON "menu_cycle_forecasts"("destinationSiteId");
CREATE INDEX "menu_cycle_forecasts_guestGroupId_idx" ON "menu_cycle_forecasts"("guestGroupId");
CREATE INDEX "menu_cycle_forecasts_dietId_idx" ON "menu_cycle_forecasts"("dietId");
CREATE INDEX "menu_cycle_forecasts_weekNumber_dayOfWeek_service_idx" ON "menu_cycle_forecasts"("weekNumber", "dayOfWeek", "service");
CREATE INDEX "menu_guest_forecasts_destinationSiteId_idx" ON "menu_guest_forecasts"("destinationSiteId");
CREATE INDEX "menu_guest_forecasts_dispatchId_idx" ON "menu_guest_forecasts"("dispatchId");
CREATE INDEX "menu_items_dietId_idx" ON "menu_items"("dietId");
CREATE INDEX "menu_cycle_items_dietId_idx" ON "menu_cycle_items"("dietId");

ALTER TABLE "caterer_clients" ADD CONSTRAINT "caterer_clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caterer_event_sequences" ADD CONSTRAINT "caterer_event_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caterer_events" ADD CONSTRAINT "caterer_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caterer_events" ADD CONSTRAINT "caterer_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "caterer_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "caterer_events" ADD CONSTRAINT "caterer_events_productionSiteId_fkey" FOREIGN KEY ("productionSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "caterer_prestations" ADD CONSTRAINT "caterer_prestations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caterer_prestations" ADD CONSTRAINT "caterer_prestations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "caterer_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caterer_prestations" ADD CONSTRAINT "caterer_prestations_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_dispatches" ADD CONSTRAINT "menu_dispatches_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_dispatches" ADD CONSTRAINT "menu_dispatches_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_dispatches" ADD CONSTRAINT "menu_dispatches_destinationSiteId_fkey" FOREIGN KEY ("destinationSiteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_cycle_forecasts" ADD CONSTRAINT "menu_cycle_forecasts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_cycle_forecasts" ADD CONSTRAINT "menu_cycle_forecasts_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "menu_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_cycle_forecasts" ADD CONSTRAINT "menu_cycle_forecasts_destinationSiteId_fkey" FOREIGN KEY ("destinationSiteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_cycle_forecasts" ADD CONSTRAINT "menu_cycle_forecasts_guestGroupId_fkey" FOREIGN KEY ("guestGroupId") REFERENCES "menu_guest_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_cycle_forecasts" ADD CONSTRAINT "menu_cycle_forecasts_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "menu_diets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menu_guest_forecasts" ADD CONSTRAINT "menu_guest_forecasts_destinationSiteId_fkey" FOREIGN KEY ("destinationSiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menu_guest_forecasts" ADD CONSTRAINT "menu_guest_forecasts_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "menu_dispatches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "menu_diets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menu_cycle_items" ADD CONSTRAINT "menu_cycle_items_dietId_fkey" FOREIGN KEY ("dietId") REFERENCES "menu_diets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve legacy caterer menus by creating one imported event/prestation per dated menu.
INSERT INTO "caterer_events" (
  "id", "organizationId", "reference", "name", "productionSiteId", "startsAt", "endsAt",
  "fulfillmentMode", "status", "needsReview", "notes", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), m."organizationId", 'LEGACY-' || m."id"::text, m."name", m."siteId", m."date", m."date",
  'PICKUP'::"CatererFulfillmentMode",
  CASE WHEN m."status" IN ('VALIDATED', 'PUBLISHED') THEN 'CONFIRMED'::"CatererEventStatus"
       WHEN m."status" = 'ARCHIVED' THEN 'COMPLETED'::"CatererEventStatus"
       ELSE 'DRAFT'::"CatererEventStatus" END,
  true, 'Événement importé depuis l’ancien parcours Menus.', m."createdAt", m."updatedAt"
FROM "menus" m
WHERE m."activity" = 'CATERER' AND m."kind" <> 'CATALOG' AND m."date" IS NOT NULL;

INSERT INTO "caterer_prestations" (
  "id", "organizationId", "eventId", "menuId", "name", "service", "readyAt", "handoffAt",
  "serviceAt", "expectedGuests", "position", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), m."organizationId", e."id", m."id", m."name", m."service", m."date", m."date",
  m."date", m."expectedGuests", 0, m."createdAt", m."updatedAt"
FROM "menus" m
JOIN "caterer_events" e ON e."reference" = 'LEGACY-' || m."id"::text AND e."organizationId" = m."organizationId"
WHERE m."activity" = 'CATERER' AND m."kind" <> 'CATALOG' AND m."date" IS NOT NULL;
