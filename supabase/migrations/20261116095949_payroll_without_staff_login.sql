-- Payroll must cover every active school employee, including staff without a sign-in account.
ALTER TABLE public.payroll_records ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_school_id_user_id_payroll_month_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_school_staff_month
  ON public.payroll_records (school_id, staff_id, payroll_month);

NOTIFY pgrst, 'reload schema';