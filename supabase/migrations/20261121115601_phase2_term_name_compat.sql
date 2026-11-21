-- Preserve legacy Semester 1/2 marks labels while linking them to configured Term 1/2 rows.
-- Existing marks are only backfilled with their matching term; no marks are removed or rewritten.
CREATE OR REPLACE FUNCTION private.schoolos_sync_student_mark_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_term_id uuid;
  v_term_names text[];
BEGIN
  v_term_names := CASE NEW.semester
    WHEN 'Semester 1' THEN ARRAY['Semester 1', 'Term 1']::text[]
    WHEN 'Semester 2' THEN ARRAY['Semester 2', 'Term 2']::text[]
    ELSE ARRAY[NEW.semester]::text[]
  END;

  SELECT t.id
    INTO v_term_id
    FROM public.academic_years ay
    JOIN public.terms t
      ON t.academic_year_id = ay.id
     AND t.school_id = ay.school_id
   WHERE ay.school_id = NEW.school_id
     AND ay.name = NEW.academic_year
     AND t.name = ANY(v_term_names)
   ORDER BY CASE WHEN t.name = NEW.semester THEN 0 ELSE 1 END
   LIMIT 1;

  IF v_term_id IS NULL THEN
    RAISE EXCEPTION 'The selected academic year and semester are not configured for this school.';
  END IF;

  NEW.term_id := v_term_id;
  RETURN NEW;
END;
$function$;

UPDATE public.student_marks sm
   SET term_id = t.id
  FROM public.academic_years ay
  JOIN public.terms t
    ON t.academic_year_id = ay.id
   AND t.school_id = ay.school_id
 WHERE sm.term_id IS NULL
   AND sm.school_id = ay.school_id
   AND sm.academic_year = ay.name
   AND t.name = ANY(CASE sm.semester
     WHEN 'Semester 1' THEN ARRAY['Semester 1', 'Term 1']::text[]
     WHEN 'Semester 2' THEN ARRAY['Semester 2', 'Term 2']::text[]
     ELSE ARRAY[sm.semester]::text[]
   END);

NOTIFY pgrst, 'reload schema';
