-- STEP 7: enforce real time-overlap protection in the database.
-- Period numbers are not used as the exclusion key because morning and afternoon
-- shifts can share a period number while their actual times do not overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.timetable_time_seconds(value text)
RETURNS bigint LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $ SELECT floor(extract(epoch FROM (value::time - time '00:00')))::bigint $;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.timetable_slots'::regclass
      AND conname = 'timetable_teacher_time_no_overlap'
  ) THEN
    ALTER TABLE public.timetable_slots
      ADD CONSTRAINT timetable_teacher_time_no_overlap
      EXCLUDE USING gist (
        school_id WITH =,
        term_id WITH =,
        teacher_id WITH =,
        day_of_week WITH =,
        int8range(
          public.timetable_time_seconds(start_time),
          public.timetable_time_seconds(end_time),
          '[)'
        ) WITH &&
      )
      WHERE (term_id IS NOT NULL AND is_active = TRUE AND teacher_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.timetable_slots'::regclass
      AND conname = 'timetable_room_id_time_no_overlap'
  ) THEN
    ALTER TABLE public.timetable_slots
      ADD CONSTRAINT timetable_room_id_time_no_overlap
      EXCLUDE USING gist (
        school_id WITH =,
        term_id WITH =,
        room_id WITH =,
        day_of_week WITH =,
        int8range(
          public.timetable_time_seconds(start_time::time),
          public.timetable_time_seconds(end_time::time),
          '[)'
        ) WITH &&
      )
      WHERE (term_id IS NOT NULL AND is_active = TRUE AND room_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.timetable_slots'::regclass
      AND conname = 'timetable_room_name_time_no_overlap'
  ) THEN
    ALTER TABLE public.timetable_slots
      ADD CONSTRAINT timetable_room_name_time_no_overlap
      EXCLUDE USING gist (
        school_id WITH =,
        term_id WITH =,
        lower(btrim(room_number)) WITH =,
        day_of_week WITH =,
        int8range(
          public.timetable_time_seconds(start_time::time),
          public.timetable_time_seconds(end_time::time),
          '[)'
        ) WITH &&
      )
      WHERE (term_id IS NOT NULL AND is_active = TRUE AND NULLIF(btrim(room_number), '') IS NOT NULL);
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
