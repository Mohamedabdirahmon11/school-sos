-- Return submitted marks for correction and publish only fully approved semester results.
-- Existing approved marks are backfilled as already published so no current parent-visible
-- results disappear when this migration is applied.
ALTER TABLE public.student_marks
  ADD COLUMN IF NOT EXISTS correction_reason text,
  ADD COLUMN IF NOT EXISTS returned_by text,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by text;

UPDATE public.student_marks
SET published_at = COALESCE(approved_at, now()),
    published_by = approved_by
WHERE status = 'approved'
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS student_marks_parent_published_idx
  ON public.student_marks (school_id, student_id, semester, published_at)
  WHERE status = 'approved' AND published_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.schoolos_publish_exam_results(
  p_school_id text,
  p_class_id text,
  p_semester text,
  p_published_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_class public.classes%ROWTYPE;
  v_missing_count integer;
  v_published_count integer;
  v_published_at timestamptz := now();
BEGIN
  IF coalesce(btrim(p_school_id), '') = ''
     OR coalesce(btrim(p_class_id), '') = ''
     OR coalesce(btrim(p_published_by), '') = ''
     OR p_semester IS NULL OR p_semester NOT IN ('Semester 1', 'Semester 2') THEN
    RAISE EXCEPTION 'A school, class, publisher and valid semester are required.';
  END IF;

  SELECT * INTO v_class
  FROM public.classes
  WHERE id = p_class_id
    AND school_id = p_school_id
    AND coalesce(is_archived, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected class was not found in this school.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE school_id = p_school_id AND class_id = p_class_id
  ) THEN
    RAISE EXCEPTION 'The class has no enrolled students.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.class_subjects
    WHERE school_id = p_school_id AND class_id = p_class_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'The class has no active subject assignments.';
  END IF;

  SELECT count(*) INTO v_missing_count
  FROM public.students s
  CROSS JOIN public.class_subjects cs
  LEFT JOIN public.student_marks sm
    ON sm.school_id = p_school_id
   AND sm.class_id = p_class_id
   AND sm.student_id = s.id
   AND sm.subject_id = cs.subject_id
   AND sm.semester = p_semester
  WHERE s.school_id = p_school_id
    AND s.class_id = p_class_id
    AND cs.school_id = p_school_id
    AND cs.class_id = p_class_id
    AND cs.is_active = true
    AND (sm.id IS NULL OR sm.status <> 'approved');

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION 'Cannot publish results: % student-subject result(s) are missing or not approved.', v_missing_count;
  END IF;

  UPDATE public.student_marks
  SET published_at = v_published_at,
      published_by = p_published_by
  WHERE school_id = p_school_id
    AND class_id = p_class_id
    AND semester = p_semester
    AND status = 'approved'
    AND published_at IS NULL;

  GET DIAGNOSTICS v_published_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'published_count', v_published_count,
    'published_at', v_published_at,
    'class_id', p_class_id,
    'semester', p_semester
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.schoolos_publish_exam_results(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_publish_exam_results(text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_publish_exam_results(text, text, text, text) TO service_role;
