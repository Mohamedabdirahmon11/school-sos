-- Retain fee receipts while marking voided entries for audit and reconciliation.
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS voided_by VARCHAR(64) REFERENCES users(id);
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;

NOTIFY pgrst, 'reload schema';
