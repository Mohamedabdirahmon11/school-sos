-- STEP 7: restore the term scope on BOTH rows after temporary swap staging.
-- The temporary NULL term removes the two rows from the active term uniqueness
-- index while their positions are exchanged. Both rows must regain their term.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='schoolos_swap_timetable_slots'
    AND p.pronargs=3
  LIMIT 1;

  IF definition IS NULL THEN
    RAISE EXCEPTION 'Existing timetable swap function was not found.';
  END IF;

  definition := replace(
    definition,
    'end_time = first_end_text, updated_at=now()',
    'end_time = first_end_text, term_id = first_slot.term_id, updated_at=now()'
  );

  definition := replace(
    definition,
    'The swap would create an overlapping teacher schedule.',
    'Isku beddelku wuxuu keenayaa isku dhac waqtiga macallinka.'
  );
  definition := replace(
    definition,
    'The swap would create an overlapping classroom reservation.',
    'Isku beddelku wuxuu keenayaa isku dhac qolka fasalka.'
  );
  definition := replace(
    definition,
    'Choose two different active timetable slots in this school.',
    'Dooro laba cashar oo kala duwan oo firfircoon oo dugsigan ka tirsan.'
  );

  IF position('term_id = first_slot.term_id' IN definition)=0
     OR position('term_id = second_slot.term_id' IN definition)=0 THEN
    RAISE EXCEPTION 'Swap function must restore term_id for both swapped lessons.';
  END IF;

  EXECUTE definition;
END;
$$;
