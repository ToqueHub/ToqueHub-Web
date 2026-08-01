-- A product remains an organization-wide master record. This table records
-- where it is actually referenced and monitored, even before physical stock exists.
CREATE TABLE "product_sites" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "siteId" UUID NOT NULL,
    "minimumStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_sites_organizationId_productId_siteId_key"
ON "product_sites"("organizationId", "productId", "siteId");

CREATE INDEX "product_sites_organizationId_siteId_isActive_idx"
ON "product_sites"("organizationId", "siteId", "isActive");

CREATE INDEX "product_sites_productId_idx" ON "product_sites"("productId");

ALTER TABLE "product_sites"
ADD CONSTRAINT "product_sites_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_sites"
ADD CONSTRAINT "product_sites_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_sites"
ADD CONSTRAINT "product_sites_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "sites"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing physical stock is authoritative: every product/site pair that has
-- stock becomes an active assignment.
INSERT INTO "product_sites" (
  "id", "organizationId", "productId", "siteId", "minimumStock", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), s."organizationId", s."productId", s."siteId",
  p."minimumStock", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "stocks" s
JOIN "products" p ON p."id" = s."productId"
WHERE s."siteId" IS NOT NULL
GROUP BY s."organizationId", s."productId", s."siteId", p."minimumStock"
ON CONFLICT ("organizationId", "productId", "siteId") DO NOTHING;

-- A single-site organization has no ambiguity, so its active catalogue can be
-- assigned automatically. Multi-site catalogues remain explicitly unassigned
-- until a user chooses their destination.
INSERT INTO "product_sites" (
  "id", "organizationId", "productId", "siteId", "minimumStock", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), p."organizationId", p."id", MIN(s."id"::text)::uuid,
  p."minimumStock", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" p
JOIN "sites" s ON s."organizationId" = p."organizationId" AND s."isArchived" = false
WHERE p."isArchived" = false
GROUP BY p."organizationId", p."id", p."minimumStock"
HAVING COUNT(s."id") = 1
ON CONFLICT ("organizationId", "productId", "siteId") DO NOTHING;
