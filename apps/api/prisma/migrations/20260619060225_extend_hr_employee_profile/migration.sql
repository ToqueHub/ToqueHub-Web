-- CreateEnum
CREATE TYPE "HrOnboardingStatus" AS ENUM ('NOT_STARTED', 'SERVICES_IN_PROGRESS', 'SERVICES_COMPLETED', 'POSITIONS_IN_PROGRESS', 'POSITIONS_COMPLETED', 'EMPLOYEES_UNLOCKED', 'FIRST_EMPLOYEE_CREATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HrContractStatus" AS ENUM ('DRAFT', 'UPCOMING', 'ACTIVE', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HrSalaryReviewStatus" AS ENUM ('UPCOMING', 'DUE_SOON', 'DUE', 'COMPLETED', 'POSTPONED', 'IGNORED');

-- CreateEnum
CREATE TYPE "HrDocumentCategory" AS ENUM ('IDENTITY', 'CONTRACT', 'AMENDMENT', 'RESIDENCE_PERMIT', 'WORK_PERMIT', 'SICK_LEAVE', 'MEDICAL_CERTIFICATE', 'CERTIFICATION', 'DIPLOMA', 'ADMINISTRATIVE', 'OTHER');

-- AlterTable
ALTER TABLE "hr_employees" ADD COLUMN     "contractEndDate" TIMESTAMP(3),
ADD COLUMN     "contractType" TEXT,
ADD COLUMN     "contractWeeklyMinutes" INTEGER,
ADD COLUMN     "currency" TEXT DEFAULT 'EUR',
ADD COLUMN     "hourlyRate" DECIMAL(10,4),
ADD COLUMN     "nextReviewDate" TIMESTAMP(3),
ADD COLUMN     "rateEffectiveDate" TIMESTAMP(3),
ADD COLUMN     "reviewFrequency" TEXT,
ADD COLUMN     "trialEndDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hr_employee_secondary_positions" (
    "employeeId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_secondary_positions_pkey" PRIMARY KEY ("employeeId","positionId")
);

-- CreateTable
CREATE TABLE "hr_onboarding_progress" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "status" "HrOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "servicesCompletedAt" TIMESTAMP(3),
    "positionsCompletedAt" TIMESTAMP(3),
    "employeesUnlockedAt" TIMESTAMP(3),
    "firstEmployeeCreatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employment_contracts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "contractType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "weeklyHours" INTEGER,
    "trialStartDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "status" "HrContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_employment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_employee_compensations" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "hourlyRate" DECIMAL(10,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hr_employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_salary_reviews" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "frequencyMonths" INTEGER,
    "status" "HrSalaryReviewStatus" NOT NULL DEFAULT 'UPCOMING',
    "proposedHourlyRate" DECIMAL(10,4),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_salary_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "category" "HrDocumentCategory" NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hr_onboarding_progress_organizationId_key" ON "hr_onboarding_progress"("organizationId");

-- CreateIndex
CREATE INDEX "hr_onboarding_progress_organizationId_idx" ON "hr_onboarding_progress"("organizationId");

-- CreateIndex
CREATE INDEX "hr_onboarding_progress_status_idx" ON "hr_onboarding_progress"("status");

-- CreateIndex
CREATE INDEX "hr_employment_contracts_organizationId_idx" ON "hr_employment_contracts"("organizationId");

-- CreateIndex
CREATE INDEX "hr_employment_contracts_employeeId_idx" ON "hr_employment_contracts"("employeeId");

-- CreateIndex
CREATE INDEX "hr_employment_contracts_status_idx" ON "hr_employment_contracts"("status");

-- CreateIndex
CREATE INDEX "hr_employment_contracts_endDate_idx" ON "hr_employment_contracts"("endDate");

-- CreateIndex
CREATE INDEX "hr_employee_compensations_employeeId_idx" ON "hr_employee_compensations"("employeeId");

-- CreateIndex
CREATE INDEX "hr_employee_compensations_effectiveFrom_idx" ON "hr_employee_compensations"("effectiveFrom");

-- CreateIndex
CREATE INDEX "hr_employee_compensations_effectiveTo_idx" ON "hr_employee_compensations"("effectiveTo");

-- CreateIndex
CREATE INDEX "hr_salary_reviews_employeeId_idx" ON "hr_salary_reviews"("employeeId");

-- CreateIndex
CREATE INDEX "hr_salary_reviews_dueDate_idx" ON "hr_salary_reviews"("dueDate");

-- CreateIndex
CREATE INDEX "hr_salary_reviews_status_idx" ON "hr_salary_reviews"("status");

-- CreateIndex
CREATE INDEX "hr_documents_organizationId_idx" ON "hr_documents"("organizationId");

-- CreateIndex
CREATE INDEX "hr_documents_employeeId_idx" ON "hr_documents"("employeeId");

-- CreateIndex
CREATE INDEX "hr_documents_category_idx" ON "hr_documents"("category");

-- CreateIndex
CREATE INDEX "hr_documents_expiresAt_idx" ON "hr_documents"("expiresAt");

-- AddForeignKey
ALTER TABLE "hr_employee_secondary_positions" ADD CONSTRAINT "hr_employee_secondary_positions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_secondary_positions" ADD CONSTRAINT "hr_employee_secondary_positions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "hr_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_onboarding_progress" ADD CONSTRAINT "hr_onboarding_progress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employment_contracts" ADD CONSTRAINT "hr_employment_contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employment_contracts" ADD CONSTRAINT "hr_employment_contracts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employment_contracts" ADD CONSTRAINT "hr_employment_contracts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_compensations" ADD CONSTRAINT "hr_employee_compensations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_employee_compensations" ADD CONSTRAINT "hr_employee_compensations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_salary_reviews" ADD CONSTRAINT "hr_salary_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_salary_reviews" ADD CONSTRAINT "hr_salary_reviews_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_documents" ADD CONSTRAINT "hr_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
