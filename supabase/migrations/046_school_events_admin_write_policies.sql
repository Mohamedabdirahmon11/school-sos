-- Restrict school calendar event writes to school administrators.
-- Existing tenant_scope_v2 policies continue to enforce school isolation and reads.
BEGIN;

ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_events_admin_insert ON public.school_events;
CREATE POLICY school_events_admin_insert ON public.school_events AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS school_events_admin_update ON public.school_events;
CREATE POLICY school_events_admin_update ON public.school_events AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS school_events_admin_delete ON public.school_events;
CREATE POLICY school_events_admin_delete ON public.school_events AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

NOTIFY pgrst, 'reload schema';
COMMIT;
