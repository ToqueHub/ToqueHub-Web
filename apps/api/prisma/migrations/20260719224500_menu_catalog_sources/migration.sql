-- A card is explicitly a food or drinks card.
CREATE TYPE "MenuCatalogType" AS ENUM ('FOOD', 'DRINKS');

ALTER TABLE "menus"
ADD COLUMN "catalogType" "MenuCatalogType";

ALTER TABLE "menu_categories"
ADD COLUMN "catalogType" "MenuCatalogType";

-- A card line can come either from a finished technical sheet or directly
-- from the stock catalogue (wine, water, packaged soft drink, etc.).
ALTER TABLE "menu_items"
ALTER COLUMN "technicalSheetId" DROP NOT NULL,
ADD COLUMN "productId" UUID;

ALTER TABLE "menu_items"
ADD CONSTRAINT "menu_items_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "menu_items"
ADD CONSTRAINT "menu_items_exactly_one_source_check"
CHECK (
  (("technicalSheetId" IS NOT NULL)::INTEGER + ("productId" IS NOT NULL)::INTEGER) = 1
);

CREATE INDEX "menus_catalogType_idx" ON "menus"("catalogType");
CREATE INDEX "menu_categories_catalogType_idx" ON "menu_categories"("catalogType");
CREATE INDEX "menu_items_productId_idx" ON "menu_items"("productId");

-- The café workflow is deliberately limited to dashboard, cards, exports and audit.
UPDATE "menu_settings"
SET "scheduledMenusEnabled" = FALSE,
    "eventsEnabled" = FALSE,
    "cyclesEnabled" = FALSE,
    "dietsEnabled" = FALSE,
    "guestForecastsEnabled" = FALSE
WHERE "usageProfile" = 'RESTAURANT_CAFE';
