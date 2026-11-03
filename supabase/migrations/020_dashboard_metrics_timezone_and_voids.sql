-- Correct school dashboard aggregates, timezone boundaries and notice visibility.
CREATE OR REPLACE FUNCTION public.school_dashboard_summary(p_school_id VARCHAR)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
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
              AND status = 'present'
          )::NUMERIC * 100
          / (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active')
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
        SELECT SUM(CASE WHEN voided_at IS NOT NULL THEN amount_due ELSE remaining_amount END)
        FROM public.fee_payments
        WHERE school_id = p_school_id
      ), 0)
    ),
    'totalClasses', (
      SELECT COUNT(*) FROM public.classes
      WHERE school_id = p_school_id AND is_archived = FALSE
    ),
    'todayAttendance', (
      SELECT COUNT(*)
      FROM public.attendance_records
      WHERE school_id = p_school_id
        AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        AND status = 'present'
    ),
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
