ALTER TABLE "categories"
ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'UNSPECIFIED';

DROP INDEX IF EXISTS "categories_organizationId_name_key";

CREATE UNIQUE INDEX "categories_organizationId_name_kind_key"
ON "categories"("organizationId", "name", "kind");

CREATE INDEX "categories_organizationId_kind_idx"
ON "categories"("organizationId", "kind");
