-- Aggregate teacher dashboard data inside PostgreSQL. The caller supplies
-- the school-scoped teacher profile resolved by the authenticated API route.
-- Existing response keys and assigned-class visibility are preserved.
CREATE OR REPLACE FUNCTION public.teacher_dashboard_summary(
  p_school_id character varying,
  p_teacher_id character varying
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH school_context AS (
    SELECT COALESCE(timezone, 'Africa/Addis_Ababa') AS timezone
    FROM public.schools
    WHERE id = p_school_id
  ),
  teacher_classes AS (
    SELECT DISTINCT assigned.class_id
    FROM (
      SELECT id, class_id
      FROM public.class_subjects
      WHERE school_id = p_school_id
        AND teacher_id = p_teacher_id
        AND is_active = TRUE
      ORDER BY id
      LIMIT 100
    ) AS assigned
  ),
  active_students AS (
    SELECT student.id, student.student_id, student.first_name,
           student.middle_name, student.last_name, student.class_id,
           student.admission_date, student.created_at
    FROM public.students AS student
    JOIN teacher_classes AS assigned ON assigned.class_id = student.class_id
    WHERE student.school_id = p_school_id
      AND student.status = 'active'
  ),
  attendance_today AS (
    SELECT attendance.id, attendance.student_id, attendance.status
    FROM public.attendance_records AS attendance
    JOIN active_students AS student ON student.id = attendance.student_id
    WHERE attendance.school_id = p_school_id
      AND attendance.date = (
        now() AT TIME ZONE COALESCE((SELECT timezone FROM school_context), 'Africa/Addis_Ababa')
      )::date
  ),
  attendance_totals AS (
    SELECT
      COUNT(*)::integer AS recorded,
      COUNT(*) FILTER (WHERE status::text IN ('present', 'late'))::integer AS attended,
      COUNT(*) FILTER (WHERE status::text = 'excused')::integer AS excused
    FROM attendance_today
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', (SELECT COUNT(*) FROM active_students),
      'totalTeachers', 1,
      'attendanceRate', CASE
        WHEN (SELECT COUNT(*) FROM active_students) = 0 THEN 0
        ELSE ROUND(
          (SELECT attended FROM attendance_totals)::numeric * 100
          / GREATEST(1, (SELECT COUNT(*) FROM active_students) - (SELECT excused FROM attendance_totals))
        )
      END
    ),
    'totalClasses', (SELECT COUNT(*) FROM teacher_classes),
    'attendanceRecordedToday', (SELECT recorded FROM attendance_totals),
    'todayAttendance', (SELECT attended FROM attendance_totals),
    'recentStudents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'studentId', recent.student_id,
        'firstName', recent.first_name,
        'middleName', recent.middle_name,
        'lastName', recent.last_name,
        'classId', recent.class_id,
        'admissionDate', recent.admission_date
      ) ORDER BY recent.created_at DESC)
      FROM (
        SELECT * FROM active_students
        ORDER BY created_at DESC
        LIMIT 5
      ) AS recent
    ), '[]'::jsonb),
    'notices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', notice.id,
        'title', notice.title,
        'content', notice.content,
        'audience', notice.audience,
        'classId', notice.class_id,
        'isPinned', notice.is_pinned,
        'publishDate', notice.publish_date,
        'authorName', notice.author_name,
        'authorRole', notice.author_role
      ) ORDER BY notice.id)
      FROM (
        SELECT id, title, content, audience, class_id, is_pinned,
               publish_date, author_name, author_role
        FROM (
          SELECT id, title, content, audience, class_id, is_pinned,
                 publish_date, author_name, author_role
          FROM public.school_notices
          WHERE school_id = p_school_id AND is_active = TRUE
          ORDER BY id
          LIMIT 100
        ) AS first_page
        WHERE first_page.publish_date <= (
          now() AT TIME ZONE COALESCE((SELECT timezone FROM school_context), 'Africa/Addis_Ababa')
        )::date
          AND (
            first_page.class_id IS NULL
            OR EXISTS (SELECT 1 FROM teacher_classes WHERE teacher_classes.class_id = first_page.class_id)
          )
        ORDER BY id
        LIMIT 3
      ) AS notice
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.teacher_dashboard_summary(character varying, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_dashboard_summary(character varying, character varying)
  TO service_role;
