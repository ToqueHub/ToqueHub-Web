CREATE TYPE "BackupCloudProvider" AS ENUM ('GOOGLE_DRIVE');

CREATE TYPE "BackupCloudConnectionStatus" AS ENUM ('DISCONNECTED', 'CONFIGURED', 'CONNECTED', 'ERROR');

CREATE TABLE "backup_cloud_connections" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "provider" "BackupCloudProvider" NOT NULL,
  "status" "BackupCloudConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "clientId" TEXT,
  "clientSecretCiphertext" TEXT,
  "redirectUri" TEXT,
  "refreshTokenCiphertext" TEXT,
  "accountEmail" TEXT,
  "driveFolderId" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "lastTestAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backup_cloud_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backup_cloud_objects" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "connectionId" UUID,
  "provider" "BackupCloudProvider" NOT NULL,
  "backupId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "remoteFileId" TEXT,
  "sizeBytes" BIGINT,
  "checksumSha256" TEXT,
  "syncedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "backup_cloud_objects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "backup_cloud_oauth_states" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "provider" "BackupCloudProvider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backup_cloud_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backup_cloud_connections_organizationId_provider_key" ON "backup_cloud_connections"("organizationId", "provider");
CREATE INDEX "backup_cloud_connections_organizationId_idx" ON "backup_cloud_connections"("organizationId");
CREATE INDEX "backup_cloud_connections_provider_idx" ON "backup_cloud_connections"("provider");
CREATE INDEX "backup_cloud_connections_status_idx" ON "backup_cloud_connections"("status");

CREATE UNIQUE INDEX "backup_cloud_objects_provider_remoteFileId_key" ON "backup_cloud_objects"("provider", "remoteFileId");
CREATE INDEX "backup_cloud_objects_organizationId_idx" ON "backup_cloud_objects"("organizationId");
CREATE INDEX "backup_cloud_objects_connectionId_idx" ON "backup_cloud_objects"("connectionId");
CREATE INDEX "backup_cloud_objects_provider_idx" ON "backup_cloud_objects"("provider");
CREATE INDEX "backup_cloud_objects_backupId_idx" ON "backup_cloud_objects"("backupId");
CREATE INDEX "backup_cloud_objects_syncedAt_idx" ON "backup_cloud_objects"("syncedAt");
CREATE INDEX "backup_cloud_objects_deletedAt_idx" ON "backup_cloud_objects"("deletedAt");

CREATE UNIQUE INDEX "backup_cloud_oauth_states_stateHash_key" ON "backup_cloud_oauth_states"("stateHash");
CREATE INDEX "backup_cloud_oauth_states_organizationId_idx" ON "backup_cloud_oauth_states"("organizationId");
CREATE INDEX "backup_cloud_oauth_states_userId_idx" ON "backup_cloud_oauth_states"("userId");
CREATE INDEX "backup_cloud_oauth_states_provider_idx" ON "backup_cloud_oauth_states"("provider");
CREATE INDEX "backup_cloud_oauth_states_expiresAt_idx" ON "backup_cloud_oauth_states"("expiresAt");

ALTER TABLE "backup_cloud_connections"
  ADD CONSTRAINT "backup_cloud_connections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "backup_cloud_objects"
  ADD CONSTRAINT "backup_cloud_objects_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "backup_cloud_objects"
  ADD CONSTRAINT "backup_cloud_objects_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "backup_cloud_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "backup_cloud_oauth_states"
  ADD CONSTRAINT "backup_cloud_oauth_states_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "backup_cloud_oauth_states"
  ADD CONSTRAINT "backup_cloud_oauth_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
