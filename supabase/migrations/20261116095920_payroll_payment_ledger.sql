-- Extend staff payroll with a verifiable payment ledger and partial-payment balances.
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  ADD COLUMN IF NOT EXISTS payment_history JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.payroll_records DROP CONSTRAINT IF EXISTS payroll_records_status_check;
ALTER TABLE public.payroll_records
  ADD CONSTRAINT payroll_records_status_check
  CHECK (status IN ('draft', 'approved', 'partially_paid', 'paid'));

UPDATE public.payroll_records
SET paid_amount = CASE WHEN status = 'paid' THEN net_salary ELSE COALESCE(paid_amount, 0) END,
    balance_due = CASE WHEN status = 'paid' THEN 0 ELSE GREATEST(net_salary - COALESCE(paid_amount, 0), 0) END,
    payment_history = COALESCE(payment_history, '[]'::JSONB);

ALTER TABLE public.payroll_records
  ADD CONSTRAINT payroll_paid_amount_within_net
    CHECK (paid_amount <= net_salary),
  ADD CONSTRAINT payroll_balance_matches_net
    CHECK (paid_amount + balance_due = net_salary);

CREATE INDEX IF NOT EXISTS idx_payroll_school_month_status
  ON public.payroll_records (school_id, payroll_month, status);

NOTIFY pgrst, 'reload schema';
