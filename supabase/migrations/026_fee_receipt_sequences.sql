-- Allocate fee receipt numbers atomically across concurrent requests and server instances.
BEGIN;

CREATE TABLE IF NOT EXISTS public.fee_receipt_sequences (
  id VARCHAR(160) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year VARCHAR(50) NOT NULL,
  next_value BIGINT NOT NULL CHECK (next_value >= 1),
  UNIQUE (school_id, academic_year)
);

ALTER TABLE public.fee_receipt_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_receipt_sequences_deny_client ON public.fee_receipt_sequences;
DROP POLICY IF EXISTS fee_receipt_sequences_deny_client ON public.fee_receipt_sequences;
CREATE POLICY fee_receipt_sequences_deny_client ON public.fee_receipt_sequences
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.fee_receipt_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fee_receipt_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_next_fee_receipt(
  p_school_id VARCHAR,
  p_academic_year VARCHAR
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allocated_value BIGINT;
BEGIN
  IF p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_academic_year IS NULL OR btrim(p_academic_year) = '' THEN
    RAISE EXCEPTION 'School and academic year are required for receipt allocation.';
  END IF;

  INSERT INTO public.fee_receipt_sequences AS current_sequence (
    id, school_id, academic_year, next_value
  )
  SELECT
    p_school_id || ':' || p_academic_year,
    p_school_id,
    p_academic_year,
    COALESCE(MAX(substring(payment.receipt_number FROM '([0-9]+)$')::BIGINT), 0) + 1
  FROM public.fee_payments payment
  WHERE payment.school_id = p_school_id
    AND payment.academic_year = p_academic_year
  ON CONFLICT (school_id, academic_year)
  DO UPDATE SET next_value = GREATEST(current_sequence.next_value + 1, EXCLUDED.next_value)
  RETURNING next_value INTO allocated_value;

  RETURN allocated_value;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_next_fee_receipt(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_next_fee_receipt(VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
