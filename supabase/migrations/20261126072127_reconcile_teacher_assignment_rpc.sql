-- Reconcile production schema drift: the API depends on this atomic RPC,
-- but it is absent from the live database despite the original migration existing in main.
-- The existing unique index is retained; this migration only restores the RPC and
-- aligns the teacher workload ceiling with the API's enforced 30 periods/week.
-- Atomic upsert of normalized teacher assignments, dependent timetable cleanup, legacy curriculum link and audit.
-- Additive and idempotent; all writes happen in one PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.upsert_teacher_assignment_atomic(
  p_assignment_id uuid,
  p_school_id varchar,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_class_id varchar,
  p_section_id uuid,
  p_subject_id varchar,
  p_teacher_id varchar,
  p_qualification_override boolean,
  p_changed_by varchar,
  p_clear_dependent_slots boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  old_row public.teacher_class_subject_assignments%ROWTYPE;
  new_row public.teacher_class_subject_assignments%ROWTYPE;
  old_json jsonb;
  current_term_id uuid;
  effective_teacher_id varchar;
  teacher_limit integer;
  used_periods integer;
  requested_periods integer;
BEGIN
  -- Serialize workload validation for this school/teacher/year.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_school_id || ':' || p_teacher_id || ':' || p_academic_year_id::text, 0
  ));

  IF p_assignment_id IS NOT NULL THEN
    SELECT * INTO old_row
    FROM public.teacher_class_subject_assignments
    WHERE id = p_assignment_id AND school_id = p_school_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Teacher assignment was not found in this school.' USING ERRCODE = 'P0002'; END IF;
  ELSE
    SELECT * INTO old_row
    FROM public.teacher_class_subject_assignments
    WHERE school_id = p_school_id
      AND academic_year_id = p_academic_year_id
      AND term_id IS NOT DISTINCT FROM p_term_id
      AND class_id = p_class_id AND subject_id = p_subject_id
    FOR UPDATE;
  END IF;
  IF old_row.id IS NOT NULL THEN
    old_json := to_jsonb(old_row);
    IF (old_row.teacher_id IS DISTINCT FROM p_teacher_id
        OR old_row.class_id IS DISTINCT FROM p_class_id
        OR old_row.subject_id IS DISTINCT FROM p_subject_id
        OR old_row.section_id IS DISTINCT FROM p_section_id) THEN
      IF EXISTS (
        SELECT 1 FROM public.timetable_slots
        WHERE school_id = p_school_id AND class_id = old_row.class_id
          AND subject_id = old_row.subject_id
      ) AND NOT p_clear_dependent_slots THEN
        RAISE EXCEPTION 'Dependent timetable slots require explicit confirmation before assignment changes.'
          USING ERRCODE = '23514';
      END IF;
      IF p_clear_dependent_slots THEN
        UPDATE public.timetable_slots
        SET is_active = false
        WHERE school_id = p_school_id AND class_id = old_row.class_id
          AND subject_id = old_row.subject_id AND is_active = true;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(max_periods_per_week, 30) INTO teacher_limit
  FROM public.teachers
  WHERE id = p_teacher_id AND school_id = p_school_id AND lower(status) = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active teacher was not found in this school.' USING ERRCODE = '23503'; END IF;
  teacher_limit := LEAST(30, GREATEST(1, COALESCE(teacher_limit, 30)));

  WITH applicable AS (
    SELECT DISTINCT ON (a.class_id, a.subject_id)
      a.class_id, a.subject_id
    FROM public.teacher_class_subject_assignments a
    WHERE a.school_id = p_school_id
      AND a.academic_year_id = p_academic_year_id
      AND a.teacher_id = p_teacher_id
      AND a.id IS DISTINCT FROM old_row.id
      AND (p_term_id IS NULL AND a.term_id IS NULL
        OR p_term_id IS NOT NULL AND (a.term_id IS NULL OR a.term_id = p_term_id))
    ORDER BY a.class_id, a.subject_id, (a.term_id = p_term_id) DESC NULLS LAST
  )
  SELECT COALESCE(sum(cs.periods_per_week), 0)::integer INTO used_periods
  FROM applicable a
  JOIN public.class_subjects cs
    ON cs.school_id = p_school_id AND cs.class_id = a.class_id
   AND cs.subject_id = a.subject_id AND cs.is_active = true;

  SELECT COALESCE(periods_per_week, 0)::integer INTO requested_periods
  FROM public.class_subjects
  WHERE school_id = p_school_id AND class_id = p_class_id
    AND subject_id = p_subject_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class subject curriculum row was not found.' USING ERRCODE = '23503'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.teacher_class_subject_assignments a
    WHERE a.school_id = p_school_id AND a.academic_year_id = p_academic_year_id
      AND a.teacher_id = p_teacher_id AND a.class_id = p_class_id
      AND a.subject_id = p_subject_id AND a.id IS DISTINCT FROM old_row.id
      AND (p_term_id IS NULL AND a.term_id IS NULL
        OR p_term_id IS NOT NULL AND (a.term_id IS NULL OR a.term_id = p_term_id))
  ) THEN requested_periods := 0; END IF;

  IF used_periods + requested_periods > teacher_limit THEN
    RAISE EXCEPTION 'Teacher workload exceeds 30 periods per week (%/%).', used_periods + requested_periods, teacher_limit
      USING ERRCODE = '23514';
  END IF;

  IF old_row.id IS NOT NULL THEN
    UPDATE public.teacher_class_subject_assignments
    SET academic_year_id = p_academic_year_id, term_id = p_term_id,
        class_id = p_class_id, section_id = p_section_id,
        subject_id = p_subject_id, teacher_id = p_teacher_id,
        qualification_override = p_qualification_override, updated_at = now()
    WHERE id = old_row.id AND school_id = p_school_id
    RETURNING * INTO new_row;
  ELSE
    INSERT INTO public.teacher_class_subject_assignments (
      school_id, academic_year_id, term_id, class_id, section_id,
      subject_id, teacher_id, qualification_override, created_by
    ) VALUES (
      p_school_id, p_academic_year_id, p_term_id, p_class_id, p_section_id,
      p_subject_id, p_teacher_id, p_qualification_override, p_changed_by
    ) RETURNING * INTO new_row;
  END IF;

  SELECT id INTO current_term_id
  FROM public.terms
  WHERE school_id = p_school_id AND academic_year_id = p_academic_year_id
    AND is_current = true
  LIMIT 1;
  IF EXISTS (
    SELECT 1 FROM public.academic_years
    WHERE school_id = p_school_id AND id = p_academic_year_id AND is_current = true
  ) THEN
    SELECT a.teacher_id INTO effective_teacher_id
    FROM public.teacher_class_subject_assignments a
    WHERE a.school_id = p_school_id AND a.academic_year_id = p_academic_year_id
      AND a.class_id = p_class_id AND a.subject_id = p_subject_id
      AND (a.section_id IS NULL OR a.section_id IS NOT DISTINCT FROM p_section_id)
      AND (a.term_id IS NULL OR a.term_id = current_term_id)
    ORDER BY (a.term_id = current_term_id) DESC NULLS LAST,
      (a.section_id IS NOT NULL) DESC
    LIMIT 1;
    UPDATE public.class_subjects
    SET teacher_id = effective_teacher_id
    WHERE school_id = p_school_id AND class_id = p_class_id AND subject_id = p_subject_id;
  END IF;

  INSERT INTO public.teacher_assignment_audit (
    school_id, assignment_id, action, before_data, after_data, changed_by
  ) VALUES (
    p_school_id, new_row.id,
    CASE WHEN old_row.id IS NULL THEN 'created' ELSE 'updated' END,
    old_json, to_jsonb(new_row), p_changed_by
  );

  RETURN to_jsonb(new_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_teacher_assignment_atomic(uuid, varchar, uuid, uuid, varchar, uuid, varchar, varchar, boolean, varchar, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_teacher_assignment_atomic(uuid, varchar, uuid, uuid, varchar, uuid, varchar, varchar, boolean, varchar, boolean) TO service_role;


DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.teachers
    WHERE max_periods_per_week IS NOT NULL AND max_periods_per_week > 30
  ) THEN
    RAISE EXCEPTION 'Teacher workload limits above 30 exist; review them before applying the 30-period policy.';
  END IF;
END $$;

ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_max_periods_per_week_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_max_periods_per_week_check
  CHECK (max_periods_per_week IS NULL OR max_periods_per_week BETWEEN 1 AND 30) NOT VALID;
ALTER TABLE public.teachers
  VALIDATE CONSTRAINT teachers_max_periods_per_week_check;
