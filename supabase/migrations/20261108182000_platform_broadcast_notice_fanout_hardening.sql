-- Harden idempotent platform-broadcast fan-out before the UI uses the RPC.
BEGIN;
CREATE OR REPLACE FUNCTION public.schoolos_publish_platform_broadcast(p_broadcast_id VARCHAR)
RETURNS public.platform_broadcasts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  broadcast_row public.platform_broadcasts%ROWTYPE;
BEGIN
  SELECT * INTO broadcast_row
  FROM public.platform_broadcasts
  WHERE id = p_broadcast_id
    AND status IN ('draft', 'scheduled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF broadcast_row.audience NOT IN ('all_schools', 'school_admins', 'teachers', 'one_school') THEN
    RAISE EXCEPTION 'The platform broadcast audience is invalid.';
  END IF;

  IF broadcast_row.audience = 'one_school'
     AND (broadcast_row.target_school_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.schools WHERE id = broadcast_row.target_school_id
     )) THEN
    RAISE EXCEPTION 'The target school for this broadcast no longer exists.';
  END IF;

  INSERT INTO public.school_notices (
    id, school_id, title, content, audience, is_pinned, publish_date,
    author_name, author_role, class_id, is_active, created_at
  )
  SELECT
    'platform-' || md5(broadcast_row.id || ':' || school.id),
    school.id,
    broadcast_row.title,
    broadcast_row.message,
    CASE broadcast_row.audience
      WHEN 'school_admins' THEN 'school_admins'
      WHEN 'teachers' THEN 'teachers'
      WHEN 'one_school' THEN 'school'
      ELSE 'all'
    END,
    FALSE,
    CURRENT_DATE,
    'SchoolOS Platform',
    'super_admin',
    NULL,
    TRUE,
    NOW()
  FROM public.schools AS school
  WHERE broadcast_row.audience <> 'one_school'
     OR school.id = broadcast_row.target_school_id
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.platform_broadcasts
  SET status = 'sent', sent_at = NOW()
  WHERE id = broadcast_row.id
  RETURNING * INTO broadcast_row;

  RETURN broadcast_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.schoolos_publish_platform_broadcast(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_publish_platform_broadcast(VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
