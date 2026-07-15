ALTER TABLE "haccp_temperature_equipment"
  ADD COLUMN IF NOT EXISTS "temperatureMin" DECIMAL(7,2),
  ADD COLUMN IF NOT EXISTS "temperatureMax" DECIMAL(7,2);
