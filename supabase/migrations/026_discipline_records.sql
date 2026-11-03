-- School-scoped discipline records. Access is limited to school administrators.
BEGIN;
CREATE TABLE IF NOT EXISTS public.discipline_records (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  incident_date DATE NOT NULL,
  infraction_type VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('minor','moderate','severe')),
  action_taken VARCHAR(1000) NOT NULL DEFAULT '',
  reported_by VARCHAR(64) REFERENCES public.users(id) ON DELETE SET NULL,
  parent_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_discipline_school_date
  ON public.discipline_records (school_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_student_date
  ON public.discipline_records (school_id, student_id, incident_date DESC);
ALTER TABLE public.discipline_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discipline_records_admin_scope ON public.discipline_records;
CREATE POLICY discipline_records_admin_scope ON public.discipline_records
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR
    (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text))
  WITH CHECK (public.auth_user_role() = 'super_admin' OR
    (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));
REVOKE ALL ON public.discipline_records FROM anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
