-- Harden every application SECURITY DEFINER function against search_path shadowing.
-- All application tables and enum types are schema-qualified below.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_bulk_import(p_payload JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.classes (id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee)
  SELECT id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee
  FROM jsonb_to_recordset(COALESCE(p_payload->'classes', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, name VARCHAR, grade_level INTEGER,
    section VARCHAR, room_number VARCHAR, capacity INTEGER, monthly_fee NUMERIC
  );

  INSERT INTO public.students (id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    admission_date, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, status, pin_hash)
  SELECT id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    CURRENT_DATE, date_of_birth, student_phone, parent_phone, NULL, class_id, section, 'active', pin_hash
  FROM jsonb_to_recordset(COALESCE(p_payload->'students', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, student_id VARCHAR, first_name VARCHAR,
    middle_name VARCHAR, last_name VARCHAR, gender VARCHAR, date_of_birth DATE, student_phone VARCHAR,
    parent_phone VARCHAR, class_id VARCHAR, section VARCHAR, pin_hash TEXT
  );

  INSERT INTO public.users AS existing_user (id, school_id, branch_id, role, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, password_hash, is_blocked, failed_login_attempts)
  SELECT id, school_id, branch_id, role::public.user_role_enum, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, '', false, 0
  FROM jsonb_to_recordset(COALESCE(p_payload->'users', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, role VARCHAR, full_name VARCHAR, phone VARCHAR,
    parent_phone VARCHAR, student_id VARCHAR, linked_student_ids TEXT[], pin_hash TEXT
  )
  ON CONFLICT (id) DO UPDATE SET
    linked_student_ids = EXCLUDED.linked_student_ids,
    pin_hash = EXCLUDED.pin_hash,
    full_name = CASE WHEN existing_user.role = 'parent' AND existing_user.full_name = '' THEN EXCLUDED.full_name ELSE existing_user.full_name END;

  INSERT INTO public.audit_logs (id, action, category, school_id, school_name, user_id, user_name, user_role, details, severity)
  SELECT id, action, category, school_id, school_name, user_id, user_name, user_role::public.user_role_enum, details, 'info'
  FROM jsonb_to_recordset(COALESCE(p_payload->'audit_logs', '[]'::jsonb)) AS x(
    id VARCHAR, action VARCHAR, category VARCHAR, school_id VARCHAR, school_name VARCHAR,
    user_id VARCHAR, user_name VARCHAR, user_role VARCHAR, details TEXT
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.schoolos_save_subject_assignments(
  p_school_id VARCHAR, p_subject_id VARCHAR, p_assignments JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.class_subjects
  SET is_active = FALSE
  WHERE school_id = p_school_id AND subject_id = p_subject_id;

  INSERT INTO public.class_subjects (
    id, school_id, class_id, subject_id, teacher_id, periods_per_week,
    small_exam_enabled, big_exam_enabled, is_active
  )
  SELECT id, p_school_id, class_id, p_subject_id, teacher_id, periods_per_week,
    small_exam_enabled, big_exam_enabled, TRUE
  FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS a(
    id VARCHAR, class_id VARCHAR, teacher_id VARCHAR, periods_per_week INTEGER,
    small_exam_enabled BOOLEAN, big_exam_enabled BOOLEAN
  )
  ON CONFLICT (school_id, class_id, subject_id) DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id,
    periods_per_week = EXCLUDED.periods_per_week,
    small_exam_enabled = EXCLUDED.small_exam_enabled,
    big_exam_enabled = EXCLUDED.big_exam_enabled,
    is_active = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_dashboard_summary()
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalSchools', (SELECT COUNT(*) FROM public.schools),
      'totalStudents', (SELECT COUNT(*) FROM public.students),
      'currentMonthRevenue', COALESCE((
        SELECT SUM(amount) FROM public.subscription_invoices
        WHERE status = 'paid' AND paid_date >= date_trunc('month', CURRENT_DATE)
      ), 0),
      'openTickets', (SELECT COUNT(*) FROM public.support_tickets WHERE status NOT IN ('resolved', 'closed'))
    ),
    'subscriptionCounts', jsonb_build_object(
      'active', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'active'),
      'trial', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'trial'),
      'grace', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'grace'),
      'read_only', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'read_only'),
      'suspended', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'suspended')
    ),
    'revenueTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(month_start, 'YYYY-MM'), 'revenue', revenue) ORDER BY month_start)
      FROM (
        SELECT months.month_start, COALESCE(SUM(invoice.amount) FILTER (WHERE invoice.status = 'paid'), 0) AS revenue
        FROM generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS months(month_start)
        LEFT JOIN public.subscription_invoices invoice
          ON date_trunc('month', invoice.paid_date) = months.month_start
        GROUP BY months.month_start
      ) revenue_by_month
    ), '[]'::JSONB),
    'needsAttention', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'code', s.code,
        'plan', sub.plan, 'status', sub.status, 'validUntil', sub.valid_until
      ) ORDER BY s.name)
      FROM public.schools s
      JOIN public.school_subscriptions sub ON sub.school_id = s.id
      WHERE sub.status IN ('grace', 'read_only', 'suspended')
    ), '[]'::JSONB)
  );
$$;

-- These bodies already schema-qualify every application table.
ALTER FUNCTION public.school_dashboard_summary(VARCHAR) SET search_path = '';
ALTER FUNCTION public.schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) SET search_path = '';
ALTER FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) SET search_path = '';
ALTER FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) SET search_path = '';

REVOKE ALL ON FUNCTION public.schoolos_bulk_import(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.super_admin_dashboard_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.schoolos_bulk_import(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_dashboard_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
