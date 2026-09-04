ALTER TABLE "operational_tasks"
ADD COLUMN "isTimeScheduled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "operational_tasks_isTimeScheduled_idx"
ON "operational_tasks"("isTimeScheduled");

-- Une campagne représente une recette à organiser, même lorsque le moteur
-- technique l'a répartie en plusieurs lots. On conserve une seule carte
-- "recette complète" par campagne et on archive les doublons historiques.
WITH "ranked_recipe_tasks" AS (
  SELECT
    "task"."id",
    ROW_NUMBER() OVER (
      PARTITION BY "batch"."orderId"
      ORDER BY "batch"."number" ASC, "task"."createdAt" ASC, "task"."id" ASC
    ) AS "taskRank"
  FROM "operational_tasks" AS "task"
  INNER JOIN "production_batches" AS "batch"
    ON "batch"."id" = "task"."productionBatchId"
  WHERE "task"."source" = 'PRODUCTION'
    AND "task"."productionOperationId" IS NULL
    AND "task"."technicalSheetStepId" IS NULL
    AND "task"."status" <> 'CANCELLED'
)
UPDATE "operational_tasks" AS "task"
SET
  "status" = 'CANCELLED',
  "completedAt" = NULL
FROM "ranked_recipe_tasks" AS "ranked"
WHERE "task"."id" = "ranked"."id"
  AND "ranked"."taskRank" > 1;

UPDATE "operational_tasks" AS "task"
SET
  "isTimeScheduled" = false,
  "quantity" = "order"."validatedQuantity"
FROM "production_batches" AS "batch"
INNER JOIN "production_orders" AS "order"
  ON "order"."id" = "batch"."orderId"
WHERE "task"."productionBatchId" = "batch"."id"
  AND "task"."source" = 'PRODUCTION'
  AND "task"."productionOperationId" IS NULL
  AND "task"."technicalSheetStepId" IS NULL
  AND "task"."status" <> 'CANCELLED';
