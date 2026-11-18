-- STEP 7: enforce locked lesson immutability inside PostgreSQL, including RPC callers.

ALTER TABLE public.timetable_slots
  ADD CONSTRAINT timetable_locked_slots_must_remain_active
  CHECK (NOT is_locked OR is_active) NOT VALID;
ALTER TABLE public.timetable_slots
  VALIDATE CONSTRAINT timetable_locked_slots_must_remain_active;

CREATE OR REPLACE FUNCTION public.schoolos_guard_locked_timetable_slot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_locked THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Casharkan waa xiran yahay; fur ka hor intaadan tirtirin.';
    END IF;
    IF NEW.school_id IS DISTINCT FROM OLD.school_id
      OR NEW.class_id IS DISTINCT FROM OLD.class_id
      OR NEW.term_id IS DISTINCT FROM OLD.term_id
      OR NEW.section_id IS DISTINCT FROM OLD.section_id
      OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
      OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week
      OR NEW.period_number IS DISTINCT FROM OLD.period_number
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
      OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
      OR NEW.room_number IS DISTINCT FROM OLD.room_number
      OR NEW.room_id IS DISTINCT FROM OLD.room_id
    THEN
      RAISE EXCEPTION 'Casharkan waa xiran yahay; fur ka hor intaadan wax ka beddelin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_guard_locked_timetable_slot() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS timetable_slots_guard_locked ON public.timetable_slots;
CREATE TRIGGER timetable_slots_guard_locked
  BEFORE UPDATE OR DELETE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_locked_timetable_slot();

-- Keep the existing RPC implementation and its conflict checks, but never soft-delete locked rows.
DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'schoolos_replace_class_timetable'
    AND p.pronargs = 3
  LIMIT 1;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'schoolos_replace_class_timetable was not found; refusing to change timetable write behavior.';
  END IF;

  function_definition := replace(
    function_definition,
    'WHERE school_id = p_school_id AND class_id = p_class_id AND is_active = TRUE;',
    'WHERE school_id = p_school_id AND class_id = p_class_id AND is_active = TRUE AND is_locked = FALSE;'
  );

  IF position('AND is_locked = FALSE' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Could not safely patch the existing timetable replacement function.';
  END IF;

  EXECUTE function_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';