-- CreateEnum
CREATE TYPE "TechnicalSheetMode" AS ENUM ('ASSEMBLY', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "TechnicalSheetStockPolicy" AS ENUM ('MAKE_TO_ORDER', 'MAKE_TO_STOCK');

-- AlterTable
ALTER TABLE "technical_sheets"
ADD COLUMN "mode" "TechnicalSheetMode" NOT NULL DEFAULT 'ASSEMBLY',
ADD COLUMN "stockPolicy" "TechnicalSheetStockPolicy" NOT NULL DEFAULT 'MAKE_TO_ORDER',
ADD COLUMN "outputProductId" UUID,
ADD COLUMN "yieldUnitId" UUID;

-- AlterTable
ALTER TABLE "technical_sheet_ingredients"
ADD COLUMN "section" TEXT,
ADD COLUMN "sourceTechnicalSheetId" UUID;

-- AlterTable
ALTER TABLE "technical_sheet_steps"
ADD COLUMN "section" TEXT;

-- CreateIndex
CREATE INDEX "technical_sheets_outputProductId_idx" ON "technical_sheets"("outputProductId");
CREATE INDEX "technical_sheets_yieldUnitId_idx" ON "technical_sheets"("yieldUnitId");
CREATE INDEX "technical_sheets_mode_idx" ON "technical_sheets"("mode");
CREATE INDEX "technical_sheet_ingredients_sourceTechnicalSheetId_idx" ON "technical_sheet_ingredients"("sourceTechnicalSheetId");

-- AddForeignKey
ALTER TABLE "technical_sheets"
ADD CONSTRAINT "technical_sheets_outputProductId_fkey"
FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "technical_sheets"
ADD CONSTRAINT "technical_sheets_yieldUnitId_fkey"
FOREIGN KEY ("yieldUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "technical_sheet_ingredients"
ADD CONSTRAINT "technical_sheet_ingredients_sourceTechnicalSheetId_fkey"
FOREIGN KEY ("sourceTechnicalSheetId") REFERENCES "technical_sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
