ALTER TABLE "categories"
ADD COLUMN "vatRate" DECIMAL(5, 2);

-- Initialize existing stock categories with the food rate of the organization's
-- regulatory country. Equipment categories use the general rate and do not feed
-- food inventory valuation.
UPDATE "categories" category
SET "vatRate" = CASE
  WHEN organization."regulatoryCountryCode" = 'FI' AND category."kind" = 'EQUIPMENT' THEN 25.5
  WHEN organization."regulatoryCountryCode" = 'FI' THEN 13.5
  WHEN organization."regulatoryCountryCode" = 'FR' AND category."kind" = 'EQUIPMENT' THEN 20
  WHEN organization."regulatoryCountryCode" = 'FR' THEN 5.5
  ELSE NULL
END
FROM "organizations" organization
WHERE category."organizationId" = organization."id";
