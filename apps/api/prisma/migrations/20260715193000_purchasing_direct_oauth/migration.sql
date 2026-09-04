CREATE TABLE "purchasing_email_oauth_states" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "PurchasingEmailProvider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchasing_email_oauth_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "purchasing_email_oauth_states_stateHash_key" ON "purchasing_email_oauth_states"("stateHash");
CREATE INDEX "purchasing_email_oauth_states_organizationId_idx" ON "purchasing_email_oauth_states"("organizationId");
CREATE INDEX "purchasing_email_oauth_states_userId_idx" ON "purchasing_email_oauth_states"("userId");
CREATE INDEX "purchasing_email_oauth_states_expiresAt_idx" ON "purchasing_email_oauth_states"("expiresAt");
ALTER TABLE "purchasing_email_oauth_states" ADD CONSTRAINT "purchasing_email_oauth_states_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchasing_email_oauth_states" ADD CONSTRAINT "purchasing_email_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
