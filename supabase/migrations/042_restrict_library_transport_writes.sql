-- Restrict library, transport, and bus assignment writes to school administrators.
-- Existing tenant_scope_v2 policies remain responsible for school isolation.
BEGIN;

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_books_admin_insert ON public.library_books;
DROP POLICY IF EXISTS library_books_admin_insert ON public.library_books;
CREATE POLICY library_books_admin_insert ON public.library_books AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS library_books_admin_update ON public.library_books;
DROP POLICY IF EXISTS library_books_admin_update ON public.library_books;
CREATE POLICY library_books_admin_update ON public.library_books AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS library_books_admin_delete ON public.library_books;
DROP POLICY IF EXISTS library_books_admin_delete ON public.library_books;
CREATE POLICY library_books_admin_delete ON public.library_books AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS transport_routes_admin_insert ON public.transport_routes;
DROP POLICY IF EXISTS transport_routes_admin_insert ON public.transport_routes;
CREATE POLICY transport_routes_admin_insert ON public.transport_routes AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS transport_routes_admin_update ON public.transport_routes;
DROP POLICY IF EXISTS transport_routes_admin_update ON public.transport_routes;
CREATE POLICY transport_routes_admin_update ON public.transport_routes AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS transport_routes_admin_delete ON public.transport_routes;
DROP POLICY IF EXISTS transport_routes_admin_delete ON public.transport_routes;
CREATE POLICY transport_routes_admin_delete ON public.transport_routes AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS bus_assignments_admin_insert ON public.bus_assignments;
DROP POLICY IF EXISTS bus_assignments_admin_insert ON public.bus_assignments;
CREATE POLICY bus_assignments_admin_insert ON public.bus_assignments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS bus_assignments_admin_update ON public.bus_assignments;
DROP POLICY IF EXISTS bus_assignments_admin_update ON public.bus_assignments;
CREATE POLICY bus_assignments_admin_update ON public.bus_assignments AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS bus_assignments_admin_delete ON public.bus_assignments;
DROP POLICY IF EXISTS bus_assignments_admin_delete ON public.bus_assignments;
CREATE POLICY bus_assignments_admin_delete ON public.bus_assignments AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

NOTIFY pgrst, 'reload schema';
COMMIT;
