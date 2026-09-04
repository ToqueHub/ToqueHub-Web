ALTER TABLE "finance_settings"
  ALTER COLUMN "dashboardKpis" SET DEFAULT ARRAY[
    'result_before_depreciation',
    'accounting_operating_result',
    'net_result',
    'average_ticket',
    'transactions',
    'contribution_margin',
    'cash',
    'fixed_costs',
    'break_even'
  ]::TEXT[];

UPDATE "finance_settings"
SET "dashboardKpis" = "dashboardKpis" || ARRAY['result_before_depreciation']::TEXT[]
WHERE NOT ('result_before_depreciation' = ANY("dashboardKpis"));

UPDATE "finance_settings"
SET "dashboardKpis" = "dashboardKpis" || ARRAY['accounting_operating_result']::TEXT[]
WHERE NOT ('accounting_operating_result' = ANY("dashboardKpis"));

UPDATE "finance_settings"
SET "dashboardKpis" = "dashboardKpis" || ARRAY['net_result']::TEXT[]
WHERE NOT ('net_result' = ANY("dashboardKpis"));
