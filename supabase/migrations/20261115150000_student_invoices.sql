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
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year VARCHAR(20) NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (school_id, academic_year)
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

DROP POLICY IF EXISTS student_invoice_sequences_accountant_scope ON student_invoice_sequences;
CREATE POLICY student_invoice_sequences_accountant_scope ON student_invoice_sequences FOR ALL TO authenticated
  USING (auth_user_role() IN ('school_admin','accountant','super_admin') AND (auth_user_role() = 'super_admin' OR school_id = auth_school_id()))
  WITH CHECK (auth_user_role() IN ('school_admin','accountant','super_admin') AND (auth_user_role() = 'super_admin' OR school_id = auth_school_id()));

CREATE OR REPLACE FUNCTION schoolos_next_student_invoice(p_school_id VARCHAR, p_academic_year VARCHAR)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE next_number BIGINT;
BEGIN
  IF p_school_id IS NULL OR p_academic_year IS NULL OR length(p_academic_year) > 20 THEN
    RAISE EXCEPTION 'Invalid invoice sequence scope';
  END IF;
  INSERT INTO student_invoice_sequences (school_id, academic_year, last_value)
  VALUES (p_school_id, p_academic_year, 1)
  ON CONFLICT (school_id, academic_year)
  DO UPDATE SET last_value = student_invoice_sequences.last_value + 1
  RETURNING last_value INTO next_number;
  RETURN next_number;
END;
$$;

REVOKE ALL ON FUNCTION schoolos_next_student_invoice(VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION schoolos_next_student_invoice(VARCHAR, VARCHAR) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
