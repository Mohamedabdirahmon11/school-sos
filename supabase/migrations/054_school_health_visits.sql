-- School clinic visit records: school-scoped student linkage and admin-only access.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_health_visits (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id varchar(64) NOT NULL,
  visit_date date NOT NULL,
  symptoms varchar(2000) NOT NULL,
  treatment varchar(2000) NOT NULL DEFAULT '',
  nurse_name varchar(160) NOT NULL DEFAULT '',
  recorded_by varchar(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_health_visits_student_school_fk
    FOREIGN KEY (student_id, school_id)
    REFERENCES public.students(id, school_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_school_health_visits_school_date
  ON public.school_health_visits(school_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_school_health_visits_student
  ON public.school_health_visits(student_id, school_id);

ALTER TABLE public.school_health_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_health_visits_read ON public.school_health_visits;
DROP POLICY IF EXISTS school_health_visits_read ON public.school_health_visits;
CREATE POLICY school_health_visits_read ON public.school_health_visits
  FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin'
    OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));
DROP POLICY IF EXISTS school_health_visits_insert ON public.school_health_visits;
DROP POLICY IF EXISTS school_health_visits_insert ON public.school_health_visits;
CREATE POLICY school_health_visits_insert ON public.school_health_visits
  FOR INSERT TO authenticated
  WITH CHECK (school_id = private.auth_school_id()
    AND private.auth_user_role() = 'school_admin'
    AND recorded_by = private.auth_user_id());
DROP POLICY IF EXISTS school_health_visits_update ON public.school_health_visits;
DROP POLICY IF EXISTS school_health_visits_update ON public.school_health_visits;
CREATE POLICY school_health_visits_update ON public.school_health_visits
  FOR UPDATE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'
    AND recorded_by = private.auth_user_id());
DROP POLICY IF EXISTS school_health_visits_delete ON public.school_health_visits;
DROP POLICY IF EXISTS school_health_visits_delete ON public.school_health_visits;
CREATE POLICY school_health_visits_delete ON public.school_health_visits
  FOR DELETE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_health_visits TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
