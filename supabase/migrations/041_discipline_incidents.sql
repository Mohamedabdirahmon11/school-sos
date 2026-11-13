-- Discipline incident records: tenant-bound student references and admin-only access.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_school_unique ON public.students(id, school_id);
CREATE TABLE IF NOT EXISTS public.discipline_incidents (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id varchar(64) NOT NULL,
  incident_date date NOT NULL,
  infraction_type varchar(160) NOT NULL,
  severity varchar(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  action_taken text NOT NULL DEFAULT '',
  notes text,
  parent_contacted boolean NOT NULL DEFAULT false,
  recorded_by varchar(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discipline_incidents_student_school_fk FOREIGN KEY (student_id, school_id)
    REFERENCES public.students(id, school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_discipline_school_date ON public.discipline_incidents(school_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_student ON public.discipline_incidents(student_id, school_id);
ALTER TABLE public.discipline_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discipline_incidents_read ON public.discipline_incidents;
DROP POLICY IF EXISTS discipline_incidents_read ON public.discipline_incidents;
CREATE POLICY discipline_incidents_read ON public.discipline_incidents FOR SELECT TO authenticated
USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));
DROP POLICY IF EXISTS discipline_incidents_insert ON public.discipline_incidents;
DROP POLICY IF EXISTS discipline_incidents_insert ON public.discipline_incidents;
CREATE POLICY discipline_incidents_insert ON public.discipline_incidents FOR INSERT TO authenticated
WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin' AND recorded_by = private.auth_user_id());
DROP POLICY IF EXISTS discipline_incidents_update ON public.discipline_incidents;
DROP POLICY IF EXISTS discipline_incidents_update ON public.discipline_incidents;
CREATE POLICY discipline_incidents_update ON public.discipline_incidents FOR UPDATE TO authenticated
USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin' AND recorded_by = private.auth_user_id());
DROP POLICY IF EXISTS discipline_incidents_delete ON public.discipline_incidents;
DROP POLICY IF EXISTS discipline_incidents_delete ON public.discipline_incidents;
CREATE POLICY discipline_incidents_delete ON public.discipline_incidents FOR DELETE TO authenticated
USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_incidents TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
