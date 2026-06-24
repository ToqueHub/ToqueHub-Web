-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HrHistoryEventType" ADD VALUE 'CONTRACT_CREATED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'CONTRACT_ENDED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'CONTRACT_DELETED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'COMPENSATION_CREATED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'COMPENSATION_ENDED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'REVIEW_CREATED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'REVIEW_POSTPONED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'REVIEW_COMPLETED';
ALTER TYPE "HrHistoryEventType" ADD VALUE 'ONBOARDING_STEP_COMPLETED';
