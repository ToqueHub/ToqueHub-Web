ALTER TABLE "hr_employees"
ADD COLUMN "emergencyContactFirstName" TEXT,
ADD COLUMN "emergencyContactLastName" TEXT,
ADD COLUMN "emergencyContactPhone" TEXT,
ADD COLUMN "emergencyContactEmail" TEXT;

-- The former free-text value remains in emergencyContact so no existing
-- information is lost while users progressively structure their contacts.
