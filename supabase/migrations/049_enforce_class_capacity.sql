-- Enforce class capacity at the database boundary.
-- The class row lock serializes concurrent student inserts/moves and capacity changes.
CREATE OR REPLACE FUNCTION private.enforce_student_class_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capacity integer;
  v_archived boolean;
  v_enrolled integer;
BEGIN
  SELECT capacity, is_archived
    INTO v_capacity, v_archived
    FROM public.classes
   WHERE id = NEW.class_id
     AND school_id = NEW.school_id
   FOR UPDATE;

  IF NOT FOUND OR v_archived THEN
    RAISE EXCEPTION 'Student class is unavailable for this school.'
      USING ERRCODE = '23503';
  END IF;

  SELECT count(*)::integer
    INTO v_enrolled
    FROM public.students
   WHERE school_id = NEW.school_id
     AND class_id = NEW.class_id
     AND id IS DISTINCT FROM NEW.id;

  IF v_enrolled >= v_capacity THEN
    RAISE EXCEPTION 'The selected class has reached capacity.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_class_capacity_below_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enrolled integer;
BEGIN
  IF NEW.capacity IS NOT DISTINCT FROM OLD.capacity THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer
    INTO v_enrolled
    FROM public.students
   WHERE school_id = NEW.school_id
     AND class_id = NEW.id;

  IF NEW.capacity < v_enrolled THEN
    RAISE EXCEPTION 'Class capacity cannot be lower than its current enrollment (%).', v_enrolled
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_enforce_class_capacity ON public.students;
CREATE TRIGGER students_enforce_class_capacity
BEFORE INSERT OR UPDATE OF school_id, class_id ON public.students
FOR EACH ROW
EXECUTE FUNCTION private.enforce_student_class_capacity();

DROP TRIGGER IF EXISTS classes_prevent_capacity_below_enrollment ON public.classes;
CREATE TRIGGER classes_prevent_capacity_below_enrollment
BEFORE UPDATE OF capacity ON public.classes
FOR EACH ROW
EXECUTE FUNCTION private.prevent_class_capacity_below_enrollment();

REVOKE ALL ON FUNCTION private.enforce_student_class_capacity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_class_capacity_below_enrollment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_student_class_capacity() TO service_role;
GRANT EXECUTE ON FUNCTION private.prevent_class_capacity_below_enrollment() TO service_role;
