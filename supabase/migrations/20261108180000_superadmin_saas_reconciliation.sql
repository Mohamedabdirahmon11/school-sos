-- Reconcile the live Supabase schema with the checked-in source snapshot and
-- correct Super Admin billing metrics and platform broadcast delivery.
BEGIN;

ALTER TABLE public.super_admin_settings
  ALTER COLUMN platform_currency SET DEFAULT 'ETB';

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS calendar_type VARCHAR(20) NOT NULL DEFAULT 'ethiopian';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.schools'::regclass AND conname = 'schools_calendar_type_check') THEN
    ALTER TABLE public.schools ADD CONSTRAINT schools_calendar_type_check
      CHECK (calendar_type IN ('ethiopian', 'gregorian'));
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.users'::regclass AND conname = 'users_auth_user_id_fkey') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uidx
  ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.teacher_unavailability
  ADD COLUMN IF NOT EXISTS shift SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public.teacher_unavailability
  DROP CONSTRAINT IF EXISTS teacher_unavailability_period_number_check;
ALTER TABLE public.teacher_unavailability
  ADD CONSTRAINT teacher_unavailability_period_number_check CHECK (period_number BETWEEN 1 AND 8);
DO $$
DECLARE old_constraint TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.teacher_unavailability'::regclass AND conname = 'teacher_unavailability_shift_check') THEN
    ALTER TABLE public.teacher_unavailability ADD CONSTRAINT teacher_unavailability_shift_check CHECK (shift IN (1, 2));
  END IF;
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.teacher_unavailability'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (school_id, teacher_id, day_of_week, period_number)'
  LOOP
    EXECUTE format('ALTER TABLE public.teacher_unavailability DROP CONSTRAINT %I', old_constraint);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.teacher_unavailability'::regclass AND conname = 'teacher_unavailability_school_teacher_day_period_shift_key') THEN
    ALTER TABLE public.teacher_unavailability ADD CONSTRAINT teacher_unavailability_school_teacher_day_period_shift_key
      UNIQUE (school_id, teacher_id, day_of_week, period_number, shift);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_teacher_unavailability_shift_scope
  ON public.teacher_unavailability(school_id, teacher_id, shift, day_of_week);

ALTER TABLE public.fee_structures
  ADD COLUMN IF NOT EXISTS class_id VARCHAR(64);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fee_structures'::regclass AND conname = 'fee_structures_class_id_fkey') THEN
    ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_class_id_fkey
      FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
  END IF;
END $$;
ALTER TABLE public.fee_structures DROP CONSTRAINT IF EXISTS fee_structures_min_grade_check;
ALTER TABLE public.fee_structures DROP CONSTRAINT IF EXISTS fee_structures_max_grade_check;
ALTER TABLE public.fee_structures
  ADD CONSTRAINT fee_structures_min_grade_check CHECK (min_grade BETWEEN 0 AND 12),
  ADD CONSTRAINT fee_structures_max_grade_check CHECK (max_grade BETWEEN 0 AND 12);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON public.fee_structures(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class_id ON public.fee_structures(class_id);

ALTER TABLE public.report_card_templates
  ADD COLUMN IF NOT EXISTS own_design_image_url TEXT;

ALTER TABLE public.communication_settings
  ADD COLUMN IF NOT EXISTS default_channel VARCHAR(20) NOT NULL DEFAULT 'sms';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.communication_settings'::regclass AND conname = 'communication_settings_default_channel_check') THEN
    ALTER TABLE public.communication_settings ADD CONSTRAINT communication_settings_default_channel_check
      CHECK (default_channel IN ('sms', 'whatsapp'));
  END IF;
END $$;

ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS school_id VARCHAR(64);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.assignment_submissions'::regclass AND conname = 'assignment_submissions_school_id_fkey') THEN
    ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student
  ON public.assignment_submissions(school_id, student_id);

ALTER TABLE public.transport_routes
  ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 40;
ALTER TABLE public.transport_routes DROP CONSTRAINT IF EXISTS transport_routes_capacity_check;
ALTER TABLE public.transport_routes
  ADD CONSTRAINT transport_routes_capacity_check CHECK (capacity BETWEEN 1 AND 1000);

CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(64) REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash TEXT,
  request_email_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_hash_created
  ON public.password_reset_codes(request_email_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at
  ON public.password_reset_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_ip_created
  ON public.password_reset_codes(request_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id
  ON public.password_reset_codes(user_id);

CREATE TABLE IF NOT EXISTS public.subscription_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('before_7', 'before_3', 'before_1', 'grace', 'read_only')),
  valid_until TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, stage, valid_until)
);
CREATE INDEX IF NOT EXISTS idx_subscription_reminders_school_id
  ON public.subscription_reminders(school_id);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_codes, public.subscription_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.password_reset_codes, public.subscription_reminders TO service_role;

CREATE OR REPLACE FUNCTION public.super_admin_dashboard_summary()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH selected_currency AS (
    SELECT COALESCE(
      (SELECT UPPER(NULLIF(platform_currency, '')) FROM public.super_admin_settings WHERE id = 'default' LIMIT 1),
      'ETB'
    ) AS currency
  )
  SELECT jsonb_build_object(
    'platformCurrency', (SELECT currency FROM selected_currency),
    'metrics', jsonb_build_object(
      'totalSchools', (SELECT COUNT(*) FROM public.schools),
      'totalStudents', (SELECT COUNT(*) FROM public.students WHERE status = 'active'),
      'currentMonthRevenue', COALESCE((
        SELECT SUM(amount)
        FROM public.subscription_invoices
        WHERE status = 'paid'
          AND paid_date >= date_trunc('month', CURRENT_DATE)::date
          AND paid_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
          AND UPPER(COALESCE(currency, 'ETB')) = (SELECT currency FROM selected_currency)
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
        SELECT months.month_start,
          COALESCE(SUM(invoice.amount) FILTER (WHERE invoice.status = 'paid'), 0) AS revenue
        FROM generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS months(month_start)
        LEFT JOIN public.subscription_invoices invoice
          ON date_trunc('month', invoice.paid_date) = months.month_start
         AND UPPER(COALESCE(invoice.currency, 'ETB')) = (SELECT currency FROM selected_currency)
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
$function$;

CREATE OR REPLACE FUNCTION public.schoolos_publish_platform_broadcast(p_broadcast_id VARCHAR)
RETURNS public.platform_broadcasts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  broadcast_row public.platform_broadcasts%ROWTYPE;
BEGIN
  SELECT * INTO broadcast_row
  FROM public.platform_broadcasts
  WHERE id = p_broadcast_id
    AND status IN ('draft', 'scheduled')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF broadcast_row.audience = 'one_school'
     AND (broadcast_row.target_school_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.schools WHERE id = broadcast_row.target_school_id
     )) THEN
    RAISE EXCEPTION 'The target school for this broadcast no longer exists.';
  END IF;

  INSERT INTO public.school_notices (
    id, school_id, title, content, audience, is_pinned, publish_date,
    author_name, author_role, class_id, is_active, created_at
  )
  SELECT
    'platform-' || broadcast_row.id || '-' || school.id,
    school.id,
    broadcast_row.title,
    broadcast_row.message,
    CASE broadcast_row.audience
      WHEN 'school_admins' THEN 'school_admins'
      WHEN 'teachers' THEN 'teachers'
      WHEN 'one_school' THEN 'school'
      ELSE 'all'
    END,
    FALSE,
    CURRENT_DATE,
    'SchoolOS Platform',
    'super_admin',
    NULL,
    TRUE,
    NOW()
  FROM public.schools AS school
  WHERE broadcast_row.audience <> 'one_school'
     OR school.id = broadcast_row.target_school_id
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.platform_broadcasts
  SET status = 'sent', sent_at = NOW()
  WHERE id = broadcast_row.id
  RETURNING * INTO broadcast_row;

  RETURN broadcast_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.super_admin_dashboard_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_dashboard_summary() TO service_role;
REVOKE ALL ON FUNCTION public.schoolos_publish_platform_broadcast(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_publish_platform_broadcast(VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
