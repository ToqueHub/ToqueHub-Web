-- Les roulements deviennent une donnée métier Planning.
-- Migration des anciens hr_rotations vers planning_templates avant suppression des tables RH.
WITH migrated_rotations AS (
  SELECT
    r.*,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM "planning_templates" pt
        WHERE pt."organizationId" = r."organizationId"
          AND lower(pt."name") = lower(r."name")
      ) THEN r."name" || ' (migré RH ' || substr(r."id"::text, 1, 8) || ')'
      ELSE r."name"
    END AS migrated_name,
    COALESCE(
      (
        SELECT jsonb_agg(DISTINCT a."employeeId"::text)
        FROM "hr_rotation_assignments" a
        WHERE a."rotationId" = r."id" AND a."endDate" IS NULL
      ),
      '[]'::jsonb
    ) AS active_employee_ids
  FROM "hr_rotations" r
)
INSERT INTO "planning_templates" (
  "id",
  "organizationId",
  "name",
  "description",
  "periodType",
  "departmentId",
  "siteId",
  "content",
  "isArchived",
  "archivedAt",
  "createdById",
  "createdAt",
  "updatedAt"
)
SELECT
  r."id",
  r."organizationId",
  r.migrated_name,
  r."description",
  'WEEKLY_ROTATION',
  r."departmentId",
  NULL,
  jsonb_build_object(
    'type', 'WEEKLY_ROTATION',
    'departmentId', r."departmentId",
    'siteId', NULL,
    'days', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', CASE COALESCE((day.value->>'dayOfWeek')::int, day.ordinality)
            WHEN 1 THEN 'monday'
            WHEN 2 THEN 'tuesday'
            WHEN 3 THEN 'wednesday'
            WHEN 4 THEN 'thursday'
            WHEN 5 THEN 'friday'
            WHEN 6 THEN 'saturday'
            ELSE 'sunday'
          END,
          'dayOfWeek', COALESCE((day.value->>'dayOfWeek')::int, day.ordinality),
          'mode', CASE WHEN upper(COALESCE(day.value->>'type', day.value->>'mode', 'REST')) IN ('REST', 'OFF', 'REPOS') THEN 'REST' ELSE 'WORK' END,
          'startTime', CASE WHEN upper(COALESCE(day.value->>'type', day.value->>'mode', 'REST')) IN ('REST', 'OFF', 'REPOS') THEN NULL ELSE COALESCE(day.value->>'startTime', day.value->>'start') END,
          'endTime', CASE WHEN upper(COALESCE(day.value->>'type', day.value->>'mode', 'REST')) IN ('REST', 'OFF', 'REPOS') THEN NULL ELSE COALESCE(day.value->>'endTime', day.value->>'end') END,
          'breakMinutes', COALESCE((day.value->>'breakMinutes')::int, 0),
          'departmentId', NULL,
          'positionId', NULL,
          'siteId', NULL
        )
        ORDER BY COALESCE((day.value->>'dayOfWeek')::int, day.ordinality)
      )
      FROM jsonb_array_elements(COALESCE(r."cycle"::jsonb->'weeks'->0->'days', '[]'::jsonb)) WITH ORDINALITY AS day(value, ordinality)
    ), '[]'::jsonb),
    'employeeIds', r.active_employee_ids,
    'defaultEmployeeIds', r.active_employee_ids,
    'migrationSource', 'hr_rotations',
    'legacyRotationId', r."id",
    'legacyCycleLengthWeeks', r."cycleLengthWeeks",
    'legacyCycle', r."cycle"::jsonb
  ),
  r."isArchived",
  r."archivedAt",
  NULL,
  r."createdAt",
  r."updatedAt"
FROM migrated_rotations r
ON CONFLICT ("id") DO NOTHING;

UPDATE "planning_assignments" pa
SET "comment" = trim(both E'\n' from concat_ws(E'\n', pa."comment", 'Ancien roulement RH migré vers Planning: ' || r."name"))
FROM "hr_rotations" r
WHERE pa."rotationId" = r."id";

ALTER TABLE "planning_assignments" DROP COLUMN IF EXISTS "rotationId";
DROP TABLE IF EXISTS "hr_rotation_assignments";
DROP TABLE IF EXISTS "hr_rotations";
DROP TYPE IF EXISTS "HrRotationStatus";
