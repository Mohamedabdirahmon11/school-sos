CREATE TABLE IF NOT EXISTS payroll_records (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  staff_id VARCHAR(64) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  payroll_month VARCHAR(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  base_salary NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0),
  allowances JSONB NOT NULL DEFAULT '[]'::JSONB,
  allowance_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (allowance_total >= 0),
  deductions JSONB NOT NULL DEFAULT '[]'::JSONB,
  deduction_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deduction_total >= 0),
  net_salary NUMERIC(12,2) NOT NULL CHECK (net_salary >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  created_by VARCHAR(64) NOT NULL REFERENCES users(id),
  approved_by VARCHAR(64) REFERENCES users(id),
  paid_by VARCHAR(64) REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  UNIQUE (school_id,user_id,payroll_month)
);

CREATE INDEX IF NOT EXISTS idx_payroll_school_month ON payroll_records(school_id,payroll_month);
CREATE INDEX IF NOT EXISTS idx_payroll_user_history ON payroll_records(school_id,user_id,payroll_month DESC);

ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_records_role_read ON payroll_records;
CREATE POLICY payroll_records_role_read ON payroll_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_role() = 'super_admin' OR school_id = auth_school_id() AND (auth_user_role() = 'accountant' OR user_id = auth_user_id()));
DROP POLICY IF EXISTS payroll_records_accountant_insert ON payroll_records;
CREATE POLICY payroll_records_accountant_insert ON payroll_records AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (auth_user_role() IN ('accountant','super_admin'));
DROP POLICY IF EXISTS payroll_records_accountant_update ON payroll_records;
CREATE POLICY payroll_records_accountant_update ON payroll_records AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth_user_role() IN ('accountant','super_admin')) WITH CHECK (auth_user_role() IN ('accountant','super_admin'));

NOTIFY pgrst, 'reload schema';
