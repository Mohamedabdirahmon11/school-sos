-- Restrict communication configuration, templates and queue writes to school admins.
-- Existing tenant policies continue to enforce school isolation and scoped reads.
BEGIN;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['communication_settings', 'notification_templates', 'communication_queue'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_insert', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_insert', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_update', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() IN (''school_admin'', ''super_admin'')) WITH CHECK (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_update', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_delete', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_delete', table_name
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
