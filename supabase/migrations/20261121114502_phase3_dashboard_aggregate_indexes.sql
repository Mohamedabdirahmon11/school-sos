-- These indexes were applied to the active Supabase project in migration
-- 20261121114502_phase3_dashboard_aggregate_indexes. Keep the source migration
-- in version control so fresh environments receive the same additive indexes.
CREATE INDEX IF NOT EXISTS idx_attendance_school_date_status_class_student
  ON public.attendance_records (school_id, date, status, class_id, student_id);

CREATE INDEX IF NOT EXISTS idx_fee_payments_school_date_voided
  ON public.fee_payments (school_id, date, voided_at);

CREATE INDEX IF NOT EXISTS idx_fee_payments_school_student_date
  ON public.fee_payments (school_id, student_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_students_school_class_status_student
  ON public.students (school_id, class_id, status, student_id);

CREATE INDEX IF NOT EXISTS idx_teachers_school_status
  ON public.teachers (school_id, status);
