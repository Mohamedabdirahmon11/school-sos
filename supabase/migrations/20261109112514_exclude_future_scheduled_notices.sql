-- Scheduled notices remain visible to administrators, but do not count as unread until publication day.
CREATE OR REPLACE FUNCTION public.schoolos_notice_unread_count(
  p_school_id character varying,
  p_user_id character varying,
  p_role text,
  p_class_ids text[] DEFAULT ARRAY[]::text[]
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COUNT(*)::INTEGER
  FROM public.school_notices n
  WHERE n.school_id = p_school_id
    AND n.is_active = TRUE
    AND n.publish_date <= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = p_user_id
        AND u.role::TEXT = p_role
        AND (p_role = 'super_admin' OR u.school_id = p_school_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notice_reads nr
      WHERE nr.school_id = n.school_id
        AND nr.notice_id = n.id
        AND nr.user_id = p_user_id
    )
    AND (
      p_role IN ('school_admin', 'super_admin', 'accountant')
      OR n.audience IN (
        'all',
        'school',
        CASE p_role
          WHEN 'teacher' THEN 'teachers'
          WHEN 'parent' THEN 'parents'
          ELSE 'students'
        END
      )
      OR n.audience = 'class'
        AND (
          n.class_id = ANY(COALESCE(p_class_ids, ARRAY[]::TEXT[]))
          OR p_role = 'parent' AND EXISTS (
            SELECT 1
            FROM public.students s
            JOIN public.users u ON u.id = p_user_id AND u.school_id = s.school_id
            WHERE s.school_id = p_school_id
              AND s.class_id = n.class_id
              AND (
                s.id = ANY(COALESCE(u.linked_student_ids, ARRAY[]::TEXT[]))
                OR s.father_phone IN (u.phone, u.parent_phone)
                OR s.mother_phone IN (u.phone, u.parent_phone)
              )
          )
          OR p_role = 'student' AND EXISTS (
            SELECT 1
            FROM public.students s
            JOIN public.users u ON u.id = p_user_id AND u.school_id = s.school_id
            WHERE s.school_id = p_school_id
              AND s.class_id = n.class_id
              AND (
                u.student_id = s.student_id
                OR REGEXP_REPLACE(u.id, '^usr-student-', 'std-') = s.id
              )
          )
        )
    );
$function$;

REVOKE ALL ON FUNCTION public.schoolos_notice_unread_count(character varying, character varying, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.schoolos_notice_unread_count(character varying, character varying, text, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_notice_unread_count(character varying, character varying, text, text[]) TO service_role;
