-- Cover all foreign keys introduced by split-settlement reconciliation.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_statement_entry_id
  ON public.bank_statement_allocations (statement_entry_id, school_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_payment_id
  ON public.bank_statement_allocations (payment_id, school_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_expense_id
  ON public.bank_statement_allocations (expense_id, school_id) WHERE expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_allocations_created_by
  ON public.bank_statement_allocations (created_by);
COMMIT;
