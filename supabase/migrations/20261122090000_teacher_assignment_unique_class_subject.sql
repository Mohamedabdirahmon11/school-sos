-- Tighten teacher assignment uniqueness to the requested class + subject scope.
-- section_id remains optional legacy metadata; it cannot create parallel assignments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.teacher_class_subject_assignments
    GROUP BY school_id, academic_year_id,
      COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid),
      class_id, subject_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate teacher assignments exist for the same school/year/term/class/subject. Resolve them without deleting assignment history before applying this constraint.';
  END IF;
END $$;

DROP INDEX IF EXISTS public.teacher_class_subject_assignment_unique;
CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_subject_assignment_unique
  ON public.teacher_class_subject_assignments (
    school_id, academic_year_id,
    COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid),
    class_id, subject_id
  );

ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_max_periods_per_week_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_max_periods_per_week_check
  CHECK (max_periods_per_week IS NULL OR max_periods_per_week BETWEEN 1 AND 30) NOT VALID;
ALTER TABLE public.teachers
  VALIDATE CONSTRAINT teachers_max_periods_per_week_check;
