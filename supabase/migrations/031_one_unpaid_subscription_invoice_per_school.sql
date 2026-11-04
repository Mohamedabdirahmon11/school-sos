-- Prevent concurrent invoice generation from creating multiple unpaid invoices
-- for the same school. A new invoice can be generated after the prior one is paid.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_one_unpaid_per_school
  ON public.subscription_invoices (school_id)
  WHERE status = 'unpaid';
COMMIT;