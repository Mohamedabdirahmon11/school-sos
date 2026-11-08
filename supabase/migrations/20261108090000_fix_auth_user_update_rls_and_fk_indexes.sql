-- Repair the SchoolOS/Auth UUID boundary without changing stable SchoolOS IDs.
-- Auth-linked profiles must update through private.auth_user_id(), not auth.uid().
-- password_reset_codes intentionally remains policy-less: service_role only.

DROP POLICY IF EXISTS users_update_scope ON public.users;

CREATE POLICY users_update_scope
ON public.users
FOR UPDATE
TO authenticated
USING (
  (private.auth_user_role())::text = 'super_admin'
  OR id::text = private.auth_user_id()
)
WITH CHECK (
  (private.auth_user_role())::text = 'super_admin'
  OR id::text = private.auth_user_id()
);

-- Match the leading column order of each composite foreign key so PostgreSQL
-- can efficiently check parent deletes/updates and joins.
CREATE INDEX IF NOT EXISTS idx_exam_schedules_class_school_fk
  ON public.exam_schedules (class_id, school_id);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_subject_school_fk
  ON public.exam_schedules (subject_id, school_id);

CREATE INDEX IF NOT EXISTS idx_exam_seats_schedule_school_fk
  ON public.exam_seat_assignments (schedule_id, school_id);

CREATE INDEX IF NOT EXISTS idx_exam_seats_student_school_fk
  ON public.exam_seat_assignments (student_id, school_id);

CREATE INDEX IF NOT EXISTS idx_school_health_visits_recorded_by_fk
  ON public.school_health_visits (recorded_by);
