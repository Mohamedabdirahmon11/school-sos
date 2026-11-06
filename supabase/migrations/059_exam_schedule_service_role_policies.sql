-- Explicit service_role policies satisfy RLS lint while keeping browser roles blocked.
BEGIN;

DROP POLICY IF EXISTS exam_schedules_service_role_all ON public.exam_schedules;
CREATE POLICY exam_schedules_service_role_all
  ON public.exam_schedules
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS exam_seat_assignments_service_role_all ON public.exam_seat_assignments;
CREATE POLICY exam_seat_assignments_service_role_all
  ON public.exam_seat_assignments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
