ALTER TABLE "hr_employees"
ADD COLUMN "trainingNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
