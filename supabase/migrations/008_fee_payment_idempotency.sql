-- Preserve payment submission keys so client retries cannot collect twice.
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS idempotency_keys JSONB NOT NULL DEFAULT '[]'::JSONB;

NOTIFY pgrst, 'reload schema';
