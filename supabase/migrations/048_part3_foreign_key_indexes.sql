-- Part 3: cover newly introduced foreign keys to keep assignment and lending lookups efficient.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_bus_assignments_route_school
  ON public.bus_assignments(route_id, school_id);
CREATE INDEX IF NOT EXISTS idx_bus_assignments_student_school
  ON public.bus_assignments(student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_recorded_by
  ON public.discipline_incidents(recorded_by);
CREATE INDEX IF NOT EXISTS idx_library_loans_issued_by
  ON public.library_loans(issued_by);
CREATE INDEX IF NOT EXISTS idx_library_loans_returned_by
  ON public.library_loans(returned_by);

NOTIFY pgrst, 'reload schema';
COMMIT;
