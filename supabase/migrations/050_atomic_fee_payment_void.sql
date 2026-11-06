-- Atomically void one school-scoped fee receipt. Concurrent requests serialize on the payment row.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_void_fee_payment(
  p_payment_id VARCHAR,
  p_school_id VARCHAR,
  p_user_id VARCHAR,
  p_reason TEXT
) RETURNS public.fee_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment_row public.fee_payments%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'A valid payment, school, user, and void reason are required.';
  END IF;

  SELECT * INTO payment_row
    FROM public.fee_payments
   WHERE id = p_payment_id
     AND school_id = p_school_id
   FOR UPDATE;

  IF NOT FOUND OR payment_row.voided_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.fee_payments
     SET voided_at = now(),
         voided_by = p_user_id,
         void_reason = btrim(p_reason)
   WHERE id = p_payment_id
     AND school_id = p_school_id
   RETURNING * INTO payment_row;

  RETURN payment_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_void_fee_payment(VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_void_fee_payment(VARCHAR, VARCHAR, VARCHAR, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
