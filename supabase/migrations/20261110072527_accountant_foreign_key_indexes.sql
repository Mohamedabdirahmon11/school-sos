-- Cover all foreign keys introduced by Accountant ledger/reconciliation tables.
-- Keeps parent-row deletes/updates efficient and resolves Supabase FK index advisories.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_school_expenses_created_by ON public.school_expenses (created_by);
CREATE INDEX IF NOT EXISTS idx_school_expenses_voided_by ON public.school_expenses (voided_by) WHERE voided_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_created_by ON public.bank_statement_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_bank_statement_matched_payment ON public.bank_statement_entries (matched_payment_id) WHERE matched_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_statement_matched_expense ON public.bank_statement_entries (matched_expense_id) WHERE matched_expense_id IS NOT NULL;
COMMIT;
