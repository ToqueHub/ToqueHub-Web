CREATE TYPE "TechnicalSheetYieldMode" AS ENUM ('PORTIONS', 'MASS');

ALTER TABLE "technical_sheets"
  ADD COLUMN "yieldMode" "TechnicalSheetYieldMode" NOT NULL DEFAULT 'PORTIONS';

CREATE INDEX "technical_sheets_yieldMode_idx"
  ON "technical_sheets"("yieldMode");
