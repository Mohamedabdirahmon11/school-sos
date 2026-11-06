-- Remove the last overlapping permissive policies while preserving each role's access.
BEGIN;

-- Audit logs: school admins can read their own school's logs; only super admins can write.
DROP POLICY IF EXISTS audit_logs_school_admin ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_super_admin ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_read_scope ON public.audit_logs;
CREATE POLICY audit_logs_read_scope ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));
DROP POLICY IF EXISTS audit_logs_super_admin_insert ON public.audit_logs;
CREATE POLICY audit_logs_super_admin_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'super_admin');
DROP POLICY IF EXISTS audit_logs_super_admin_update ON public.audit_logs;
CREATE POLICY audit_logs_super_admin_update ON public.audit_logs
  FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'super_admin')
  WITH CHECK (public.auth_user_role() = 'super_admin');
DROP POLICY IF EXISTS audit_logs_super_admin_delete ON public.audit_logs;
CREATE POLICY audit_logs_super_admin_delete ON public.audit_logs
  FOR DELETE TO authenticated
  USING (public.auth_user_role() = 'super_admin');

-- Platform broadcasts: schools read only their targeted broadcasts; super admins manage all.
DROP POLICY IF EXISTS broadcasts_target_scope ON public.platform_broadcasts;
DROP POLICY IF EXISTS platform_admin_v2 ON public.platform_broadcasts;
DROP POLICY IF EXISTS broadcasts_read_scope ON public.platform_broadcasts;
CREATE POLICY broadcasts_read_scope ON public.platform_broadcasts
  FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR target_school_id::text = public.auth_school_id()::text);
DROP POLICY IF EXISTS broadcasts_super_admin_insert ON public.platform_broadcasts;
CREATE POLICY broadcasts_super_admin_insert ON public.platform_broadcasts
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'super_admin');
DROP POLICY IF EXISTS broadcasts_super_admin_update ON public.platform_broadcasts;
CREATE POLICY broadcasts_super_admin_update ON public.platform_broadcasts
  FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'super_admin')
  WITH CHECK (public.auth_user_role() = 'super_admin');
DROP POLICY IF EXISTS broadcasts_super_admin_delete ON public.platform_broadcasts;
CREATE POLICY broadcasts_super_admin_delete ON public.platform_broadcasts
  FOR DELETE TO authenticated
  USING (public.auth_user_role() = 'super_admin');

-- Schools: each tenant reads its own school; super admins manage all schools.
DROP POLICY IF EXISTS schools_super_admin_all ON public.schools;
DROP POLICY IF EXISTS schools_tenant_select ON public.schools;
DROP POLICY IF EXISTS schools_read_scope ON public.schools;
CREATE POLICY schools_read_scope ON public.schools
  FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR id::text = public.auth_school_id()::text);
DROP POLICY IF EXISTS schools_super_admin_insert ON public.schools;
CREATE POLICY schools_super_admin_insert ON public.schools
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'super_admin');
DROP POLICY IF EXISTS schools_super_admin_update ON public.schools;
CREATE POLICY schools_super_admin_update ON public.schools
  FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'super_admin')
  WITH CHECK (public.auth_user_role() = 'super_admin');
DROP POLICY IF EXISTS schools_super_admin_delete ON public.schools;
CREATE POLICY schools_super_admin_delete ON public.schools
  FOR DELETE TO authenticated
  USING (public.auth_user_role() = 'super_admin');

-- The tenant_scope_v2 policy already provides exactly the invoice SELECT scope.
DROP POLICY IF EXISTS subscription_invoices_scope ON public.subscription_invoices;

-- Users: combine same-school and super-admin reads; combine self-update and super-admin updates.
DROP POLICY IF EXISTS users_same_school ON public.users;
DROP POLICY IF EXISTS users_super_admin ON public.users;
DROP POLICY IF EXISTS users_self_update ON public.users;
DROP POLICY IF EXISTS users_read_scope ON public.users;
CREATE POLICY users_read_scope ON public.users
  FOR SELECT TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);
DROP POLICY IF EXISTS users_update_scope ON public.users;
CREATE POLICY users_update_scope ON public.users
  FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR id::text = public.auth_user_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR id::text = public.auth_user_id()::text);

NOTIFY pgrst, 'reload schema';
COMMIT;
