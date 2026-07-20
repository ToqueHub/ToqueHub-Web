-- Les fiches techniques n'exposent plus que deux états métier : Brouillon et Actif.
-- ARCHIVED reste un état technique piloté par l'action d'archivage.
UPDATE "technical_sheets"
SET "status" = 'ACTIVE'
WHERE "status" = 'VALIDATED';
