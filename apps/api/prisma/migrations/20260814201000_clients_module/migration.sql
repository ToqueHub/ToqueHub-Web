ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MODULE_CLIENTS_INSTALLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'MODULE_CLIENTS_UNINSTALLED';

ALTER TABLE "organizations"
  ADD COLUMN "clientsInstalledAt" TIMESTAMP(3);

UPDATE "organizations"
SET "clientsInstalledAt" = "menusInstalledAt"
WHERE "menusInstalledAt" IS NOT NULL;
