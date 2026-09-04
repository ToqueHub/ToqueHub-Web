ALTER TABLE "finance_budget_plans"
  ADD COLUMN "siteId" UUID;

-- Conserve l'établissement déjà choisi lors de l'import du budget.
UPDATE "finance_budget_plans" AS budget
SET "siteId" = source."siteId"
FROM "finance_import_batches" AS batch
JOIN "finance_data_sources" AS source ON source."id" = batch."sourceId"
WHERE budget."importBatchId" = batch."id"
  AND source."siteId" IS NOT NULL;

-- Les anciens budgets globaux suivent d'abord l'établissement principal de l'organisation.
UPDATE "finance_budget_plans" AS budget
SET "siteId" = organization."primarySiteId"
FROM "organizations" AS organization
WHERE budget."organizationId" = organization."id"
  AND budget."siteId" IS NULL
  AND organization."primarySiteId" IS NOT NULL;

-- Dernier recours sûr pour les anciennes installations ne possédant qu'un seul établissement.
UPDATE "finance_budget_plans" AS budget
SET "siteId" = single_site."id"
FROM (
  SELECT MIN(site."id"::text)::uuid AS "id", site."organizationId"
  FROM "sites" AS site
  WHERE site."isArchived" = false
  GROUP BY site."organizationId"
  HAVING COUNT(*) = 1
) AS single_site
WHERE budget."organizationId" = single_site."organizationId"
  AND budget."siteId" IS NULL;

-- Une seule référence active par établissement. Les anciens doublons restent historisés.
WITH ranked_references AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", "siteId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS reference_rank
  FROM "finance_budget_plans"
  WHERE "isReference" = true
    AND "siteId" IS NOT NULL
)
UPDATE "finance_budget_plans" AS budget
SET "isReference" = false
FROM ranked_references
WHERE budget."id" = ranked_references."id"
  AND ranked_references.reference_rank > 1;

CREATE INDEX "finance_budget_plans_organizationId_siteId_isReference_idx"
  ON "finance_budget_plans"("organizationId", "siteId", "isReference");
CREATE INDEX "finance_budget_plans_siteId_idx"
  ON "finance_budget_plans"("siteId");
CREATE UNIQUE INDEX "finance_budget_plans_org_site_reference_key"
  ON "finance_budget_plans"("organizationId", "siteId")
  WHERE "isReference" = true AND "siteId" IS NOT NULL;

ALTER TABLE "finance_budget_plans"
  ADD CONSTRAINT "finance_budget_plans_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
