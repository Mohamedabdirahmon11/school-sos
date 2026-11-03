-- SchoolOS uses a server-only Supabase service-role client. Browser clients call the
-- SchoolOS HTTP API; no browser code should access public tables or RPCs directly.
-- Keep RLS enabled, but remove direct Data API privileges from anon/authenticated.
BEGIN;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

CREATE OR REPLACE FUNCTION public.auth_user_id()
RETURNS character varying
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    auth.uid()::text
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_school_id()
RETURNS character varying
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.current_setting('request.jwt.claim.school_id', true),
    (SELECT u.school_id FROM public.users AS u WHERE u.id = public.auth_user_id())
  );
$function$;

-- Never interpret the Postgres API role ('authenticated') as a SchoolOS app role.
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS character varying
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT u.role::text
  FROM public.users AS u
  WHERE u.id = public.auth_user_id();
$function$;

CREATE OR REPLACE FUNCTION public.auth_can_access_student(target_student_id character varying)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.students AS s
    JOIN public.users AS u ON u.id = public.auth_user_id()
    WHERE s.id = target_student_id
      AND (
        u.role = 'super_admin'
        OR (u.school_id = s.school_id AND u.role IN ('school_admin', 'accountant'))
        OR (u.school_id = s.school_id AND u.role = 'teacher' AND s.class_id = ANY(u.assigned_class_ids))
        OR (
          u.school_id = s.school_id
          AND u.role = 'parent'
          AND (
            s.id = ANY(u.linked_student_ids)
            OR s.father_phone = u.phone
            OR s.mother_phone = u.phone
            OR s.father_phone = u.parent_phone
            OR s.mother_phone = u.parent_phone
          )
        )
        OR (
          u.school_id = s.school_id
          AND u.role = 'student'
          AND (u.student_id = s.student_id OR u.id = 'usr-student-' || s.id)
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.auth_can_access_class(target_class_id character varying)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes AS c
    JOIN public.users AS u ON u.id = public.auth_user_id()
    WHERE c.id = target_class_id
      AND (
        u.role = 'super_admin'
        OR (u.school_id = c.school_id AND u.role IN ('school_admin', 'accountant'))
        OR (u.school_id = c.school_id AND u.role = 'teacher' AND c.id = ANY(u.assigned_class_ids))
        OR (
          u.school_id = c.school_id
          AND u.role IN ('parent', 'student')
          AND EXISTS (
            SELECT 1
            FROM public.students AS s
            WHERE s.class_id = c.id
              AND public.auth_can_access_student(s.id)
          )
        )
      )
  );
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
