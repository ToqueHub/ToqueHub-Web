-- Persist first-start organization profile and modular Stocks installation state.
ALTER TABLE "organizations" ADD COLUMN "establishmentType" TEXT;
ALTER TABLE "organizations" ADD COLUMN "teamSize" TEXT;
ALTER TABLE "organizations" ADD COLUMN "logoDataUrl" TEXT;
ALTER TABLE "organizations" ADD COLUMN "mainSiteName" TEXT;
ALTER TABLE "organizations" ADD COLUMN "stocksInstalledAt" TIMESTAMP(3);
