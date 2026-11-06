-- Enforce school-bound bus assignments and prevent over-capacity routes.
BEGIN;

ALTER TABLE public.transport_routes
  ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 40;
ALTER TABLE public.transport_routes
  DROP CONSTRAINT IF EXISTS transport_routes_capacity_check;
ALTER TABLE public.transport_routes
  ADD CONSTRAINT transport_routes_capacity_check CHECK (capacity BETWEEN 1 AND 1000);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_school_unique ON public.students(id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_routes_id_school_unique ON public.transport_routes(id, school_id);

-- Replace the single-column student reference with tenant-bound references.
ALTER TABLE public.bus_assignments
  DROP CONSTRAINT IF EXISTS bus_assignments_student_id_fkey;
ALTER TABLE public.bus_assignments
  DROP CONSTRAINT IF EXISTS bus_assignments_student_school_fkey;
ALTER TABLE public.bus_assignments
  ADD CONSTRAINT bus_assignments_student_school_fkey
  FOREIGN KEY (student_id, school_id)
  REFERENCES public.students(id, school_id) ON DELETE CASCADE;
ALTER TABLE public.bus_assignments
  DROP CONSTRAINT IF EXISTS bus_assignments_route_school_fkey;
ALTER TABLE public.bus_assignments
  ADD CONSTRAINT bus_assignments_route_school_fkey
  FOREIGN KEY (route_id, school_id)
  REFERENCES public.transport_routes(id, school_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_bus_assignments_route_active
  ON public.bus_assignments(school_id, route_id)
  WHERE active = true;

CREATE OR REPLACE FUNCTION private.enforce_bus_assignment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  route_capacity integer;
  active_assignments integer;
BEGIN
  IF NOT NEW.active THEN
    RETURN NEW;
  END IF;

  -- Locking the route row serializes concurrent assignments to the same bus.
  SELECT capacity INTO route_capacity
  FROM public.transport_routes
  WHERE id = NEW.route_id AND school_id = NEW.school_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active bus route from this school.' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = NEW.student_id AND school_id = NEW.school_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Choose an active student from this school.' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO active_assignments
  FROM public.bus_assignments
  WHERE school_id = NEW.school_id AND route_id = NEW.route_id
    AND active = true AND id <> NEW.id;
  IF active_assignments >= route_capacity THEN
    RAISE EXCEPTION 'This bus route is full. Increase its capacity or choose another route.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bus_assignment_capacity_guard ON public.bus_assignments;
CREATE TRIGGER bus_assignment_capacity_guard
BEFORE INSERT OR UPDATE OF school_id, student_id, route_id, active
ON public.bus_assignments
FOR EACH ROW EXECUTE FUNCTION private.enforce_bus_assignment_capacity();

CREATE OR REPLACE FUNCTION private.prevent_bus_capacity_below_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  active_assignments integer;
BEGIN
  SELECT count(*) INTO active_assignments
  FROM public.bus_assignments
  WHERE school_id = NEW.school_id AND route_id = NEW.id AND active = true;
  IF NEW.capacity < active_assignments THEN
    RAISE EXCEPTION 'Bus capacity cannot be lower than the number of active student assignments.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transport_route_capacity_guard ON public.transport_routes;
CREATE TRIGGER transport_route_capacity_guard
BEFORE UPDATE OF capacity ON public.transport_routes
FOR EACH ROW EXECUTE FUNCTION private.prevent_bus_capacity_below_assignments();

NOTIFY pgrst, 'reload schema';
COMMIT;
