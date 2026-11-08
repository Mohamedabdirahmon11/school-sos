-- Enforce timetable teacher and room conflicts inside the database transaction.
-- API checks provide friendly validation; this guard also prevents concurrent
-- administrators from saving overlapping assignments between the check and write.
DO $migration$
DECLARE
  v_definition TEXT;
  v_old TEXT := $old$BEGIN
  IF NOT EXISTS ($old$;
  v_new TEXT := $new$BEGIN
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS incoming(
        day_of_week VARCHAR, start_time VARCHAR, end_time VARCHAR,
        teacher_id VARCHAR, room_number VARCHAR
      )
      JOIN public.timetable_slots existing
        ON existing.school_id = p_school_id
       AND existing.class_id <> p_class_id
       AND existing.is_active = TRUE
       AND existing.day_of_week = incoming.day_of_week
       AND existing.teacher_id = incoming.teacher_id
       AND incoming.start_time < existing.end_time
       AND incoming.end_time > existing.start_time
  ) THEN
    RAISE EXCEPTION 'Teacher timetable conflict: this teacher is already assigned during an overlapping time.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS incoming(
        day_of_week VARCHAR, start_time VARCHAR, end_time VARCHAR,
        room_number VARCHAR
      )
      JOIN public.timetable_slots existing
        ON existing.school_id = p_school_id
       AND existing.class_id <> p_class_id
       AND existing.is_active = TRUE
       AND existing.day_of_week = incoming.day_of_week
       AND NULLIF(BTRIM(incoming.room_number), '') IS NOT NULL
       AND LOWER(BTRIM(existing.room_number)) = LOWER(BTRIM(incoming.room_number))
       AND incoming.start_time < existing.end_time
       AND incoming.end_time > existing.start_time
  ) THEN
    RAISE EXCEPTION 'Classroom timetable conflict: this room is already reserved during an overlapping time.';
  END IF;

  IF NOT EXISTS ($new$;
  v_occurrences INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.schoolos_replace_class_timetable(character varying,character varying,jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Expected schoolos_replace_class_timetable(varchar,varchar,jsonb) to exist.';
  END IF;

  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old, ''))
  ) / length(v_old);

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'Timetable replace function source did not match the expected version exactly once; found % matches. No function was changed.', v_occurrences;
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END
$migration$;
