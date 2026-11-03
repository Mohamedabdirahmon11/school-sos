-- Track custom fee selections and enforce one durable retry key per school.
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS fee_structure_id VARCHAR(64) REFERENCES fee_structures(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payment_school_idempotency
  ON fee_payments(school_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt
  ON fee_payments(school_id, receipt_number);

NOTIFY pgrst, 'reload schema';
