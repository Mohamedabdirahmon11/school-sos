-- Keep transport routes and bus assignments tenant-readable but server-write-only.
BEGIN;

ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transport_routes_school_read ON public.transport_routes;
CREATE POLICY transport_routes_school_read ON public.transport_routes
  FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id::text = auth_school_id()::text);

DROP POLICY IF EXISTS transport_routes_school_scope ON public.transport_routes;
CREATE POLICY transport_routes_school_scope ON public.transport_routes AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR
    (school_id::text = auth_school_id()::text AND (
      auth_user_role() = 'school_admin' OR
      (auth_user_role() = 'accountant' AND EXISTS (
        SELECT 1 FROM public.staff_members sm
        WHERE sm.user_id = auth_user_id()
          AND sm.school_id::text = transport_routes.school_id::text
          AND sm.status = 'active'
          AND 'transport_manage' = ANY(sm.permissions)
      ))
    )));

DROP POLICY IF EXISTS bus_assignments_student_scope ON public.bus_assignments;
CREATE POLICY bus_assignments_student_scope ON public.bus_assignments AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (auth_user_role() IN ('super_admin','school_admin','accountant') OR auth_can_access_student(student_id));

REVOKE ALL ON public.transport_routes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transport_routes TO authenticated;

REVOKE ALL ON public.bus_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bus_assignments TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
