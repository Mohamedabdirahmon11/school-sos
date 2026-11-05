-- Apply partial fee payments under a row lock so concurrent cashiers cannot lose installments.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_apply_fee_installment(
  p_payment_id VARCHAR,
  p_school_id VARCHAR,
  p_amount_paid NUMERIC,
  p_recorded_by VARCHAR,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS public.fee_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment_row public.fee_payments%ROWTYPE;
  next_paid NUMERIC(10,2);
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_recorded_by IS NULL OR btrim(p_recorded_by) = ''
    OR p_amount_paid IS NULL OR p_amount_paid < 0
    OR (p_notes IS NOT NULL AND length(p_notes) > 1000)
    OR (p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 128) THEN
    RAISE EXCEPTION 'Invalid fee installment details.';
  END IF;

  SELECT * INTO payment_row
    FROM public.fee_payments
   WHERE id = p_payment_id AND school_id = p_school_id
   FOR UPDATE;

  IF NOT FOUND OR payment_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'The fee installment was not found or has been voided.';
  END IF;

  IF p_idempotency_key IS NOT NULL AND (
    payment_row.idempotency_key = p_idempotency_key
    OR COALESCE(payment_row.idempotency_keys, '[]'::JSONB) @> jsonb_build_array(p_idempotency_key)
  ) THEN
    RETURN payment_row;
  END IF;

  IF payment_row.status = 'paid' THEN
    RAISE EXCEPTION 'This fee is already fully paid for the selected billing period.';
  END IF;

  next_paid := payment_row.amount_paid + p_amount_paid;
  IF next_paid > payment_row.amount_due THEN
    RAISE EXCEPTION 'Cash paid cannot exceed the remaining fee balance.';
  END IF;

  UPDATE public.fee_payments
     SET amount_paid = next_paid,
         remaining_amount = amount_due - next_paid,
         status = CASE WHEN amount_due - next_paid = 0 THEN 'paid'::public.fee_payment_status_enum
                       WHEN next_paid > 0 THEN 'partial'::public.fee_payment_status_enum
                       ELSE 'unpaid'::public.fee_payment_status_enum END,
         date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date,
         recorded_by = p_recorded_by,
         idempotency_keys = CASE WHEN p_idempotency_key IS NULL THEN COALESCE(idempotency_keys, '[]'::JSONB)
                                 ELSE COALESCE(idempotency_keys, '[]'::JSONB) || jsonb_build_array(p_idempotency_key) END,
         notes = CASE WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN notes
                      ELSE concat_ws(' · ', NULLIF(notes, ''), btrim(p_notes)) END
   WHERE id = p_payment_id AND school_id = p_school_id
   RETURNING * INTO payment_row;

  RETURN payment_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
