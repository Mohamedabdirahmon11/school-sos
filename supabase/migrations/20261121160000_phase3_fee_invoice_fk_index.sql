-- Cover the fee_payments.invoice_id foreign key for invoice-side updates/deletes.
-- The existing (school_id, invoice_id) index is not a left-prefix match for this FK.
CREATE INDEX IF NOT EXISTS idx_fee_payments_invoice_id_fk
  ON public.fee_payments (invoice_id);
