-- Safely repair legacy invoices that predate automatic bus-fee inclusion.
-- The invoice row is locked; repeated calls are idempotent and existing payments stay intact.

CREATE OR REPLACE FUNCTION public.schoolos_add_missing_student_invoice_bus_fee(
  p_invoice_id VARCHAR,
  p_school_id VARCHAR,
  p_fee_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  invoice_row public.student_invoices%ROWTYPE;
  new_subtotal NUMERIC(12,2);
  new_total NUMERIC(12,2);
  new_balance NUMERIC(12,2);
BEGIN
  IF p_invoice_id IS NULL OR btrim(p_invoice_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_fee_amount IS NULL OR p_fee_amount <= 0
    OR round(p_fee_amount, 2) <> p_fee_amount THEN
    RAISE EXCEPTION 'A valid invoice, school and positive bus fee are required.';
  END IF;

  SELECT * INTO invoice_row
  FROM public.student_invoices
  WHERE id = p_invoice_id AND school_id = p_school_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice was not found in this school.';
  END IF;

  IF invoice_row.status = 'void' THEN
    RETURN jsonb_build_object('added', false, 'reason', 'void_invoice');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_invoice_items
    WHERE school_id = p_school_id AND invoice_id = p_invoice_id AND fee_type = 'bus'
  ) THEN
    RETURN jsonb_build_object('added', false, 'reason', 'bus_fee_already_exists');
  END IF;

  new_subtotal := invoice_row.subtotal + p_fee_amount;
  new_total := new_subtotal - invoice_row.discount_amount;
  new_balance := new_total - invoice_row.amount_paid;

  INSERT INTO public.student_invoice_items (
    id, school_id, invoice_id, fee_structure_id, fee_type, description,
    quantity, unit_amount, line_total, cadence
  ) VALUES (
    'invitem-' || gen_random_uuid()::TEXT, p_school_id, p_invoice_id, NULL,
    'bus', 'School transport', 1, p_fee_amount, p_fee_amount, 'monthly'
  );

  UPDATE public.student_invoices
  SET subtotal = new_subtotal,
      total_amount = new_total,
      balance_due = new_balance,
      status = CASE
        WHEN status = 'overdue' THEN 'overdue'
        WHEN new_balance = 0 THEN 'paid'
        WHEN amount_paid > 0 THEN 'partially_paid'
        WHEN status = 'draft' THEN 'draft'
        ELSE 'issued'
      END,
      updated_at = NOW()
  WHERE id = p_invoice_id AND school_id = p_school_id;

  RETURN jsonb_build_object('added', true, 'amount', p_fee_amount, 'balance_due', new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_add_missing_student_invoice_bus_fee(VARCHAR, VARCHAR, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_add_missing_student_invoice_bus_fee(VARCHAR, VARCHAR, NUMERIC)
  TO service_role;
