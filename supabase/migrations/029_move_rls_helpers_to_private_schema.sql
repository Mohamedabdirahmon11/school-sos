-- Keep RLS SECURITY DEFINER helpers out of PostgREST's exposed public schema.
-- Policies retain their function OIDs when the helpers are moved to private.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.auth_user_id() SET SCHEMA private;
ALTER FUNCTION public.auth_school_id() SET SCHEMA private;
ALTER FUNCTION public.auth_user_role() SET SCHEMA private;
ALTER FUNCTION public.auth_can_access_student(VARCHAR) SET SCHEMA private;
ALTER FUNCTION public.auth_can_access_class(VARCHAR) SET SCHEMA private;

CREATE OR REPLACE FUNCTION private.auth_user_id()
RETURNS VARCHAR
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION private.auth_school_id()
RETURNS VARCHAR
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.current_setting('request.jwt.claim.school_id', true),
    (SELECT u.school_id FROM public.users AS u WHERE u.id = private.auth_user_id())
  );
$$;

CREATE OR REPLACE FUNCTION private.auth_user_role()
RETURNS VARCHAR
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT u.role::text
  FROM public.users AS u
  WHERE u.id = private.auth_user_id();
$$;

CREATE OR REPLACE FUNCTION private.auth_can_access_student(target_student_id VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students AS s
    JOIN public.users AS u ON u.id = private.auth_user_id()
    WHERE s.id = target_student_id
      AND (
        u.role = 'super_admin'
        OR (u.school_id = s.school_id AND u.role IN ('school_admin', 'accountant'))
        OR (
          u.school_id = s.school_id AND u.role = 'teacher'
          AND EXISTS (
            SELECT 1 FROM public.teachers AS t
            JOIN public.class_subjects AS cs
              ON cs.teacher_id = t.id AND cs.school_id = t.school_id
             AND cs.class_id = s.class_id AND cs.is_active = TRUE
            WHERE t.user_id = u.id AND t.school_id = s.school_id
          )
        )
        OR (
          u.school_id = s.school_id AND u.role = 'parent'
          AND (
            s.id = ANY(u.linked_student_ids)
            OR s.father_phone = u.phone OR s.mother_phone = u.phone
            OR s.father_phone = u.parent_phone OR s.mother_phone = u.parent_phone
          )
        )
        OR (
          u.school_id = s.school_id AND u.role = 'student'
          AND (u.student_id = s.student_id OR u.id = 'usr-student-' || s.id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.auth_can_access_class(target_class_id VARCHAR)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes AS c
    JOIN public.users AS u ON u.id = private.auth_user_id()
    WHERE c.id = target_class_id
      AND (
        u.role = 'super_admin'
        OR (u.school_id = c.school_id AND u.role IN ('school_admin', 'accountant'))
        OR (
          u.school_id = c.school_id AND u.role = 'teacher'
          AND EXISTS (
            SELECT 1 FROM public.teachers AS t
            JOIN public.class_subjects AS cs
              ON cs.teacher_id = t.id AND cs.school_id = t.school_id
             AND cs.class_id = c.id AND cs.is_active = TRUE
            WHERE t.user_id = u.id AND t.school_id = c.school_id
          )
        )
        OR (
          u.school_id = c.school_id AND u.role IN ('parent', 'student')
          AND EXISTS (
            SELECT 1 FROM public.students AS s
            WHERE s.class_id = c.id AND private.auth_can_access_student(s.id)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.auth_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_can_access_student(VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_can_access_class(VARCHAR) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.auth_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_can_access_student(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_can_access_class(VARCHAR) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
