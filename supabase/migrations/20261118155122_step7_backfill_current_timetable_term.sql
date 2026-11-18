-- STEP 7: associate existing active timetable rows with each school's current term.
-- Refuse to guess when a school has zero or multiple current terms.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.schools s
   WHERE EXISTS (SELECT 1 FROM public.timetable_slots x WHERE x.school_id=s.id AND x.is_active=true AND x.term_id IS NULL)
     AND (SELECT count(*) FROM public.terms t WHERE t.school_id=s.id AND t.is_current=true) <> 1
 ) THEN
   RAISE EXCEPTION 'Cannot backfill timetable terms: a school with active legacy slots must have exactly one current term.';
 END IF;
END $$;

UPDATE public.timetable_slots ts
SET term_id=t.id, updated_at=now()
FROM public.terms t
WHERE ts.school_id=t.school_id AND t.is_current=true
  AND ts.is_active=true AND ts.term_id IS NULL;

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.timetable_slots WHERE is_active=true AND term_id IS NULL) THEN
   RAISE EXCEPTION 'Some active timetable rows were not assigned to a current term.';
 END IF;
END $$;