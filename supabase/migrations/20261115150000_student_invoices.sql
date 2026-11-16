-- Student invoices: additive, tenant-scoped billing documents.
-- Existing fee_payments and receipt history remain intact; invoice_id is nullable.

CREATE TABLE IF NOT EXISTS student_invoices (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(100) NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  billing_period VARCHAR(80) NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void')),
  notes TEXT,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, invoice_number),
  UNIQUE (school_id, student_id, academic_year, billing_period),
  CHECK (discount_amount <= subtotal),
  CHECK (total_amount = subtotal - discount_amount),
  CHECK (amount_paid <= total_amount),
  CHECK (balance_due = total_amount - amount_paid)
);

CREATE TABLE IF NOT EXISTS student_invoice_items (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id VARCHAR(64) NOT NULL REFERENCES student_invoices(id) ON DELETE CASCADE,
  fee_structure_id VARCHAR(64) REFERENCES fee_structures(id) ON DELETE SET NULL,
  fee_type VARCHAR(40) NOT NULL CHECK (fee_type IN ('monthly_tuition','annual_registration','bus','custom')),
  description VARCHAR(240) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount NUMERIC(12,2) NOT NULL CHECK (unit_amount >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (line_total = quantity * unit_amount)
);

CREATE TABLE IF NOT EXISTS student_invoice_sequences (
  id VARCHAR(160) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year VARCHAR(20) NOT NULL,
  next_value BIGINT NOT NULL CHECK (next_value >= 1),
  UNIQUE (school_id, academic_year)
);

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(64)
  REFERENCES student_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_invoices_school_status_due
  ON student_invoices(school_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_student_invoices_student_period
  ON student_invoices(school_id, student_id, academic_year, billing_period);
CREATE INDEX IF NOT EXISTS idx_student_invoice_items_invoice
  ON student_invoice_items(school_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_invoice
  ON fee_payments(school_id, invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE student_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_invoices_tenant_scope ON student_invoices;
CREATE POLICY student_invoices_tenant_scope ON student_invoices FOR ALL TO authenticated
  USING (
    auth_user_role() = 'super_admin'
    OR (school_id = auth_school_id() AND (
      auth_user_role() IN ('school_admin','accountant')
      OR auth_can_access_student(student_id)
    ))
  )
  WITH CHECK (
    auth_user_role() = 'super_admin'
    OR (school_id = auth_school_id() AND auth_user_role() IN ('school_admin','accountant'))
  );

DROP POLICY IF EXISTS student_invoice_items_tenant_scope ON student_invoice_items;
CREATE POLICY student_invoice_items_tenant_scope ON student_invoice_items FOR ALL TO authenticated
  USING (
    auth_user_role() = 'super_admin'
    OR (school_id = auth_school_id() AND EXISTS (
      SELECT 1 FROM student_invoices invoice
      WHERE invoice.id = student_invoice_items.invoice_id
        AND invoice.school_id = student_invoice_items.school_id
        AND (
          auth_user_role() IN ('school_admin','accountant')
          OR auth_can_access_student(invoice.student_id)
        )
    ))
  )
  WITH CHECK (
    auth_user_role() = 'super_admin'
    OR (school_id = auth_school_id() AND auth_user_role() IN ('school_admin','accountant'))
  );

DROP POLICY IF EXISTS student_invoice_sequences_deny_client ON student_invoice_sequences;
CREATE POLICY student_invoice_sequences_deny_client ON student_invoice_sequences
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE student_invoice_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE student_invoice_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_next_student_invoice(p_school_id VARCHAR, p_academic_year VARCHAR)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE allocated_value BIGINT;
BEGIN
  IF p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_academic_year IS NULL OR btrim(p_academic_year) = '' THEN
    RAISE EXCEPTION 'School and academic year are required for invoice allocation.';
  END IF;
  INSERT INTO public.student_invoice_sequences AS current_sequence (
    id, school_id, academic_year, next_value
  )
  SELECT p_school_id || ':' || p_academic_year, p_school_id, p_academic_year,
    COALESCE(MAX(substring(invoice.invoice_number FROM '([0-9]+)$')::BIGINT), 0) + 1
  FROM public.student_invoices invoice
  WHERE invoice.school_id = p_school_id AND invoice.academic_year = p_academic_year
  ON CONFLICT (school_id, academic_year)
  DO UPDATE SET next_value = GREATEST(current_sequence.next_value + 1, EXCLUDED.next_value)
  RETURNING next_value INTO allocated_value;
  RETURN allocated_value;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_next_student_invoice(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_next_student_invoice(VARCHAR, VARCHAR) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_apply_student_invoice_payment(
  p_invoice_id VARCHAR,
  p_school_id VARCHAR,
  p_amount NUMERIC,
  p_payment_method VARCHAR,
  p_recorded_by VARCHAR,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invoice_row public.student_invoices%ROWTYPE;
  payment_row public.fee_payments%ROWTYPE;
  receipt_seq BIGINT;
  school_code VARCHAR;
  invoice_fee_type VARCHAR;
  invoice_fee_structure_id VARCHAR;
  new_paid NUMERIC(12,2);
  new_balance NUMERIC(12,2);
  new_status VARCHAR(20);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount,2) <> p_amount
    OR p_payment_method IS NULL OR p_payment_method NOT IN ('Cash','Bank Transfer','Mobile Money')
    OR p_recorded_by IS NULL OR btrim(p_recorded_by) = '' THEN
    RAISE EXCEPTION 'Enter a valid positive payment and payment method.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row FROM public.fee_payments
      WHERE school_id = p_school_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF payment_row.invoice_id IS DISTINCT FROM p_invoice_id THEN
        RAISE EXCEPTION 'Retry key belongs to a different invoice.';
      END IF;
      SELECT * INTO invoice_row FROM public.student_invoices
        WHERE id = p_invoice_id AND school_id = p_school_id;
      RETURN jsonb_build_object('invoice',to_jsonb(invoice_row),'payment',to_jsonb(payment_row),'replayed',true);
    END IF;
  END IF;

  SELECT * INTO invoice_row FROM public.student_invoices
    WHERE id = p_invoice_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND OR invoice_row.status = 'void' THEN RAISE EXCEPTION 'Invoice not found or void.'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO payment_row FROM public.fee_payments
      WHERE school_id = p_school_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF payment_row.invoice_id IS DISTINCT FROM p_invoice_id THEN
        RAISE EXCEPTION 'Retry key belongs to a different invoice.';
      END IF;
      RETURN jsonb_build_object('invoice',to_jsonb(invoice_row),'payment',to_jsonb(payment_row),'replayed',true);
    END IF;
  END IF;
  IF p_amount > invoice_row.balance_due THEN RAISE EXCEPTION 'Payment exceeds the invoice balance.'; END IF;

  SELECT fee_type, fee_structure_id INTO invoice_fee_type, invoice_fee_structure_id
    FROM public.student_invoice_items
    WHERE invoice_id = invoice_row.id AND school_id = p_school_id
    ORDER BY created_at, id LIMIT 1;
  IF invoice_fee_type IS NULL THEN RAISE EXCEPTION 'Invoice has no billable items.'; END IF;

  SELECT code INTO school_code FROM public.schools WHERE id = p_school_id;
  receipt_seq := public.schoolos_next_fee_receipt(p_school_id, invoice_row.academic_year);
  new_paid := invoice_row.amount_paid + p_amount;
  new_balance := invoice_row.total_amount - new_paid;
  new_status := CASE WHEN new_balance = 0 THEN 'paid' ELSE 'partially_paid' END;

  INSERT INTO public.fee_payments (
    id, school_id, student_id, receipt_number, academic_year, month, fee_type,
    fee_structure_id, idempotency_key, amount_due, amount_paid, remaining_amount,
    payment_method, status, date, recorded_by, notes, idempotency_keys, invoice_id
  ) VALUES (
    'fee-' || gen_random_uuid()::text, p_school_id, invoice_row.student_id,
    'REC-' || COALESCE(school_code,'SCH') || '-' || split_part(invoice_row.academic_year,'-',1) || '-' || lpad(receipt_seq::text,4,'0'),
    invoice_row.academic_year, invoice_row.billing_period, invoice_fee_type::public.fee_type_enum,
    invoice_fee_structure_id, p_idempotency_key, p_amount, p_amount, 0,
    p_payment_method, 'paid', CURRENT_DATE, p_recorded_by, NULLIF(left(COALESCE(p_notes,''),1000),''),
    CASE WHEN p_idempotency_key IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_idempotency_key) END,
    invoice_row.id
  ) RETURNING * INTO payment_row;

  UPDATE public.student_invoices SET amount_paid = new_paid, balance_due = new_balance,
    status = new_status, updated_at = NOW()
    WHERE id = invoice_row.id AND school_id = p_school_id
    RETURNING * INTO invoice_row;

  RETURN jsonb_build_object('invoice',to_jsonb(invoice_row),'payment',to_jsonb(payment_row),'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_apply_student_invoice_payment(VARCHAR,VARCHAR,NUMERIC,VARCHAR,VARCHAR,TEXT,VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_apply_student_invoice_payment(VARCHAR,VARCHAR,NUMERIC,VARCHAR,VARCHAR,TEXT,VARCHAR) TO service_role;


CREATE OR REPLACE FUNCTION public.schoolos_sync_student_invoice_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  paid_after_void NUMERIC(12,2);
  balance_after_void NUMERIC(12,2);
  next_status VARCHAR(20);
  invoice_due_date DATE;
BEGIN
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL AND NEW.invoice_id IS NOT NULL THEN
    UPDATE public.student_invoices
    SET amount_paid = GREATEST(0, amount_paid - NEW.amount_paid),
        balance_due = LEAST(total_amount, balance_due + NEW.amount_paid),
        updated_at = NOW()
    WHERE id = NEW.invoice_id AND school_id = NEW.school_id
    RETURNING amount_paid, balance_due, due_date INTO paid_after_void, balance_after_void, invoice_due_date;

    IF FOUND THEN
      next_status := CASE
        WHEN balance_after_void = 0 THEN 'paid'
        WHEN paid_after_void = 0 AND invoice_due_date < CURRENT_DATE THEN 'overdue'
        WHEN paid_after_void = 0 THEN 'issued'
        ELSE 'partially_paid'
      END;
      UPDATE public.student_invoices SET status = next_status
      WHERE id = NEW.invoice_id AND school_id = NEW.school_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_invoice_void ON public.fee_payments;
CREATE TRIGGER trg_sync_student_invoice_void
AFTER UPDATE OF voided_at ON public.fee_payments
FOR EACH ROW EXECUTE FUNCTION public.schoolos_sync_student_invoice_void();
REVOKE ALL ON FUNCTION public.schoolos_sync_student_invoice_void() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
