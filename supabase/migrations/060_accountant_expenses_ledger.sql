-- School-scoped expense ledger for the Accountant workspace.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_expenses (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category VARCHAR(32) NOT NULL CHECK (category IN ('rent','utilities','supplies','transport','salaries','maintenance','other')),
  description VARCHAR(500) NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 500),
  vendor VARCHAR(160),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 9999999999.99),
  expense_date DATE NOT NULL,
  payment_method VARCHAR(24) NOT NULL CHECK (payment_method IN ('cash','bank_transfer','mobile_money','other')),
  reference VARCHAR(120),
  notes VARCHAR(1000),
  status VARCHAR(12) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
  created_by VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  voided_by VARCHAR(64) REFERENCES public.users(id) ON DELETE RESTRICT,
  void_reason VARCHAR(500),
  CHECK ((status = 'posted' AND voided_at IS NULL AND voided_by IS NULL) OR (status = 'void' AND voided_at IS NOT NULL AND voided_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_school_expenses_school_date ON public.school_expenses (school_id, expense_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_expenses_school_category ON public.school_expenses (school_id, category, expense_date DESC);

ALTER TABLE public.school_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_expenses_school_read ON public.school_expenses;
CREATE POLICY school_expenses_school_read ON public.school_expenses FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant')));
DROP POLICY IF EXISTS school_expenses_school_insert ON public.school_expenses;
CREATE POLICY school_expenses_school_insert ON public.school_expenses FOR INSERT TO authenticated
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
DROP POLICY IF EXISTS school_expenses_school_update ON public.school_expenses;
CREATE POLICY school_expenses_school_update ON public.school_expenses FOR UPDATE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'))
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
DROP POLICY IF EXISTS school_expenses_service_role_all ON public.school_expenses;
CREATE POLICY school_expenses_service_role_all ON public.school_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.school_expenses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.school_expenses TO authenticated, service_role;
REVOKE DELETE ON TABLE public.school_expenses FROM authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
