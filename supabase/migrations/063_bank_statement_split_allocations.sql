-- Accountant split-settlement reconciliation.
-- A single bank statement line may be allocated to multiple receipts or expenses,
-- and a receipt/expense may be settled by multiple statement lines.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bank_statement_allocations (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  statement_entry_id VARCHAR(64) NOT NULL REFERENCES public.bank_statement_entries(id) ON DELETE RESTRICT,
  payment_id VARCHAR(64) REFERENCES public.fee_payments(id) ON DELETE RESTRICT,
  expense_id VARCHAR(64) REFERENCES public.school_expenses(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 9999999999.99),
  created_by VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_statement_allocations_exactly_one_target
    CHECK ((payment_id IS NOT NULL)::integer + (expense_id IS NOT NULL)::integer = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_allocation_entry_payment
  ON public.bank_statement_allocations (school_id, statement_entry_id, payment_id)
  WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_allocation_entry_expense
  ON public.bank_statement_allocations (school_id, statement_entry_id, expense_id)
  WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_school_entry
  ON public.bank_statement_allocations (school_id, statement_entry_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_school_payment
  ON public.bank_statement_allocations (school_id, payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_school_expense
  ON public.bank_statement_allocations (school_id, expense_id) WHERE expense_id IS NOT NULL;

ALTER TABLE public.bank_statement_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_statement_allocations_service_role_all ON public.bank_statement_allocations;
CREATE POLICY bank_statement_allocations_service_role_all
  ON public.bank_statement_allocations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.bank_statement_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bank_statement_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_allocate_bank_statement(
  p_school_id VARCHAR,
  p_statement_entry_id VARCHAR,
  p_payment_id VARCHAR,
  p_expense_id VARCHAR,
  p_amount NUMERIC,
  p_created_by VARCHAR
)
RETURNS public.bank_statement_allocations
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  statement_row public.bank_statement_entries%ROWTYPE;
  payment_row public.fee_payments%ROWTYPE;
  expense_row public.school_expenses%ROWTYPE;
  already_allocated NUMERIC(12,2);
  statement_allocated NUMERIC(12,2);
  allocation_row public.bank_statement_allocations%ROWTYPE;
BEGIN
  IF p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_statement_entry_id IS NULL OR btrim(p_statement_entry_id) = ''
    OR p_created_by IS NULL OR btrim(p_created_by) = ''
    OR p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 2) <> p_amount
    OR ((p_payment_id IS NULL)::integer + (p_expense_id IS NULL)::integer) <> 1 THEN
    RAISE EXCEPTION 'Invalid bank statement allocation details.';
  END IF;

  SELECT * INTO statement_row
    FROM public.bank_statement_entries
   WHERE id = p_statement_entry_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bank statement line not found for this school.'; END IF;
  IF statement_row.matched_at IS NOT NULL OR statement_row.matched_payment_id IS NOT NULL OR statement_row.matched_expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'This bank statement line was already reconciled using the legacy single-match method.';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO statement_allocated
    FROM public.bank_statement_allocations
   WHERE school_id = p_school_id AND statement_entry_id = p_statement_entry_id;
  IF statement_allocated + p_amount > statement_row.amount THEN
    RAISE EXCEPTION 'Allocation exceeds the remaining bank statement amount.';
  END IF;

  IF p_payment_id IS NOT NULL THEN
    IF statement_row.direction <> 'credit' THEN RAISE EXCEPTION 'Bank debits must be allocated to expenses.'; END IF;
    SELECT * INTO payment_row
      FROM public.fee_payments
     WHERE id = p_payment_id AND school_id = p_school_id
     FOR UPDATE;
    IF NOT FOUND OR payment_row.voided_at IS NOT NULL
      OR payment_row.amount_paid <= 0
      OR payment_row.payment_method NOT IN ('Bank Transfer', 'Mobile Money') THEN
      RAISE EXCEPTION 'Choose a valid, non-void bank/mobile fee receipt from this school.';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO already_allocated
      FROM public.bank_statement_allocations
     WHERE school_id = p_school_id AND payment_id = p_payment_id;
    IF already_allocated + p_amount > payment_row.amount_paid THEN
      RAISE EXCEPTION 'Allocation exceeds the unreconciled receipt amount.';
    END IF;
  ELSE
    IF statement_row.direction <> 'debit' THEN RAISE EXCEPTION 'Bank credits must be allocated to fee receipts.'; END IF;
    SELECT * INTO expense_row
      FROM public.school_expenses
     WHERE id = p_expense_id AND school_id = p_school_id
     FOR UPDATE;
    IF NOT FOUND OR expense_row.status <> 'posted' OR expense_row.voided_at IS NOT NULL
      OR expense_row.payment_method NOT IN ('bank_transfer', 'mobile_money') THEN
      RAISE EXCEPTION 'Choose a valid, posted bank/mobile expense from this school.';
    END IF;
    SELECT COALESCE(SUM(amount), 0) INTO already_allocated
      FROM public.bank_statement_allocations
     WHERE school_id = p_school_id AND expense_id = p_expense_id;
    IF already_allocated + p_amount > expense_row.amount THEN
      RAISE EXCEPTION 'Allocation exceeds the unreconciled expense amount.';
    END IF;
  END IF;

  INSERT INTO public.bank_statement_allocations
    (id, school_id, statement_entry_id, payment_id, expense_id, amount, created_by)
  VALUES
    ('bsa-' || replace(gen_random_uuid()::text, '-', ''), p_school_id, p_statement_entry_id,
     p_payment_id, p_expense_id, p_amount, p_created_by)
  RETURNING * INTO allocation_row;

  RETURN allocation_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_allocate_bank_statement(VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_allocate_bank_statement(VARCHAR, VARCHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR) TO service_role;

-- A reconciled receipt/expense must not be voided after allocation. Lock the
-- target row so voiding and allocation cannot race each other.
CREATE OR REPLACE FUNCTION public.schoolos_void_fee_payment(
  p_payment_id VARCHAR,
  p_school_id VARCHAR,
  p_user_id VARCHAR,
  p_reason TEXT
) RETURNS public.fee_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $
DECLARE
  payment_row public.fee_payments%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'A valid payment, school, user, and void reason are required.';
  END IF;
  SELECT * INTO payment_row
    FROM public.fee_payments
   WHERE id = p_payment_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND OR payment_row.voided_at IS NOT NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.bank_statement_allocations a WHERE a.school_id = p_school_id AND a.payment_id = p_payment_id)
    OR EXISTS (SELECT 1 FROM public.bank_statement_entries e WHERE e.school_id = p_school_id AND e.matched_payment_id = p_payment_id) THEN
    RAISE EXCEPTION 'This receipt is reconciled to a bank statement and cannot be voided until the reconciliation is reversed.';
  END IF;
  UPDATE public.fee_payments
     SET voided_at = now(), voided_by = p_user_id, void_reason = btrim(p_reason)
   WHERE id = p_payment_id AND school_id = p_school_id
   RETURNING * INTO payment_row;
  RETURN payment_row;
END;
$;
REVOKE ALL ON FUNCTION public.schoolos_void_fee_payment(VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_void_fee_payment(VARCHAR, VARCHAR, VARCHAR, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_void_school_expense(
  p_expense_id VARCHAR,
  p_school_id VARCHAR,
  p_user_id VARCHAR,
  p_reason VARCHAR
) RETURNS public.school_expenses
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $
DECLARE
  expense_row public.school_expenses%ROWTYPE;
BEGIN
  IF p_expense_id IS NULL OR btrim(p_expense_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'A valid expense, school, user, and void reason are required.';
  END IF;
  SELECT * INTO expense_row
    FROM public.school_expenses
   WHERE id = p_expense_id AND school_id = p_school_id AND status = 'posted'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.bank_statement_allocations a WHERE a.school_id = p_school_id AND a.expense_id = p_expense_id)
    OR EXISTS (SELECT 1 FROM public.bank_statement_entries e WHERE e.school_id = p_school_id AND e.matched_expense_id = p_expense_id) THEN
    RAISE EXCEPTION 'This expense is reconciled to a bank statement and cannot be voided until the reconciliation is reversed.';
  END IF;
  UPDATE public.school_expenses
     SET status = 'void', voided_at = now(), voided_by = p_user_id, void_reason = btrim(p_reason)
   WHERE id = p_expense_id AND school_id = p_school_id AND status = 'posted'
   RETURNING * INTO expense_row;
  RETURN expense_row;
END;
$;
REVOKE ALL ON FUNCTION public.schoolos_void_school_expense(VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_void_school_expense(VARCHAR, VARCHAR, VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
