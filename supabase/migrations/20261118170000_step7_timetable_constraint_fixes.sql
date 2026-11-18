-- STEP 7 safety correction: permit whole-day unavailability and make swaps
-- compatible with the existing timetable CHECK constraints.
-- No timetable rows are deleted or rewritten by this migration.

ALTER TABLE public.teacher_unavailability
  DROP CONSTRAINT IF EXISTS teacher_unavailability_period_number_check;

ALTER TABLE public.teacher_unavailability
  ADD CONSTRAINT teacher_unavailability_period_number_check
  CHECK (period_number IS NULL OR (period_number >= 1 AND period_number <= 8));

-- Use actual time-range exclusions so separate shifts can reuse period numbers
-- when their clock times do not overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE OR REPLACE FUNCTION public.timetable_time_seconds(value text)
RETURNS bigint LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $function$ SELECT floor(extract(epoch FROM (value::time - time '00:00')))::bigint $function$;

DO $
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timetable_teacher_time_no_overlap' AND conrelid='public.timetable_slots'::regclass) THEN
  ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_teacher_time_no_overlap
   EXCLUDE USING gist (school_id WITH =, term_id WITH =, teacher_id WITH =, day_of_week WITH =,
    int8range(public.timetable_time_seconds(start_time::text), public.timetable_time_seconds(end_time::text), '[)') WITH &&)
   WHERE (term_id IS NOT NULL AND is_active=true AND teacher_id IS NOT NULL);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timetable_room_id_time_no_overlap' AND conrelid='public.timetable_slots'::regclass) THEN
  ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_room_id_time_no_overlap
   EXCLUDE USING gist (school_id WITH =, term_id WITH =, room_id WITH =, day_of_week WITH =,
    int8range(public.timetable_time_seconds(start_time::text), public.timetable_time_seconds(end_time::text), '[)') WITH &&)
   WHERE (term_id IS NOT NULL AND is_active=true AND room_id IS NOT NULL);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='timetable_room_name_time_no_overlap' AND conrelid='public.timetable_slots'::regclass) THEN
  ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_room_name_time_no_overlap
   EXCLUDE USING gist (school_id WITH =, term_id WITH =, lower(btrim(room_number::text)) WITH =, day_of_week WITH =,
    int8range(public.timetable_time_seconds(start_time::text), public.timetable_time_seconds(end_time::text), '[)') WITH &&)
   WHERE (term_id IS NOT NULL AND is_active=true AND NULLIF(btrim(room_number::text),'') IS NOT NULL);
 END IF;
END $;

DO $$
DECLARE
  definition text;
  old_stage text;
  new_stage text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'schoolos_swap_timetable_slots'
    AND p.pronargs = 3
  LIMIT 1;

  IF definition IS NULL THEN
    RAISE EXCEPTION 'Existing schoolos_swap_timetable_slots function was not found.';
  END IF;

  old_stage := $old$UPDATE public.timetable_slots SET day_of_week='__SWAP__', period_number=CASE WHEN id=p_first_id THEN -2147483647 ELSE -2147483646 END, updated_at=now()
  WHERE id IN (p_first_id,p_second_id) AND school_id=p_school_id;$old$;

  new_stage := $new$UPDATE public.timetable_slots
  SET term_id = NULL, updated_at = now()
  WHERE id IN (p_first_id, p_second_id) AND school_id = p_school_id;$new$;

  IF position(old_stage IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected swap staging block was not found; refusing to change the function.';
  END IF;

  definition := replace(definition, old_stage, new_stage);

  IF position('term_id = first_slot.term_id' IN definition) = 0 THEN
    definition := replace(
      definition,
      'end_time = first_end_text, updated_at=now()',
      'end_time = first_end_text, term_id = first_slot.term_id, updated_at=now()'
    );
  END IF;

  IF position('term_id = second_slot.term_id' IN definition) = 0 THEN
    definition := replace(
      definition,
      'end_time = second_end_text, updated_at=now()',
      'end_time = second_end_text, term_id = second_slot.term_id, updated_at=now()'
    );
  END IF;

  IF position('term_id = first_slot.term_id' IN definition) = 0
     OR position('term_id = second_slot.term_id' IN definition) = 0
     OR position('term_id = NULL' IN definition) > 0
     OR position('__SWAP__' IN definition) > 0 THEN
    RAISE EXCEPTION 'Could not safely stage and restore term scope during timetable swap.';
  END IF;

  EXECUTE definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
