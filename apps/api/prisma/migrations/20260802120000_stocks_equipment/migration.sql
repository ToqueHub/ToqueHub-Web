ALTER TYPE "ProductKind" ADD VALUE IF NOT EXISTS 'EQUIPMENT';

CREATE TYPE "EquipmentAcquisitionMode" AS ENUM ('CASH', 'CREDIT', 'LEASING', 'RENTAL');
CREATE TYPE "EquipmentCondition" AS ENUM ('IN_SERVICE', 'TO_MONITOR', 'OUT_OF_SERVICE');

CREATE TABLE "equipment_profiles" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "purchaseUrl" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "warrantyEndsAt" TIMESTAMP(3),
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'IN_SERVICE',
    "targetQuantity" DECIMAL(12,3),
    "acquisitionMode" "EquipmentAcquisitionMode" NOT NULL DEFAULT 'CASH',
    "financingProvider" TEXT,
    "financingStart" TIMESTAMP(3),
    "financingEnd" TIMESTAMP(3),
    "monthlyPayment" DECIMAL(14,2),
    "financedAmount" DECIMAL(14,2),
    "buyoutValue" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "equipment_profiles_productId_key" ON "equipment_profiles"("productId");
CREATE INDEX "equipment_profiles_organizationId_idx" ON "equipment_profiles"("organizationId");
CREATE INDEX "equipment_profiles_acquisitionMode_idx" ON "equipment_profiles"("acquisitionMode");
CREATE INDEX "equipment_profiles_financingEnd_idx" ON "equipment_profiles"("financingEnd");
CREATE INDEX "equipment_profiles_condition_idx" ON "equipment_profiles"("condition");

ALTER TABLE "equipment_profiles"
  ADD CONSTRAINT "equipment_profiles_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipment_profiles"
  ADD CONSTRAINT "equipment_profiles_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
