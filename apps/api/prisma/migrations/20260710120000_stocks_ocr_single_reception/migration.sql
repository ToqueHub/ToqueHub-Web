-- Preserve historical receptions while reserving each extraction for a single validated reception.
-- Older duplicate links remain valid receptions but are detached from the extraction link.
WITH ranked_receptions AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "extractionId" ORDER BY "createdAt", id) AS position
  FROM "stock_receptions"
  WHERE "extractionId" IS NOT NULL
)
UPDATE "stock_receptions" AS reception
SET "extractionId" = NULL
FROM ranked_receptions
WHERE reception.id = ranked_receptions.id AND ranked_receptions.position > 1;

-- An OCR extraction represents a single supplier document and may only validate one reception.
CREATE UNIQUE INDEX "stock_receptions_extractionId_key" ON "stock_receptions"("extractionId");
