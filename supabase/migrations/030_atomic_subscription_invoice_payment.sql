-- Settle platform subscription invoices atomically and idempotently.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_mark_subscription_invoice_paid(p_invoice_id VARCHAR)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invoice_row public.subscription_invoices%ROWTYPE;
  receipt_code VARCHAR(80);
BEGIN
  SELECT * INTO invoice_row
  FROM public.subscription_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF invoice_row.status = 'paid' THEN
    RETURN invoice_row;
  END IF;

  receipt_code := 'SUB-REC-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  UPDATE public.subscription_invoices
  SET status = 'paid',
      paid_date = CURRENT_DATE,
      receipt_number = receipt_code
  WHERE id = p_invoice_id
  RETURNING * INTO invoice_row;

  UPDATE public.school_subscriptions
  SET status = 'active',
      valid_until = CASE
        WHEN invoice_row.cadence = 'lifetime' THEN NULL
        WHEN invoice_row.cadence = 'yearly' THEN
          GREATEST(COALESCE(valid_until, now()), now()) + interval '1 year'
        WHEN invoice_row.cadence = 'monthly' THEN
          GREATEST(COALESCE(valid_until, now()), now()) + interval '1 month'
        ELSE valid_until
      END,
      price_paid = COALESCE(price_paid, 0) + invoice_row.amount,
      last_billed_date = now(),
      updated_at = now()
  WHERE school_id = invoice_row.school_id;

  RETURN invoice_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_mark_subscription_invoice_paid(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_mark_subscription_invoice_paid(VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
