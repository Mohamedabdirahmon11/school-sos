-- Extend the existing, school-scoped merge restore allow-list without replacing
-- the carefully reviewed restore implementation or changing any existing data.
-- This is deliberately a source migration only; apply through the normal reviewed
-- deployment process after CI and a backup/restore rehearsal.
DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT := $old$'notification_templates'] LOOP$old$;
  v_new TEXT := $new$'notification_templates', 'exam_schedules', 'exam_seat_assignments', 'school_health_visits'] LOOP$new$;
  v_occurrences INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.schoolos_restore_school_backup(jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Expected schoolos_restore_school_backup(jsonb) to exist before applying this migration.';
  END IF;

  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'Restore allow-list source did not match the expected version exactly once; found % matches. No function was changed.', v_occurrences;
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END
$migration$;
