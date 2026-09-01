-- A financing agreement is shared by every machine covered by the same
-- contract.  The legacy per-equipment fields remain available for backward
-- compatibility and are intentionally not removed by this additive migration.
CREATE TABLE "equipment_financing_contracts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID,
    "acquisitionMode" "EquipmentAcquisitionMode" NOT NULL,
    "contractNumber" TEXT,
    "financingProvider" TEXT,
    "termMonths" INTEGER,
    "installmentAmount" DECIMAL(14,2),
    "paymentFrequency" TEXT,
    "monthlyPayment" DECIMAL(14,2),
    "financingStart" TIMESTAMP(3),
    "financingEnd" TIMESTAMP(3),
    "financedAmount" DECIMAL(14,2),
    "buyoutValue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "source" TEXT NOT NULL DEFAULT 'TOQUEHUB',
    "sourceConfidence" DECIMAL(5,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_financing_contracts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "equipment_profiles" ADD COLUMN "financingContractId" UUID;
ALTER TABLE "documents" ADD COLUMN "equipmentFinancingContractId" UUID;

CREATE INDEX "equipment_financing_contracts_organizationId_acquisitionMode_idx"
  ON "equipment_financing_contracts"("organizationId", "acquisitionMode");
CREATE INDEX "equipment_financing_contracts_organizationId_financingEnd_idx"
  ON "equipment_financing_contracts"("organizationId", "financingEnd");
CREATE INDEX "equipment_financing_contracts_organizationId_financingProvider_idx"
  ON "equipment_financing_contracts"("organizationId", "financingProvider");
CREATE INDEX "equipment_financing_contracts_supplierId_idx"
  ON "equipment_financing_contracts"("supplierId");
CREATE INDEX "equipment_profiles_financingContractId_idx"
  ON "equipment_profiles"("financingContractId");
CREATE INDEX "documents_equipmentFinancingContractId_idx"
  ON "documents"("equipmentFinancingContractId");

ALTER TABLE "equipment_financing_contracts"
  ADD CONSTRAINT "equipment_financing_contracts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipment_financing_contracts"
  ADD CONSTRAINT "equipment_financing_contracts_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "equipment_profiles"
  ADD CONSTRAINT "equipment_profiles_financingContractId_fkey"
  FOREIGN KEY ("financingContractId") REFERENCES "equipment_financing_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_equipmentFinancingContractId_fkey"
  FOREIGN KEY ("equipmentFinancingContractId") REFERENCES "equipment_financing_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
