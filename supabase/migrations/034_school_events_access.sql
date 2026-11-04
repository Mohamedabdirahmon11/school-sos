-- School events are tenant-readable; all mutations go through authorized API routes.
BEGIN;

ALTER TABLE public.school_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_events_school_read ON public.school_events;
CREATE POLICY school_events_school_read ON public.school_events
  FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id::text = auth_school_id()::text);

DROP POLICY IF EXISTS school_events_school_scope ON public.school_events;
CREATE POLICY school_events_school_scope ON public.school_events AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id::text = auth_school_id()::text);

REVOKE ALL ON public.school_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.school_events TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
