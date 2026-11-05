-- Preserve the original self-read and full super-admin user-management access
-- while keeping each action on a single permissive policy.
BEGIN;
DROP POLICY IF EXISTS users_read_scope ON public.users;
DROP POLICY IF EXISTS users_update_scope ON public.users;
DROP POLICY IF EXISTS users_super_admin_insert ON public.users;
DROP POLICY IF EXISTS users_super_admin_delete ON public.users;
CREATE POLICY users_read_scope ON public.users
  FOR SELECT TO authenticated
  USING (
    public.auth_user_role() = 'super_admin'
    OR school_id::text = public.auth_school_id()::text
    OR id::text = (SELECT auth.uid())::text
  );
CREATE POLICY users_update_scope ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.auth_user_role() = 'super_admin'
    OR id::text = (SELECT auth.uid())::text
  )
  WITH CHECK (
    public.auth_user_role() = 'super_admin'
    OR id::text = (SELECT auth.uid())::text
  );
CREATE POLICY users_super_admin_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'super_admin');
CREATE POLICY users_super_admin_delete ON public.users
  FOR DELETE TO authenticated
  USING (public.auth_user_role() = 'super_admin');
NOTIFY pgrst, 'reload schema';
COMMIT;
