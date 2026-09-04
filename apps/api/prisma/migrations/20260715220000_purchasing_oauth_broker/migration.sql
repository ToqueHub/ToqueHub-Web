CREATE TABLE "purchasing_oauth_broker_states" (
  "id" UUID NOT NULL, "provider" "PurchasingEmailProvider" NOT NULL, "stateHash" TEXT NOT NULL, "returnUrl" TEXT NOT NULL, "clientState" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchasing_oauth_broker_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchasing_oauth_broker_states_stateHash_key" ON "purchasing_oauth_broker_states"("stateHash");
CREATE INDEX "purchasing_oauth_broker_states_expiresAt_idx" ON "purchasing_oauth_broker_states"("expiresAt");
CREATE TABLE "purchasing_oauth_broker_grants" (
  "id" UUID NOT NULL, "grantHash" TEXT NOT NULL, "stateId" UUID NOT NULL, "payloadCiphertext" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchasing_oauth_broker_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchasing_oauth_broker_grants_grantHash_key" ON "purchasing_oauth_broker_grants"("grantHash");
CREATE UNIQUE INDEX "purchasing_oauth_broker_grants_stateId_key" ON "purchasing_oauth_broker_grants"("stateId");
CREATE INDEX "purchasing_oauth_broker_grants_expiresAt_idx" ON "purchasing_oauth_broker_grants"("expiresAt");
