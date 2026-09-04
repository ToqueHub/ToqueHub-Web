CREATE TYPE "MenuUsageProfile" AS ENUM ('RESTAURANT_CAFE', 'CATERER', 'CENTRAL_KITCHEN', 'CUSTOM');
CREATE TYPE "MenuKind" AS ENUM ('CATALOG', 'SERVICE', 'EVENT', 'CYCLE');

ALTER TYPE "MenuHistoryAction" ADD VALUE IF NOT EXISTS 'SETTINGS_UPDATED';
ALTER TYPE "MenuHistoryAction" ADD VALUE IF NOT EXISTS 'AVAILABILITY_PLANNED';

CREATE TABLE "menu_settings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "usageProfile" "MenuUsageProfile" NOT NULL DEFAULT 'RESTAURANT_CAFE',
    "catalogEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduledMenusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eventsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cyclesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dietsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "guestForecastsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "targetStockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "menu_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "icon" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menus" ALTER COLUMN "date" DROP NOT NULL;
ALTER TABLE "menus" ADD COLUMN "kind" "MenuKind" NOT NULL DEFAULT 'SERVICE';
ALTER TABLE "menus" ADD COLUMN "activeFrom" TIMESTAMP(3);
ALTER TABLE "menus" ADD COLUMN "activeUntil" TIMESTAMP(3);
ALTER TABLE "menus" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "menu_items" ADD COLUMN "menuCategoryId" UUID;
ALTER TABLE "menu_items" ADD COLUMN "servingQuantity" DECIMAL(12,3) NOT NULL DEFAULT 1;
ALTER TABLE "menu_items" ADD COLUMN "targetReadyQuantity" DECIMAL(12,3);
ALTER TABLE "menu_items" ADD COLUMN "lowStockThreshold" DECIMAL(12,3);
ALTER TABLE "menu_items" ADD COLUMN "availabilityEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "menu_settings_organizationId_key" ON "menu_settings"("organizationId");
CREATE UNIQUE INDEX "menu_categories_organizationId_name_key" ON "menu_categories"("organizationId", "name");
CREATE INDEX "menu_categories_organizationId_position_idx" ON "menu_categories"("organizationId", "position");
CREATE INDEX "menu_categories_isArchived_idx" ON "menu_categories"("isArchived");
CREATE INDEX "menus_kind_idx" ON "menus"("kind");
CREATE INDEX "menus_isPrimary_idx" ON "menus"("isPrimary");
CREATE INDEX "menu_items_menuCategoryId_idx" ON "menu_items"("menuCategoryId");

ALTER TABLE "menu_settings" ADD CONSTRAINT "menu_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menuCategoryId_fkey" FOREIGN KEY ("menuCategoryId") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

