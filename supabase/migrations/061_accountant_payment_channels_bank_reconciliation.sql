-- Accountant payment channels and bank reconciliation.
-- Additive and tenant-scoped; existing receipts retain their Cash method.
BEGIN;

ALTER TABLE public.fee_payments
  DROP CONSTRAINT IF EXISTS fee_payments_payment_method_check;
ALTER TABLE public.fee_payments
  ALTER COLUMN payment_method SET DEFAULT 'Cash';
ALTER TABLE public.fee_payments
  ADD CONSTRAINT fee_payments_payment_method_check
  CHECK (payment_method IN ('Cash', 'Bank Transfer', 'Mobile Money'));

-- Replace the previous six-argument overload so callers can safely pass the
-- payment channel while older six-argument application calls keep the default.
DROP FUNCTION IF EXISTS public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR);
CREATE OR REPLACE FUNCTION public.schoolos_apply_fee_installment(
  p_payment_id VARCHAR,
  p_school_id VARCHAR,
  p_amount_paid NUMERIC,
  p_recorded_by VARCHAR,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL,
  p_payment_method VARCHAR DEFAULT 'Cash'
)
RETURNS public.fee_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment_row public.fee_payments%ROWTYPE;
  next_paid NUMERIC(10,2);
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_recorded_by IS NULL OR btrim(p_recorded_by) = ''
    OR p_amount_paid IS NULL OR p_amount_paid <= 0
    OR (p_notes IS NOT NULL AND length(p_notes) > 1000)
    OR (p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 128)
    OR p_payment_method NOT IN ('Cash', 'Bank Transfer', 'Mobile Money') THEN
    RAISE EXCEPTION 'Invalid fee installment details.';
  END IF;

  SELECT * INTO payment_row
    FROM public.fee_payments
   WHERE id = p_payment_id AND school_id = p_school_id
   FOR UPDATE;

  IF NOT FOUND OR payment_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'The fee installment was not found or has been voided.';
  END IF;
  IF p_idempotency_key IS NOT NULL AND (
    payment_row.idempotency_key = p_idempotency_key
    OR COALESCE(payment_row.idempotency_keys, '[]'::JSONB) @> jsonb_build_array(p_idempotency_key)
  ) THEN RETURN payment_row; END IF;
  IF payment_row.status = 'paid' THEN
    RAISE EXCEPTION 'This fee is already fully paid for the selected billing period.';
  END IF;

  next_paid := payment_row.amount_paid + p_amount_paid;
  IF next_paid > payment_row.amount_due THEN
    RAISE EXCEPTION 'Payment cannot exceed the remaining fee balance.';
  END IF;

  UPDATE public.fee_payments
     SET amount_paid = next_paid,
         remaining_amount = amount_due - next_paid,
         status = CASE
           WHEN amount_due - next_paid = 0 THEN 'paid'::public.fee_payment_status_enum
           WHEN next_paid > 0 THEN 'partial'::public.fee_payment_status_enum
           ELSE 'unpaid'::public.fee_payment_status_enum
         END,
         payment_method = p_payment_method,
         date = (now() AT TIME ZONE COALESCE(
           (SELECT timezone FROM public.schools WHERE id = p_school_id),
           'Africa/Addis_Ababa'
         ))::date,
         recorded_by = p_recorded_by,
         idempotency_keys = CASE
           WHEN p_idempotency_key IS NULL THEN COALESCE(idempotency_keys, '[]'::JSONB)
           ELSE COALESCE(idempotency_keys, '[]'::JSONB) || jsonb_build_array(p_idempotency_key)
         END,
         notes = CASE
           WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN notes
           ELSE concat_ws(' · ', NULLIF(notes, ''), btrim(p_notes))
         END
   WHERE id = p_payment_id AND school_id = p_school_id
   RETURNING * INTO payment_row;

  RETURN payment_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR, VARCHAR) TO service_role;

CREATE TABLE IF NOT EXISTS public.bank_statement_entries (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  statement_date DATE NOT NULL,
  description VARCHAR(500) NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 500),
  reference VARCHAR(160),
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('credit','debit')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 9999999999.99),
  bank_account_label VARCHAR(120),
  matched_payment_id VARCHAR(64) REFERENCES public.fee_payments(id) ON DELETE RESTRICT,
  matched_expense_id VARCHAR(64) REFERENCES public.school_expenses(id) ON DELETE RESTRICT,
  matched_at TIMESTAMPTZ,
  created_by VARCHAR(64) NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT (matched_payment_id IS NOT NULL AND matched_expense_id IS NOT NULL)),
  CHECK ((matched_payment_id IS NULL AND matched_expense_id IS NULL AND matched_at IS NULL)
      OR (matched_payment_id IS NOT NULL OR matched_expense_id IS NOT NULL) AND matched_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_school_date
  ON public.bank_statement_entries (school_id, statement_date DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_matched_payment
  ON public.bank_statement_entries (school_id, matched_payment_id)
  WHERE matched_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_matched_expense
  ON public.bank_statement_entries (school_id, matched_expense_id)
  WHERE matched_expense_id IS NOT NULL;

ALTER TABLE public.bank_statement_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_statement_school_read ON public.bank_statement_entries;
CREATE POLICY bank_statement_school_read ON public.bank_statement_entries FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant')));
DROP POLICY IF EXISTS bank_statement_school_insert ON public.bank_statement_entries;
CREATE POLICY bank_statement_school_insert ON public.bank_statement_entries FOR INSERT TO authenticated
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
DROP POLICY IF EXISTS bank_statement_school_update ON public.bank_statement_entries;
CREATE POLICY bank_statement_school_update ON public.bank_statement_entries FOR UPDATE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'))
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
DROP POLICY IF EXISTS bank_statement_service_role_all ON public.bank_statement_entries;
CREATE POLICY bank_statement_service_role_all ON public.bank_statement_entries FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.bank_statement_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bank_statement_entries TO authenticated, service_role;
REVOKE DELETE ON TABLE public.bank_statement_entries FROM authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
