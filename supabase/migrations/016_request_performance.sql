CREATE INDEX IF NOT EXISTS idx_school_branches_school_id_id
  ON school_branches (school_id, id);
CREATE INDEX IF NOT EXISTS idx_classes_branch_archive_order
  ON classes (school_id, branch_id, is_archived, id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id_id
  ON subjects (school_id, id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id_id
  ON teachers (school_id, id);
CREATE INDEX IF NOT EXISTS idx_school_notices_active_order
  ON school_notices (school_id, is_active, id);

CREATE OR REPLACE FUNCTION schoolos_notice_unread_count(
  p_school_id VARCHAR,
  p_user_id VARCHAR,
  p_role TEXT,
  p_class_ids TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.school_notices n
  WHERE n.school_id = p_school_id
    AND n.is_active = TRUE
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
$$;

REVOKE ALL ON FUNCTION schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
