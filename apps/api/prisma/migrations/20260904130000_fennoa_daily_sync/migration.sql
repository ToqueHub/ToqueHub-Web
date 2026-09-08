ALTER TABLE "finance_settings"
ADD COLUMN "fennoaAutomaticSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "fennoaAutomaticSyncTime" TEXT NOT NULL DEFAULT '03:00',
ADD COLUMN "fennoaAutomaticSyncLastRunAt" TIMESTAMP(3);
