-- Reduce repeated school, student, timezone and attendance scans in the
-- existing dashboard RPC. Response keys, finance fields, timezone semantics,
-- active-student rules, and service-role-only execution remain unchanged.
-- Additive function replacement; no table rows, policies or permissions are broadened.
-- Additive and idempotent: supports the school-scoped non-voided payment
-- aggregate and recent-payment ordering used by this dashboard RPC.
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_voided_date
  ON public.fee_payments (school_id, voided_at, date DESC, created_at DESC);


CREATE OR REPLACE FUNCTION public.school_dashboard_summary(p_school_id character varying)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH school_context AS MATERIALIZED (
    SELECT COALESCE(timezone, 'Africa/Addis_Ababa') AS timezone
    FROM public.schools
    WHERE id = p_school_id
  ),
  today AS MATERIALIZED (
    SELECT (
      now() AT TIME ZONE COALESCE(
        (SELECT timezone FROM school_context),
        'Africa/Addis_Ababa'
      )
    )::date AS day_date
  ),
  active_students AS MATERIALIZED (
    SELECT id, student_id, first_name, middle_name, last_name,
           class_id, admission_date, created_at
    FROM public.students
    WHERE school_id = p_school_id
      AND status = 'active'
  ),
  student_totals AS (
    SELECT COUNT(*)::integer AS total
    FROM active_students
  ),
  teacher_totals AS (
    SELECT COUNT(*)::integer AS total
    FROM public.teachers
    WHERE school_id = p_school_id
      AND status = 'active'
  ),
  class_totals AS (
    SELECT COUNT(*)::integer AS total
    FROM public.classes
    WHERE school_id = p_school_id
      AND is_archived = FALSE
  ),
  today_attendance AS MATERIALIZED (
    SELECT attendance.id, attendance.student_id, attendance.status
    FROM public.attendance_records AS attendance
    JOIN active_students AS student
      ON student.id = attendance.student_id
    WHERE attendance.school_id = p_school_id
      AND attendance.date = (SELECT day_date FROM today)
  ),
  attendance_totals AS (
    SELECT
      COUNT(*)::integer AS recorded,
      COUNT(*) FILTER (WHERE status IN ('present', 'late'))::integer AS attended,
      COUNT(*) FILTER (WHERE status = 'excused')::integer AS excused
    FROM today_attendance
  ),
  attendance_trend AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'date', daily.day_date,
        'day', to_char(daily.day_date, 'Dy'),
        'rate', CASE
          WHEN daily.active_students - daily.excused <= 0 THEN 0
          ELSE ROUND(
            daily.attended::numeric * 100
            / GREATEST(1, daily.active_students - daily.excused)
          )
        END
      ) ORDER BY daily.day_date),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT
        day_range.day_date,
        student_totals.total AS active_students,
        COUNT(attendance.id) FILTER (
          WHERE active_student.id IS NOT NULL
            AND attendance.status IN ('present', 'late')
        )::integer AS attended,
        COUNT(attendance.id) FILTER (
          WHERE active_student.id IS NOT NULL
            AND attendance.status = 'excused'
        )::integer AS excused
      FROM (
        SELECT today.day_date - offsets.day_offset AS day_date
        FROM today
        CROSS JOIN generate_series(0, 6) AS offsets(day_offset)
      ) AS day_range
      CROSS JOIN student_totals
      LEFT JOIN public.attendance_records AS attendance
        ON attendance.school_id = p_school_id
       AND attendance.date = day_range.day_date
      LEFT JOIN active_students AS active_student
        ON active_student.id = attendance.student_id
      GROUP BY day_range.day_date, student_totals.total
      HAVING COUNT(attendance.id) FILTER (
        WHERE active_student.id IS NOT NULL
      ) > 0
    ) AS daily
  ),
  absent_students AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', student.id,
        'studentId', student.student_id,
        'name', concat_ws(
          ' ',
          student.first_name,
          NULLIF(student.middle_name, ''),
          student.last_name
        ),
        'className', COALESCE(class_row.name, 'Class not assigned')
      ) ORDER BY
        class_row.grade_level NULLS LAST,
        class_row.name,
        student.last_name,
        student.first_name
      ),
      '[]'::jsonb
    ) AS value
    FROM today_attendance AS attendance
    JOIN active_students AS student
      ON student.id = attendance.student_id
    LEFT JOIN public.classes AS class_row
      ON class_row.id = student.class_id
     AND class_row.school_id = p_school_id
    WHERE attendance.status = 'absent'
  ),
  payments AS (
    SELECT
      COALESCE(SUM(amount_paid) FILTER (
        WHERE date = (SELECT day_date FROM today)
      ), 0) AS today_collection,
      COALESCE(SUM(remaining_amount), 0) AS total_outstanding
    FROM public.fee_payments
    WHERE school_id = p_school_id
      AND voided_at IS NULL
  ),
  recent_students AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'studentId', recent.student_id,
        'firstName', recent.first_name,
        'middleName', recent.middle_name,
        'lastName', recent.last_name,
        'classId', recent.class_id,
        'admissionDate', recent.admission_date
      ) ORDER BY recent.created_at DESC),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT id, student_id, first_name, middle_name, last_name,
             class_id, admission_date, created_at
      FROM public.students
      WHERE school_id = p_school_id
      ORDER BY created_at DESC
      LIMIT 5
    ) AS recent
  ),
  recent_payments AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'studentId', recent.student_id,
        'receiptNumber', recent.receipt_number,
        'academicYear', recent.academic_year,
        'month', recent.month,
        'feeType', recent.fee_type,
        'amountDue', recent.amount_due,
        'amountPaid', recent.amount_paid,
        'remainingAmount', recent.remaining_amount,
        'paymentMethod', recent.payment_method,
        'status', recent.status,
        'date', recent.date
      ) ORDER BY recent.date DESC, recent.created_at DESC),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT id, student_id, receipt_number, academic_year, month,
             fee_type, amount_due, amount_paid, remaining_amount,
             payment_method, status, date, created_at
      FROM public.fee_payments
      WHERE school_id = p_school_id
        AND voided_at IS NULL
      ORDER BY date DESC, created_at DESC
      LIMIT 5
    ) AS recent
  ),
  notices AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'title', recent.title,
        'content', recent.content,
        'audience', recent.audience,
        'isPinned', recent.is_pinned,
        'publishDate', recent.publish_date,
        'authorName', recent.author_name,
        'authorRole', recent.author_role
      ) ORDER BY recent.is_pinned DESC, recent.publish_date DESC),
      '[]'::jsonb
    ) AS value
    FROM (
      SELECT id, title, content, audience, is_pinned,
             publish_date, author_name, author_role
      FROM public.school_notices
      WHERE school_id = p_school_id
        AND is_active = TRUE
        AND publish_date <= (SELECT day_date FROM today)
      ORDER BY is_pinned DESC, publish_date DESC
      LIMIT 3
    ) AS recent
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', student_totals.total,
      'totalTeachers', teacher_totals.total,
      'attendanceRate', CASE
        WHEN student_totals.total = 0 THEN 0
        ELSE ROUND(
          attendance_totals.attended::numeric * 100
          / GREATEST(1, student_totals.total - attendance_totals.excused)
        )
      END,
      'todayCollection', payments.today_collection,
      'totalOutstanding', payments.total_outstanding
    ),
    'totalClasses', class_totals.total,
    'attendanceRecordedToday', attendance_totals.recorded,
    'todayAttendance', attendance_totals.attended,
    'attendanceTrend', attendance_trend.value,
    'absentStudents', absent_students.value,
    'recentStudents', recent_students.value,
    'recentPayments', recent_payments.value,
    'notices', notices.value
  )
  FROM student_totals
  CROSS JOIN teacher_totals
  CROSS JOIN class_totals
  CROSS JOIN attendance_totals
  CROSS JOIN attendance_trend
  CROSS JOIN absent_students
  CROSS JOIN payments
  CROSS JOIN recent_students
  CROSS JOIN recent_payments
  CROSS JOIN notices;
$function$;

REVOKE ALL ON FUNCTION public.school_dashboard_summary(character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(character varying)
  TO service_role;

NOTIFY pgrst, 'reload schema';


-- Reduce teacher dashboard SQL planning work while preserving the existing JSON contract.
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
  WITH params AS MATERIALIZED (
    SELECT
      args.school_id,
      args.teacher_id,
      teacher.user_id,
      COALESCE(school.timezone, 'Africa/Addis_Ababa') AS timezone
    FROM (SELECT p_school_id AS school_id, p_teacher_id AS teacher_id) AS args
    LEFT JOIN public.teachers AS teacher
      ON teacher.id = args.teacher_id
     AND teacher.school_id = args.school_id
    LEFT JOIN public.schools AS school
      ON school.id = args.school_id
  ),
  teacher_classes AS MATERIALIZED (
    SELECT class_subject.class_id
    FROM public.class_subjects AS class_subject
    CROSS JOIN params
    WHERE class_subject.school_id = params.school_id
      AND class_subject.teacher_id = params.teacher_id
      AND class_subject.is_active = TRUE
    UNION
    SELECT class.id AS class_id
    FROM public.classes AS class
    CROSS JOIN params
    WHERE class.school_id = params.school_id
      AND class.class_teacher_id = params.user_id
  ),
  active_students AS MATERIALIZED (
    SELECT
      student.id,
      student.student_id,
      student.first_name,
      student.middle_name,
      student.last_name,
      student.class_id,
      student.admission_date,
      student.created_at
    FROM public.students AS student
    JOIN teacher_classes AS assigned
      ON assigned.class_id = student.class_id
    CROSS JOIN params
    WHERE student.school_id = params.school_id
      AND student.status = 'active'
  ),
  attendance_today AS MATERIALIZED (
    SELECT attendance.student_id, attendance.status
    FROM public.attendance_records AS attendance
    JOIN active_students AS student
      ON student.id = attendance.student_id
    CROSS JOIN params
    WHERE attendance.school_id = params.school_id
      AND attendance.date = (now() AT TIME ZONE params.timezone)::date
  ),
  attendance_totals AS (
    SELECT
      COUNT(*)::integer AS recorded,
      COUNT(*) FILTER (WHERE status::text IN ('present', 'late'))::integer AS attended,
      COUNT(*) FILTER (WHERE status::text = 'excused')::integer AS excused
    FROM attendance_today
  ),
  dashboard_counts AS (
    SELECT
      (SELECT COUNT(*)::integer FROM active_students) AS total_students,
      (SELECT COUNT(*)::integer FROM teacher_classes) AS total_classes,
      (
        SELECT COUNT(*)::integer
        FROM public.timetable_slots AS slot
        CROSS JOIN params
        WHERE slot.school_id = params.school_id
          AND slot.teacher_id = params.teacher_id
          AND slot.is_active = TRUE
      ) AS total_periods,
      (
        SELECT COUNT(*)::integer
        FROM public.assignments AS assignment
        CROSS JOIN params
        WHERE assignment.school_id = params.school_id
          AND assignment.teacher_id = params.user_id
          AND assignment.due_date >= (now() AT TIME ZONE params.timezone)::date
      ) AS open_homework
  ),
  recent_students AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', recent.id,
      'studentId', recent.student_id,
      'firstName', recent.first_name,
      'middleName', recent.middle_name,
      'lastName', recent.last_name,
      'classId', recent.class_id,
      'admissionDate', recent.admission_date
    ) ORDER BY recent.created_at DESC) AS items
    FROM (
      SELECT id, student_id, first_name, middle_name, last_name,
             class_id, admission_date, created_at
      FROM active_students
      ORDER BY created_at DESC
      LIMIT 5
    ) AS recent
  ),
  notice_items AS (
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
    ) ORDER BY notice.id) AS items
    FROM (
      SELECT
        school_notice.id,
        school_notice.title,
        school_notice.content,
        school_notice.audience,
        school_notice.class_id,
        school_notice.is_pinned,
        school_notice.publish_date,
        school_notice.author_name,
        school_notice.author_role
      FROM public.school_notices AS school_notice
      CROSS JOIN params
      WHERE school_notice.school_id = params.school_id
        AND school_notice.is_active = TRUE
        AND school_notice.publish_date <= (now() AT TIME ZONE params.timezone)::date
        AND (
          school_notice.class_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM teacher_classes
            WHERE teacher_classes.class_id = school_notice.class_id
          )
        )
      ORDER BY school_notice.id
      LIMIT 3
    ) AS notice
  )
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', dashboard_counts.total_students,
      'totalTeachers', 1,
      'attendanceRate', CASE
        WHEN dashboard_counts.total_students = 0 THEN 0
        ELSE ROUND(
          attendance_totals.attended::numeric * 100
          / GREATEST(1, dashboard_counts.total_students - attendance_totals.excused)
        )
      END
    ),
    'totalClasses', dashboard_counts.total_classes,
    'totalPeriodsPerWeek', dashboard_counts.total_periods,
    'openHomeworkCount', dashboard_counts.open_homework,
    'attendanceRecordedToday', attendance_totals.recorded,
    'todayAttendance', attendance_totals.attended,
    'recentStudents', COALESCE(recent_students.items, '[]'::jsonb),
    'notices', COALESCE(notice_items.items, '[]'::jsonb)
  )
  FROM params
  CROSS JOIN dashboard_counts
  CROSS JOIN attendance_totals
  CROSS JOIN recent_students
  CROSS JOIN notice_items;
$function$;

REVOKE ALL ON FUNCTION public.teacher_dashboard_summary(character varying, character varying)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_dashboard_summary(character varying, character varying)
  TO service_role;
