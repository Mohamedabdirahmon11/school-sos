-- Additive performance indexes and aggregate dashboard functions. Safe to rerun.
-- Additional indexes for foreign-key joins and common school-scoped filters.
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_sessions_school ON user_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(class_teacher_id);
CREATE INDEX IF NOT EXISTS idx_students_branch ON students(school_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_timetable_subject ON timetable_slots(school_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(school_id, student_id, date);
CREATE INDEX IF NOT EXISTS idx_promotions_student ON promotions(school_id, student_id, academic_year_from);
CREATE INDEX IF NOT EXISTS idx_promotions_classes ON promotions(class_from_id, class_to_id);
CREATE INDEX IF NOT EXISTS idx_payments_recorder ON fee_payments(school_id, recorded_by);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON direct_messages(school_id, recipient_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_school ON school_events(school_id, start_date);
CREATE INDEX IF NOT EXISTS idx_tickets_creator ON support_tickets(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_admissions_class ON admission_applications(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_library_school ON library_books(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_school ON transport_routes(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON subscription_invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_date ON subscription_invoices(status, paid_date);


CREATE OR REPLACE FUNCTION school_dashboard_summary(p_school_id VARCHAR)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', (SELECT COUNT(*) FROM students WHERE school_id = p_school_id),
      'totalTeachers', (SELECT COUNT(*) FROM teachers WHERE school_id = p_school_id),
      'attendanceRate', CASE WHEN (SELECT COUNT(*) FROM students WHERE school_id = p_school_id) = 0 THEN 0
        ELSE ROUND((SELECT COUNT(*) FROM attendance_records WHERE school_id = p_school_id AND date = CURRENT_DATE AND status = 'present')::NUMERIC * 100
          / (SELECT COUNT(*) FROM students WHERE school_id = p_school_id)) END,
      'todayCollection', COALESCE((SELECT SUM(amount_paid) FROM fee_payments WHERE school_id = p_school_id AND date = CURRENT_DATE), 0),
      'totalOutstanding', COALESCE((SELECT SUM(remaining_amount) FROM fee_payments WHERE school_id = p_school_id), 0)
    ),
    'totalClasses', (SELECT COUNT(*) FROM classes WHERE school_id = p_school_id),
    'todayAttendance', (SELECT COUNT(*) FROM attendance_records WHERE school_id = p_school_id AND date = CURRENT_DATE AND status = 'present'),
    'recentStudents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'studentId', s.student_id, 'firstName', s.first_name,
      'middleName', s.middle_name, 'lastName', s.last_name, 'classId', s.class_id, 'admissionDate', s.admission_date)
      ORDER BY s.created_at DESC) FROM (SELECT * FROM students WHERE school_id = p_school_id ORDER BY created_at DESC LIMIT 5) s), '[]'::JSONB),
    'recentPayments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'studentId', p.student_id, 'receiptNumber', p.receipt_number,
      'academicYear', p.academic_year, 'month', p.month, 'feeType', p.fee_type, 'amountDue', p.amount_due, 'amountPaid', p.amount_paid,
      'remainingAmount', p.remaining_amount, 'paymentMethod', p.payment_method, 'status', p.status, 'date', p.date)
      ORDER BY p.date DESC, p.created_at DESC) FROM (SELECT * FROM fee_payments WHERE school_id = p_school_id ORDER BY date DESC, created_at DESC LIMIT 5) p), '[]'::JSONB),
    'notices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'content', n.content, 'audience', n.audience,
      'isPinned', n.is_pinned, 'publishDate', n.publish_date, 'authorName', n.author_name, 'authorRole', n.author_role)
      ORDER BY n.is_pinned DESC, n.publish_date DESC) FROM (SELECT * FROM school_notices WHERE school_id = p_school_id ORDER BY is_pinned DESC, publish_date DESC LIMIT 3) n), '[]'::JSONB)
  );
$$;
REVOKE ALL ON FUNCTION school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION school_dashboard_summary(VARCHAR) TO service_role;

CREATE OR REPLACE FUNCTION super_admin_dashboard_summary()
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalSchools', (SELECT COUNT(*) FROM schools),
      'totalStudents', (SELECT COUNT(*) FROM students),
      'currentMonthRevenue', COALESCE((SELECT SUM(amount) FROM subscription_invoices WHERE status = 'paid' AND paid_date >= date_trunc('month', CURRENT_DATE)), 0),
      'openTickets', (SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('resolved', 'closed'))
    ),
    'subscriptionCounts', jsonb_build_object(
      'active', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'active'),
      'trial', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'trial'),
      'grace', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'grace'),
      'read_only', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'read_only'),
      'suspended', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'suspended')
    ),
    'revenueTrend', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(month_start, 'YYYY-MM'), 'revenue', revenue) ORDER BY month_start)
      FROM (SELECT months.month_start, COALESCE(SUM(invoice.amount) FILTER (WHERE invoice.status = 'paid'), 0) AS revenue
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS months(month_start)
        LEFT JOIN subscription_invoices invoice ON date_trunc('month', invoice.paid_date) = months.month_start
        GROUP BY months.month_start) revenue_by_month), '[]'::JSONB),
    'needsAttention', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code,
      'plan', sub.plan, 'status', sub.status, 'validUntil', sub.valid_until)
      ORDER BY s.name) FROM schools s JOIN school_subscriptions sub ON sub.school_id = s.id
      WHERE sub.status IN ('grace', 'read_only', 'suspended')), '[]'::JSONB)
  );
$$;
REVOKE ALL ON FUNCTION super_admin_dashboard_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION super_admin_dashboard_summary() TO service_role;

NOTIFY pgrst, 'reload schema';
