BEGIN;

-- BEFORE INSERT triggers also run for INSERT .. ON CONFLICT DO UPDATE.
-- That previously reset must_change_password=true every time the storage
-- layer upserted a student or parent row, trapping portal users in PIN setup.
-- Only genuinely new parent accounts keep the one-time PIN-rotation rule.
-- New student accounts use their school-issued PIN for direct portal login.
CREATE OR REPLACE FUNCTION public.schoolos_require_portal_pin_rotation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role = 'parent'::public.user_role_enum THEN
    UPDATE public.users
       SET must_change_password = true
     WHERE id = NEW.id
       AND school_id = NEW.school_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_schoolos_require_portal_pin_rotation ON public.users;
CREATE TRIGGER trg_schoolos_require_portal_pin_rotation
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.schoolos_require_portal_pin_rotation();

NOTIFY pgrst, 'reload schema';
COMMIT;
