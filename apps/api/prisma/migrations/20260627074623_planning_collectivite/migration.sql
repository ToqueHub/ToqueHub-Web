-- RenameIndex
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'planning_counter_accounts_organizationId_employeeId_periodYear_'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'planning_counter_accounts_organizationId_employeeId_periodY_key'
  ) THEN
    ALTER INDEX "planning_counter_accounts_organizationId_employeeId_periodYear_" RENAME TO "planning_counter_accounts_organizationId_employeeId_periodY_key";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'planning_day_statuses_organizationId_employeeId_date_statusCode'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'planning_day_statuses_organizationId_employeeId_date_status_key'
  ) THEN
    ALTER INDEX "planning_day_statuses_organizationId_employeeId_date_statusCode" RENAME TO "planning_day_statuses_organizationId_employeeId_date_status_key";
  END IF;
END $$;
