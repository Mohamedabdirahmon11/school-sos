-- Restrict SMS/WhatsApp credentials and queued recipient data to school administrators.
BEGIN;

ALTER TABLE public.communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_settings_admin_access ON public.communication_settings;
CREATE POLICY communication_settings_admin_access ON public.communication_settings AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text))
  WITH CHECK (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));

DROP POLICY IF EXISTS communication_queue_admin_access ON public.communication_queue;
CREATE POLICY communication_queue_admin_access ON public.communication_queue AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text))
  WITH CHECK (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));

REVOKE ALL ON public.communication_settings FROM anon;
REVOKE ALL ON public.communication_queue FROM anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
