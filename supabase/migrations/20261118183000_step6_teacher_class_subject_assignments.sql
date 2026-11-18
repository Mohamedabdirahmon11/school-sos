-- Step 6: Teacher–Subject–Class assignments.
-- Keep public.assignments untouched: it stores homework tasks/submissions.
-- This dedicated table is additive and preserves class_subjects.teacher_id for legacy timetable/exam readers.

-- Academic-year/term tables are supplied by the earlier academic setup step.
-- Guard these references so baseline schema installs can still apply migrations in order.
DO $step6$
BEGIN
  IF to_regclass('public.academic_years') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS academic_years_id_school_id_uidx ON public.academic_years (id, school_id)';
  END IF;
  IF to_regclass('public.terms') IS NOT NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS terms_id_school_id_uidx ON public.terms (id, school_id)';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS terms_id_year_school_uidx ON public.terms (id, academic_year_id, school_id)';
  END IF;
END $step6$;
CREATE UNIQUE INDEX IF NOT EXISTS class_sections_id_school_id_uidx
  ON public.class_sections (id, school_id);

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS max_periods_per_week integer;
ALTER TABLE public.teachers
  DROP CONSTRAINT IF EXISTS teachers_max_periods_per_week_check;
ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_max_periods_per_week_check
  CHECK (max_periods_per_week IS NULL OR max_periods_per_week BETWEEN 1 AND 60) NOT VALID;
ALTER TABLE public.teachers
  VALIDATE CONSTRAINT teachers_max_periods_per_week_check;

CREATE TABLE IF NOT EXISTS public.teacher_class_subject_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL,
  term_id uuid,
  class_id varchar(64) NOT NULL,
  section_id uuid,
  subject_id varchar(64) NOT NULL,
  teacher_id varchar(64) NOT NULL,
  qualification_override boolean NOT NULL DEFAULT false,
  created_by varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_assignments_class_school_fk
    FOREIGN KEY (class_id, school_id)
    REFERENCES public.classes(id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_assignments_curriculum_school_fk
    FOREIGN KEY (school_id, class_id, subject_id)
    REFERENCES public.class_subjects(school_id, class_id, subject_id) ON DELETE CASCADE,
  CONSTRAINT teacher_assignments_section_school_fk
    FOREIGN KEY (section_id, school_id)
    REFERENCES public.class_sections(id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_assignments_subject_school_fk
    FOREIGN KEY (subject_id, school_id)
    REFERENCES public.subjects(id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_assignments_teacher_school_fk
    FOREIGN KEY (teacher_id, school_id)
    REFERENCES public.teachers(id, school_id) ON DELETE RESTRICT
);

-- Add academic-year/term composite FKs only when the Step 1 tables exist.
DO $step6$
BEGIN
  IF to_regclass('public.academic_years') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_assignments_year_school_fk') THEN
      ALTER TABLE public.teacher_class_subject_assignments
        ADD CONSTRAINT teacher_assignments_year_school_fk
        FOREIGN KEY (academic_year_id, school_id)
        REFERENCES public.academic_years(id, school_id) ON DELETE CASCADE;
    END IF;
  END IF;
  IF to_regclass('public.terms') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_assignments_term_year_school_fk') THEN
      ALTER TABLE public.teacher_class_subject_assignments
        ADD CONSTRAINT teacher_assignments_term_year_school_fk
        FOREIGN KEY (term_id, academic_year_id, school_id)
        REFERENCES public.terms(id, academic_year_id, school_id) ON DELETE CASCADE;
    END IF;
  END IF;
END $step6$;

-- NULL term means the whole academic year; NULL section means the whole class.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_subject_assignment_unique
  ON public.teacher_class_subject_assignments (
    school_id, academic_year_id,
    COALESCE(term_id, '00000000-0000-0000-0000-000000000000'::uuid),
    class_id,
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    subject_id
  );
-- Preserve existing Step 4 teacher links as whole-year Step 6 assignments.
DO $step6$
BEGIN
  IF to_regclass('public.academic_years') IS NOT NULL THEN
    INSERT INTO public.teacher_class_subject_assignments (
      school_id, academic_year_id, term_id, class_id, section_id, subject_id,
      teacher_id, qualification_override, created_by
    )
    SELECT cs.school_id, ay.id, NULL, cs.class_id, section.id, cs.subject_id,
           cs.teacher_id, NOT EXISTS (SELECT 1 FROM public.teacher_subjects ts WHERE ts.school_id = cs.school_id AND ts.teacher_id = cs.teacher_id AND ts.subject_id = cs.subject_id AND ts.is_active = true), 'step6-migration'
    FROM public.class_subjects cs
    JOIN public.academic_years ay
      ON ay.school_id = cs.school_id AND ay.is_current = true
    LEFT JOIN public.class_sections section
      ON section.school_id = cs.school_id AND section.legacy_class_id = cs.class_id
    WHERE cs.is_active = true AND cs.teacher_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $step6$;

CREATE INDEX IF NOT EXISTS teacher_class_subject_assignments_teacher_idx
  ON public.teacher_class_subject_assignments (school_id, teacher_id, academic_year_id, term_id);
CREATE INDEX IF NOT EXISTS teacher_class_subject_assignments_class_idx
  ON public.teacher_class_subject_assignments (school_id, class_id, subject_id);

CREATE TABLE IF NOT EXISTS public.teacher_assignment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assignment_id uuid,
  action varchar(32) NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by varchar(64) NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_assignment_audit_school_time_idx
  ON public.teacher_assignment_audit (school_id, changed_at DESC);

ALTER TABLE public.teacher_class_subject_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignment_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_assignments_school_scope ON public.teacher_class_subject_assignments;
CREATE POLICY teacher_assignments_school_scope ON public.teacher_class_subject_assignments
  FOR ALL TO authenticated
  USING (
    private.auth_user_role()::text = 'super_admin'
    OR (private.auth_user_role()::text = 'school_admin' AND school_id = private.auth_school_id()::text)
  )
  WITH CHECK (
    private.auth_user_role()::text = 'super_admin'
    OR (private.auth_user_role()::text = 'school_admin' AND school_id = private.auth_school_id()::text)
  );

DROP POLICY IF EXISTS teacher_assignment_audit_school_read ON public.teacher_assignment_audit;
CREATE POLICY teacher_assignment_audit_school_read ON public.teacher_assignment_audit
  FOR SELECT TO authenticated
  USING (private.auth_user_role()::text = 'super_admin' OR (private.auth_user_role()::text = 'school_admin' AND school_id = private.auth_school_id()::text));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_class_subject_assignments TO authenticated, service_role;
GRANT SELECT ON public.teacher_assignment_audit TO authenticated, service_role;
GRANT INSERT ON public.teacher_assignment_audit TO service_role;

NOTIFY pgrst, 'reload schema';
