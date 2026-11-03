CREATE TABLE IF NOT EXISTS public.class_subjects (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id VARCHAR(64) NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id VARCHAR(64) REFERENCES public.teachers(id) ON DELETE SET NULL,
  periods_per_week INTEGER NOT NULL DEFAULT 3 CHECK (periods_per_week BETWEEN 1 AND 30),
  small_exam_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  big_exam_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, subject_id)
);
ALTER TABLE public.class_subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_class_subjects_school_class ON public.class_subjects(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON public.class_subjects(school_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON public.class_subjects(school_id, teacher_id);
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.class_subjects;
CREATE POLICY tenant_scope_v2 ON public.class_subjects FOR ALL TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id = auth_school_id())
  WITH CHECK (auth_user_role() = 'super_admin' OR school_id = auth_school_id());
DROP POLICY IF EXISTS parent_student_block_insert ON public.class_subjects;
CREATE POLICY parent_student_block_insert ON public.class_subjects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_role() NOT IN ('parent','student'));
DROP POLICY IF EXISTS parent_student_block_update ON public.class_subjects;
CREATE POLICY parent_student_block_update ON public.class_subjects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth_user_role() NOT IN ('parent','student')) WITH CHECK (auth_user_role() NOT IN ('parent','student'));
DROP POLICY IF EXISTS parent_student_block_delete ON public.class_subjects;
CREATE POLICY parent_student_block_delete ON public.class_subjects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (auth_user_role() NOT IN ('parent','student'));

CREATE OR REPLACE FUNCTION public.schoolos_save_subject_assignments(p_school_id VARCHAR, p_subject_id VARCHAR, p_assignments JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.class_subjects SET is_active = FALSE WHERE school_id = p_school_id AND subject_id = p_subject_id;
  INSERT INTO public.class_subjects (id, school_id, class_id, subject_id, teacher_id, periods_per_week, small_exam_enabled, big_exam_enabled, is_active)
  SELECT id, p_school_id, class_id, p_subject_id, teacher_id, periods_per_week, small_exam_enabled, big_exam_enabled, TRUE
  FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS a(
    id VARCHAR, class_id VARCHAR, teacher_id VARCHAR, periods_per_week INTEGER,
    small_exam_enabled BOOLEAN, big_exam_enabled BOOLEAN
  ) ON CONFLICT (school_id, class_id, subject_id) DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id, periods_per_week = EXCLUDED.periods_per_week,
    small_exam_enabled = EXCLUDED.small_exam_enabled, big_exam_enabled = EXCLUDED.big_exam_enabled, is_active = TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
