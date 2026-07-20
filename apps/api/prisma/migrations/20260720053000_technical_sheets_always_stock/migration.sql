-- Les fiches techniques produisent toujours une sortie suivie dans Stocks.
UPDATE "technical_sheets"
SET "stockPolicy" = 'MAKE_TO_STOCK'
WHERE "stockPolicy" <> 'MAKE_TO_STOCK';

ALTER TABLE "technical_sheets"
ALTER COLUMN "stockPolicy" SET DEFAULT 'MAKE_TO_STOCK';
