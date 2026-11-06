-- Explicit service_role policies satisfy RLS lint while keeping browser roles blocked.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'exam_schedules'
       AND policyname = 'exam_schedules_service_role_all'
  ) THEN
    CREATE POLICY exam_schedules_service_role_all
      ON public.exam_schedules
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'exam_seat_assignments'
       AND policyname = 'exam_seat_assignments_service_role_all'
  ) THEN
    CREATE POLICY exam_seat_assignments_service_role_all
      ON public.exam_seat_assignments
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

COMMIT;
