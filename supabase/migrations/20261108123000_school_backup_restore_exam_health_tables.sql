-- Extend the existing, school-scoped merge restore allow-list without replacing
-- the carefully reviewed restore implementation or changing existing data.
-- The migration is source-only until approved for deployment.
DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT := '''notification_templates''] LOOP';
  v_new TEXT := '''notification_templates'', ''exam_schedules'', ''exam_seat_assignments'', ''school_health_visits''] LOOP';
  v_occurrences INTEGER;
BEGIN
  SELECT pg_get_functiondef('public.schoolos_restore_school_backup(jsonb)'::regprocedure)
    INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Expected schoolos_restore_school_backup(jsonb) to exist.';
  END IF;

  -- No-op when schema.sql already contains the extended allow-list.
  IF position(v_new in v_definition) = 0 THEN
    v_occurrences := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
    IF v_occurrences <> 1 THEN
      RAISE EXCEPTION 'Restore allow-list source did not match exactly once; found % matches. No function was changed.', v_occurrences;
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END
$migration$;