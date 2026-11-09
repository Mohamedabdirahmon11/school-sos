-- Supply the School Admin dashboard with real, school-scoped attendance history
-- and today's absent students. No application records are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.school_dashboard_summary(p_school_id character varying)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', (
        SELECT COUNT(*) FROM public.students
        WHERE school_id = p_school_id AND status = 'active'
      ),
      'totalTeachers', (
        SELECT COUNT(*) FROM public.teachers
        WHERE school_id = p_school_id AND status = 'active'
      ),
      'attendanceRate', CASE
        WHEN (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active') = 0 THEN 0
        ELSE ROUND(
          (
            SELECT COUNT(*)
            FROM public.attendance_records
            WHERE school_id = p_school_id
              AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
              AND status IN ('present', 'late')
              AND EXISTS (
                SELECT 1 FROM public.students AS active_student
                WHERE active_student.id = public.attendance_records.student_id
                  AND active_student.school_id = p_school_id
                  AND active_student.status = 'active'
              )
          )::NUMERIC * 100
          / GREATEST(1,
            (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active')
            - (SELECT COUNT(*) FROM public.attendance_records
               WHERE school_id = p_school_id
                 AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
                 AND status = 'excused'
                 AND EXISTS (
                   SELECT 1 FROM public.students AS active_student
                   WHERE active_student.id = public.attendance_records.student_id
                     AND active_student.school_id = p_school_id
                     AND active_student.status = 'active'
                 )))
        )
      END,
      'todayCollection', COALESCE((
        SELECT SUM(amount_paid)
        FROM public.fee_payments
        WHERE school_id = p_school_id
          AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
          AND voided_at IS NULL
      ), 0),
      'totalOutstanding', COALESCE((
        SELECT SUM(remaining_amount)
        FROM public.fee_payments
        WHERE school_id = p_school_id AND voided_at IS NULL
      ), 0)
    ),
    'totalClasses', (
      SELECT COUNT(*) FROM public.classes
      WHERE school_id = p_school_id AND is_archived = FALSE
    ),
    'attendanceRecordedToday', (
      SELECT COUNT(*)
      FROM public.attendance_records
      WHERE school_id = p_school_id
        AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        AND EXISTS (
          SELECT 1 FROM public.students AS active_student
          WHERE active_student.id = public.attendance_records.student_id
            AND active_student.school_id = p_school_id
            AND active_student.status = 'active'
        )
    ),
    'todayAttendance', (
      SELECT COUNT(*)
      FROM public.attendance_records
      WHERE school_id = p_school_id
        AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        AND status IN ('present', 'late')
        AND EXISTS (
          SELECT 1 FROM public.students AS active_student
          WHERE active_student.id = public.attendance_records.student_id
            AND active_student.school_id = p_school_id
            AND active_student.status = 'active'
        )
    ),
    'attendanceTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', daily.day_date,
        'day', to_char(daily.day_date, 'Dy'),
        'rate', CASE
          WHEN daily.active_students - daily.excused <= 0 THEN 0
          ELSE ROUND(daily.attended::NUMERIC * 100 / GREATEST(1, daily.active_students - daily.excused))
        END
      ) ORDER BY daily.day_date)
      FROM (
        SELECT
          day_range.day_date,
          (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active')::INTEGER AS active_students,
          COUNT(ar.id) FILTER (
            WHERE active_student.id IS NOT NULL AND ar.status IN ('present', 'late')
          )::INTEGER AS attended,
          COUNT(ar.id) FILTER (
            WHERE active_student.id IS NOT NULL AND ar.status = 'excused'
          )::INTEGER AS excused
        FROM (
          SELECT (
            (now() AT TIME ZONE COALESCE(
              (SELECT timezone FROM public.schools WHERE id = p_school_id),
              'Africa/Addis_Ababa'
            ))::date - offsets.day_offset
          ) AS day_date
          FROM generate_series(0, 6) AS offsets(day_offset)
        ) AS day_range
        LEFT JOIN public.attendance_records AS ar
          ON ar.school_id = p_school_id
         AND ar.date = day_range.day_date
        LEFT JOIN public.students AS active_student
          ON active_student.id = ar.student_id
         AND active_student.school_id = p_school_id
         AND active_student.status = 'active'
        GROUP BY day_range.day_date
        HAVING COUNT(ar.id) FILTER (WHERE active_student.id IS NOT NULL) > 0
      ) AS daily
    ), '[]'::JSONB),
    'absentStudents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', student.id,
        'studentId', student.student_id,
        'name', concat_ws(' ', student.first_name, NULLIF(student.middle_name, ''), student.last_name),
        'className', COALESCE(class_row.name, 'Class not assigned')
      ) ORDER BY class_row.grade_level NULLS LAST, class_row.name, student.last_name, student.first_name)
      FROM public.attendance_records AS attendance
      JOIN public.students AS student
        ON student.id = attendance.student_id
       AND student.school_id = attendance.school_id
       AND student.status = 'active'
      LEFT JOIN public.classes AS class_row
        ON class_row.id = student.class_id
       AND class_row.school_id = p_school_id
      WHERE attendance.school_id = p_school_id
        AND attendance.date = (now() AT TIME ZONE COALESCE(
          (SELECT timezone FROM public.schools WHERE id = p_school_id),
          'Africa/Addis_Ababa'
        ))::date
        AND attendance.status = 'absent'
    ), '[]'::JSONB),
    'recentStudents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'studentId', s.student_id, 'firstName', s.first_name,
        'middleName', s.middle_name, 'lastName', s.last_name, 'classId', s.class_id,
        'admissionDate', s.admission_date
      ) ORDER BY s.created_at DESC)
      FROM (
        SELECT * FROM public.students
        WHERE school_id = p_school_id
        ORDER BY created_at DESC
        LIMIT 5
      ) s
    ), '[]'::JSONB),
    'recentPayments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'studentId', p.student_id, 'receiptNumber', p.receipt_number,
        'academicYear', p.academic_year, 'month', p.month, 'feeType', p.fee_type,
        'amountDue', p.amount_due, 'amountPaid', p.amount_paid,
        'remainingAmount', p.remaining_amount, 'paymentMethod', p.payment_method,
        'status', p.status, 'date', p.date
      ) ORDER BY p.date DESC, p.created_at DESC)
      FROM (
        SELECT * FROM public.fee_payments
        WHERE school_id = p_school_id AND voided_at IS NULL
        ORDER BY date DESC, created_at DESC
        LIMIT 5
      ) p
    ), '[]'::JSONB),
    'notices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'content', n.content, 'audience', n.audience,
        'isPinned', n.is_pinned, 'publishDate', n.publish_date,
        'authorName', n.author_name, 'authorRole', n.author_role
      ) ORDER BY n.is_pinned DESC, n.publish_date DESC)
      FROM (
        SELECT * FROM public.school_notices
        WHERE school_id = p_school_id
          AND is_active = TRUE
          AND publish_date <= (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        ORDER BY is_pinned DESC, publish_date DESC
        LIMIT 3
      ) n
    ), '[]'::JSONB)
  );
$function$;

REVOKE ALL ON FUNCTION public.school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
