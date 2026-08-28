ALTER TABLE "products"
ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "products_organizationId_isFavorite_idx"
ON "products"("organizationId", "isFavorite");
