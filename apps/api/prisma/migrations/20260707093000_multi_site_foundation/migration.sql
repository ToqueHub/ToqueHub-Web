-- Multi-site organization foundation used by RH and Planning.
ALTER TABLE "organizations"
ADD COLUMN "primarySiteId" UUID;

ALTER TABLE "sites"
ADD COLUMN "address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "responsibleName" TEXT,
ADD COLUMN "responsiblePhone" TEXT,
ADD COLUMN "responsibleEmail" TEXT;

CREATE TABLE "hr_employee_secondary_sites" (
  "employeeId" UUID NOT NULL,
  "siteId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "hr_employee_secondary_sites_pkey" PRIMARY KEY ("employeeId", "siteId"),
  CONSTRAINT "hr_employee_secondary_sites_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hr_employee_secondary_sites_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "hr_employee_secondary_sites_siteId_idx" ON "hr_employee_secondary_sites"("siteId");

INSERT INTO "sites" ("id", "name", "organizationId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), COALESCE(NULLIF("organizations"."mainSiteName", ''), "organizations"."name" || ' — Site principal'), "organizations"."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations"
WHERE NOT EXISTS (
  SELECT 1 FROM "sites"
  WHERE "sites"."organizationId" = "organizations"."id"
);

UPDATE "organizations"
SET "primarySiteId" = (
  SELECT "sites"."id"
  FROM "sites"
  WHERE "sites"."organizationId" = "organizations"."id"
  ORDER BY
    CASE WHEN "sites"."name" = "organizations"."mainSiteName" THEN 0 ELSE 1 END,
    "sites"."createdAt" ASC
  LIMIT 1
)
WHERE "primarySiteId" IS NULL;

CREATE INDEX "organizations_primarySiteId_idx" ON "organizations"("primarySiteId");

ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_primarySiteId_fkey" FOREIGN KEY ("primarySiteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
