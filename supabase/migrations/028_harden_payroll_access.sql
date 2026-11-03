-- Restrict direct payroll deletion and make approval/payment transitions monotonic.
BEGIN;

DROP POLICY IF EXISTS payroll_records_accountant_delete ON public.payroll_records;
CREATE POLICY payroll_records_accountant_delete ON public.payroll_records AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.auth_user_role() IN ('accountant','super_admin'));

CREATE OR REPLACE FUNCTION public.enforce_payroll_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'approved'
     AND NEW.approved_by IS NOT NULL AND NEW.approved_at IS NOT NULL
     AND NEW.paid_by IS NULL AND NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'paid'
     AND NEW.approved_by IS NOT NULL AND NEW.approved_at IS NOT NULL
     AND NEW.paid_by IS NOT NULL AND NEW.paid_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid payroll status transition' USING ERRCODE = 'P0001';
END;
$$;
DROP TRIGGER IF EXISTS payroll_status_transition_guard ON public.payroll_records;
CREATE TRIGGER payroll_status_transition_guard
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payroll_status_transition();
REVOKE ALL ON FUNCTION public.enforce_payroll_status_transition() FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
