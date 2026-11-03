-- Enforce notice audience visibility, admin-only publishing, and immutable direct messages.
BEGIN;

ALTER TABLE public.school_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_notices_audience_read ON public.school_notices;
CREATE POLICY school_notices_audience_read ON public.school_notices AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.auth_user_role() = 'super_admin'
    OR (school_id::text = public.auth_school_id()::text AND is_active = true AND (
      public.auth_user_role() IN ('school_admin','accountant')
      OR audience IN ('all','school')
      OR (public.auth_user_role() = 'teacher' AND audience = 'teachers')
      OR (public.auth_user_role() = 'parent' AND audience = 'parents')
      OR (public.auth_user_role() = 'student' AND audience = 'students')
      OR (audience = 'class' AND class_id IS NOT NULL AND public.auth_can_access_class(class_id))
    ))
  );

DROP POLICY IF EXISTS school_notices_admin_insert ON public.school_notices;
CREATE POLICY school_notices_admin_insert ON public.school_notices AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));
DROP POLICY IF EXISTS school_notices_admin_update ON public.school_notices;
CREATE POLICY school_notices_admin_update ON public.school_notices AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text))
  WITH CHECK (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));
DROP POLICY IF EXISTS school_notices_admin_delete ON public.school_notices;
CREATE POLICY school_notices_admin_delete ON public.school_notices AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.auth_user_role() = 'super_admin'
    OR (public.auth_user_role() = 'school_admin' AND school_id::text = public.auth_school_id()::text));

DROP POLICY IF EXISTS direct_messages_sender_insert ON public.direct_messages;
REVOKE INSERT ON public.direct_messages FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.direct_messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (is_read) ON public.direct_messages TO authenticated;
REVOKE UPDATE, DELETE ON public.notice_reads FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.school_notices FROM anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
