-- The Purchasing onboarding now reuses supplier emails and products from Stocks.
-- Move organizations parked on the removed catalog step directly to the draft step.
UPDATE "purchasing_onboarding_progress"
SET
  "currentStep" = 'draft',
  "completedSteps" = array_remove("completedSteps", 'catalog'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "currentStep" = 'catalog'
   OR 'catalog' = ANY("completedSteps");
