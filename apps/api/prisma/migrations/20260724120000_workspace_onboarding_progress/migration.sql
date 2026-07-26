-- CreateEnum
CREATE TYPE "WorkspaceOnboardingStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DEFERRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkspaceOnboardingStep" AS ENUM ('WELCOME', 'ECOSYSTEM', 'STARTER_BUNDLE', 'INSTALLATION', 'MINI_TOUR');

-- CreateTable
CREATE TABLE "workspace_onboarding_progress" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkspaceOnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" "WorkspaceOnboardingStep" NOT NULL DEFAULT 'WELCOME',
    "startedAt" TIMESTAMP(3),
    "deferredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_onboarding_progress_organizationId_key"
ON "workspace_onboarding_progress"("organizationId");

-- CreateIndex
CREATE INDEX "workspace_onboarding_progress_ownerUserId_idx"
ON "workspace_onboarding_progress"("ownerUserId");

-- AddForeignKey
ALTER TABLE "workspace_onboarding_progress"
ADD CONSTRAINT "workspace_onboarding_progress_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_onboarding_progress"
ADD CONSTRAINT "workspace_onboarding_progress_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
