-- Consolidate the school reports summary into one school-scoped SQL round trip.
-- Preserve the existing JSON response contract and role-gate finance data in the API.
CREATE OR REPLACE FUNCTION public.schoolos_school_reports_summary(
  p_school_id character varying,
  p_academic_year character varying,
  p_include_finance boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH active_students AS MATERIALIZED (
    SELECT id, class_id
    FROM public.students
    WHERE school_id = p_school_id
      AND status = 'active'
  ),
  active_teachers AS MATERIALIZED (
    SELECT id
    FROM public.teachers
    WHERE school_id = p_school_id
      AND status = 'active'
  ),
  class_enrollment AS (
    SELECT
      class_row.id AS class_id,
      class_row.name AS class_name,
      class_row.grade_level,
      class_row.section,
      COUNT(student.id)::integer AS student_count
    FROM public.classes AS class_row
    LEFT JOIN active_students AS student
      ON student.class_id = class_row.id
    WHERE class_row.school_id = p_school_id
      AND class_row.is_archived = false
    GROUP BY class_row.id, class_row.name, class_row.grade_level, class_row.section
  ),
  exam_pass_mark AS (
    SELECT COALESCE((
      SELECT NULLIF(config.pass_mark_percentage, 0)
      FROM public.exam_configs AS config
      WHERE config.school_id = p_school_id
        AND config.academic_year = p_academic_year
      LIMIT 1
    ), 50)::numeric AS value
  ),
  mark_totals AS (
    SELECT
      COUNT(*)::integer AS total,
      COUNT(*) FILTER (WHERE mark.percentage >= exam_pass_mark.value)::integer AS passed
    FROM public.student_marks AS mark
    CROSS JOIN exam_pass_mark
    WHERE mark.school_id = p_school_id
      AND mark.academic_year = p_academic_year
      AND mark.status = 'approved'
  ),
  dashboard AS (
    SELECT public.school_dashboard_summary(p_school_id) AS value
  ),
  payment_totals AS (
    SELECT
      COUNT(*)::integer AS payment_count,
      COALESCE(SUM(payment.amount_due), 0) AS total_due,
      COALESCE(SUM(payment.amount_paid), 0) AS total_collected,
      COALESCE(SUM(payment.remaining_amount), 0) AS total_arrears
    FROM public.fee_payments AS payment
    WHERE p_include_finance
      AND payment.school_id = p_school_id
      AND payment.voided_at IS NULL
  ),
  recent_payments AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', recent.id,
      'schoolId', recent.school_id,
      'studentId', recent.student_id,
      'receiptNumber', recent.receipt_number,
      'referenceNumber', recent.reference_number,
      'academicYear', recent.academic_year,
      'month', recent.month,
      'feeType', recent.fee_type,
      'feeStructureId', recent.fee_structure_id,
      'idempotencyKey', recent.idempotency_key,
      'amountDue', recent.amount_due,
      'amountPaid', recent.amount_paid,
      'remainingAmount', recent.remaining_amount,
      'paymentMethod', recent.payment_method,
      'status', recent.status,
      'date', recent.date,
      'recordedBy', recent.recorded_by,
      'notes', recent.notes,
      'voidedAt', recent.voided_at,
      'voidedBy', recent.voided_by,
      'voidReason', recent.void_reason,
      'idempotencyKeys', recent.idempotency_keys,
      'createdAt', recent.created_at
    ) ORDER BY recent.date DESC, recent.created_at DESC), '[]'::jsonb) AS value
    FROM (
      SELECT *
      FROM public.fee_payments
      WHERE p_include_finance
        AND school_id = p_school_id
        AND voided_at IS NULL
      ORDER BY date DESC, created_at DESC
      LIMIT 20
    ) AS recent
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*)::integer FROM active_students) AS student_count,
      (SELECT COUNT(*)::integer FROM active_teachers) AS teacher_count
  )
  SELECT
    jsonb_build_object(
      'studentCount', counts.student_count,
      'teacherCount', counts.teacher_count,
      'studentTeacherRatio', CASE
        WHEN counts.teacher_count = 0 THEN NULL
        ELSE ROUND(counts.student_count::numeric / counts.teacher_count, 1)
      END,
      'classEnrollment', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'classId', item.class_id,
          'className', item.class_name,
          'gradeLevel', item.grade_level,
          'section', item.section,
          'studentCount', item.student_count
        ) ORDER BY NULLIF(regexp_replace(COALESCE(item.grade_level::text, ''), '[^0-9].*$', ''), '')::numeric NULLS LAST,
          item.class_name)
        FROM class_enrollment AS item
      ), '[]'::jsonb),
      'attendanceRate', COALESCE((dashboard.value->'stats'->>'attendanceRate')::numeric, 0),
      'passRate', CASE
        WHEN mark_totals.total = 0 THEN NULL
        ELSE ROUND(mark_totals.passed::numeric * 100 / mark_totals.total)
      END
    )
    ||
    CASE WHEN p_include_finance THEN jsonb_build_object(
      'totalDue', payment_totals.total_due,
      'totalCollected', payment_totals.total_collected,
      'totalArrears', payment_totals.total_arrears,
      'paymentCount', payment_totals.payment_count,
      'recentPayments', recent_payments.value
    ) ELSE '{}'::jsonb END
  FROM counts
  CROSS JOIN mark_totals
  CROSS JOIN dashboard
  CROSS JOIN payment_totals
  CROSS JOIN recent_payments;
$function$;

REVOKE ALL ON FUNCTION public.schoolos_school_reports_summary(character varying, character varying, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_school_reports_summary(character varying, character varying, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';
