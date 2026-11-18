-- STEP 7 safety correction: permit whole-day unavailability and make swaps
-- compatible with the existing timetable CHECK constraints.
-- No timetable rows are deleted or rewritten by this migration.

ALTER TABLE public.teacher_unavailability
  DROP CONSTRAINT IF EXISTS teacher_unavailability_period_number_check;

ALTER TABLE public.teacher_unavailability
  ADD CONSTRAINT teacher_unavailability_period_number_check
  CHECK (period_number IS NULL OR (period_number >= 1 AND period_number <= 8));

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
