-- Apply the new dashboard defaults once to existing user preferences.
UPDATE "dashboard_preferences"
SET "hiddenWidgetIds" = ARRAY(
  SELECT DISTINCT widget_id
  FROM unnest(
    COALESCE("hiddenWidgetIds", ARRAY[]::TEXT[]) || ARRAY[
      'technical-sheets.recipes',
      'hr.latest-employees',
      'technical-sheets.latest',
      'technical-sheets.top-products',
      'planning.coverage'
    ]::TEXT[]
  ) AS hidden_widget(widget_id)
),
"updatedAt" = CURRENT_TIMESTAMP;
