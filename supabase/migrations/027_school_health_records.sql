-- Private student clinic records; never expose health details to teachers, parents or students.
BEGIN;

CREATE TABLE IF NOT EXISTS public.health_records (
  id VARCHAR(80) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  symptoms VARCHAR(2000) NOT NULL,
  treatment VARCHAR(2000) NOT NULL DEFAULT '',
  allergies VARCHAR(1000) NOT NULL DEFAULT '',
  private_notes VARCHAR(3000) NOT NULL DEFAULT '',
  nurse_name VARCHAR(150) NOT NULL,
  recorded_by VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_records_school_visit
  ON public.health_records (school_id, visit_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_records_student_visit
  ON public.health_records (school_id, student_id, visit_date DESC);

ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.health_records;
DROP POLICY IF EXISTS health_records_admin_scope ON public.health_records;
CREATE POLICY health_records_admin_scope ON public.health_records
  FOR ALL TO authenticated
  USING (
    public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text)
  )
  WITH CHECK (
    public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text)
  );
REVOKE ALL ON public.health_records FROM anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
