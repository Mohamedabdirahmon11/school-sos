-- Phase 3 quality: school-scoped dashboard aggregates and common filter indexes.
-- Additive and rerunnable. Existing rows and dashboard RPC grants are preserved.

CREATE INDEX IF NOT EXISTS idx_students_school_class_status_student
  ON public.students (school_id, class_id, status, student_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_status
  ON public.teachers (school_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date_status_class_student
  ON public.attendance_records (school_id, date, status, class_id, student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_date_voided
  ON public.fee_payments (school_id, date, voided_at);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school_student_date
  ON public.fee_payments (school_id, student_id, date DESC);

CREATE OR REPLACE FUNCTION public.school_dashboard_summary(p_school_id VARCHAR)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
        WHEN (
          SELECT COUNT(*) FROM public.students
          WHERE school_id = p_school_id AND status = 'active'
        ) = 0 THEN 0
        ELSE ROUND(
          (
            SELECT COUNT(*)
            FROM public.attendance_records
            WHERE school_id = p_school_id
              AND date = (now() AT TIME ZONE COALESCE(
                (SELECT timezone FROM public.schools WHERE id = p_school_id),
                'Africa/Addis_Ababa'
              ))::date
              AND status IN ('present', 'late')
          )::NUMERIC * 100
          / GREATEST(1, (
            SELECT COUNT(*) FROM public.students
            WHERE school_id = p_school_id AND status = 'active'
          ) - (
            SELECT COUNT(*)
            FROM public.attendance_records
            WHERE school_id = p_school_id
              AND date = (now() AT TIME ZONE COALESCE(
                (SELECT timezone FROM public.schools WHERE id = p_school_id),
                'Africa/Addis_Ababa'
              ))::date
              AND status = 'excused'
          ))
        )
      END,
      'todayCollection', COALESCE((
        SELECT SUM(amount_paid)
        FROM public.fee_payments
        WHERE school_id = p_school_id
          AND date = (now() AT TIME ZONE COALESCE(
            (SELECT timezone FROM public.schools WHERE id = p_school_id),
            'Africa/Addis_Ababa'
          ))::date
          AND voided_at IS NULL
      ), 0),
      'totalOutstanding', COALESCE((
        SELECT SUM(CASE WHEN voided_at IS NOT NULL THEN amount_due ELSE remaining_amount END)
        FROM public.fee_payments
        WHERE school_id = p_school_id
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
        AND date = (now() AT TIME ZONE COALESCE(
          (SELECT timezone FROM public.schools WHERE id = p_school_id),
          'Africa/Addis_Ababa'
        ))::date
    ),
    'todayAttendance', (
      SELECT COUNT(*)
      FROM public.attendance_records
      WHERE school_id = p_school_id
        AND date = (now() AT TIME ZONE COALESCE(
          (SELECT timezone FROM public.schools WHERE id = p_school_id),
          'Africa/Addis_Ababa'
        ))::date
        AND status IN ('present', 'late')
    ),
    'recentStudents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'studentId', s.student_id, 'firstName', s.first_name,
        'middleName', s.middle_name, 'lastName', s.last_name, 'classId', s.class_id,
        'admissionDate', s.admission_date
      ) ORDER BY s.created_at DESC)
      FROM (
        SELECT id, student_id, first_name, middle_name, last_name, class_id, admission_date, created_at
        FROM public.students
        WHERE school_id = p_school_id AND status = 'active'
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
        SELECT id, student_id, receipt_number, academic_year, month, fee_type,
          amount_due, amount_paid, remaining_amount, payment_method, status, date, created_at
        FROM public.fee_payments
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
        SELECT id, title, content, audience, is_pinned, publish_date, author_name, author_role
        FROM public.school_notices
        WHERE school_id = p_school_id
          AND is_active = TRUE
          AND publish_date <= (now() AT TIME ZONE COALESCE(
            (SELECT timezone FROM public.schools WHERE id = p_school_id),
            'Africa/Addis_Ababa'
          ))::date
        ORDER BY is_pinned DESC, publish_date DESC
        LIMIT 3
      ) n
    ), '[]'::JSONB)
  );
$function$;

REVOKE ALL ON FUNCTION public.school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
