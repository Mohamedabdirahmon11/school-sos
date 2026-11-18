-- STEP 7: keep all timetable swap conflict feedback in Somali.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='schoolos_swap_timetable_slots' AND p.pronargs=3 LIMIT 1;
  IF definition IS NULL THEN RAISE EXCEPTION 'Existing timetable swap function was not found.'; END IF;
  definition := replace(definition,'The two swapped periods would overlap for the same teacher.','Labada cashar ee la isku beddelayo waxay isku dhacayaan waqtiga macallinka.');
  definition := replace(definition,'The two swapped periods would reserve the same room at overlapping times.','Labada cashar ee la isku beddelayo waxay isku mar qabsanayaan isla qolka.');
  IF position('The two swapped periods would overlap for the same teacher.' IN definition)>0
     OR position('The two swapped periods would reserve the same room at overlapping times.' IN definition)>0 THEN
    RAISE EXCEPTION 'English swap conflict messages remain; refusing to update.';
  END IF;
  EXECUTE definition;
END;
$$;
