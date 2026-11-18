-- Step 9: extend the existing daily attendance register; preserve all existing rows.
BEGIN;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS section_id uuid,
  ADD COLUMN IF NOT EXISTS period_id uuid,
  ADD COLUMN IF NOT EXISTS subject_id varchar,
  ADD COLUMN IF NOT EXISTS marked_by varchar,
  ADD COLUMN IF NOT EXISTS marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.attendance_records
SET marked_by = COALESCE(marked_by, recorded_by),
    marked_at = COALESCE(marked_at, recorded_at),
    updated_at = COALESCE(updated_at, recorded_at, now())
WHERE marked_by IS NULL OR marked_at IS NULL OR updated_at IS NULL;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_period_fk
    FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT,
  ADD CONSTRAINT attendance_records_section_fk
    FOREIGN KEY (section_id) REFERENCES public.class_sections(id) ON DELETE RESTRICT,
  ADD CONSTRAINT attendance_records_subject_fk
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT;

-- The previous uniqueness rule was once per class/student/day. A nullable period
-- now distinguishes daily attendance (NULL) from lesson attendance.
DROP INDEX IF EXISTS public.idx_attendance_unique_day;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_student_period_day_uidx
  ON public.attendance_records
    (school_id, date, student_id, COALESCE(period_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS attendance_records_school_class_date_idx
  ON public.attendance_records (school_id, class_id, date);
CREATE INDEX IF NOT EXISTS attendance_records_school_subject_date_idx
  ON public.attendance_records (school_id, subject_id, date)
  WHERE subject_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.attendance_settings (
  school_id varchar PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  attendance_mode varchar NOT NULL DEFAULT 'daily'
    CHECK (attendance_mode IN ('daily', 'per_period')),
  edit_window_hours integer NOT NULL DEFAULT 2
    CHECK (edit_window_hours BETWEEN 0 AND 168),
  late_threshold_minutes integer NOT NULL DEFAULT 15
    CHECK (late_threshold_minutes BETWEEN 0 AND 240),
  updated_by varchar,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.attendance_settings (school_id)
SELECT id FROM public.schools
ON CONFLICT (school_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  date date NOT NULL,
  class_id varchar NOT NULL,
  section_id uuid,
  period_id uuid,
  teacher_id varchar NOT NULL,
  submitted_at timestamptz,
  is_locked boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz,
  unlocked_by varchar,
  unlock_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_sessions_class_school_fk
    FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE,
  CONSTRAINT attendance_sessions_teacher_school_fk
    FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE RESTRICT,
  CONSTRAINT attendance_sessions_section_fk
    FOREIGN KEY (section_id) REFERENCES public.class_sections(id) ON DELETE RESTRICT,
  CONSTRAINT attendance_sessions_period_fk
    FOREIGN KEY (period_id) REFERENCES public.periods(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_once_per_class_period_day_uidx
  ON public.attendance_sessions
    (school_id, class_id, date, COALESCE(period_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS attendance_sessions_school_date_idx
  ON public.attendance_sessions (school_id, date, class_id);
CREATE INDEX IF NOT EXISTS attendance_sessions_teacher_date_idx
  ON public.attendance_sessions (school_id, teacher_id, date);

CREATE TABLE IF NOT EXISTS public.teacher_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id varchar NOT NULL,
  date date NOT NULL,
  status varchar NOT NULL CHECK (status IN ('present', 'absent', 'late', 'on_leave')),
  check_in timestamptz,
  check_out timestamptz,
  note text,
  marked_by varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_attendance_teacher_school_fk
    FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_attendance_one_per_day UNIQUE (school_id, teacher_id, date),
  CONSTRAINT teacher_attendance_check_times CHECK (check_out IS NULL OR check_in IS NULL OR check_out >= check_in)
);
CREATE INDEX IF NOT EXISTS teacher_attendance_school_date_idx
  ON public.teacher_attendance (school_id, date, status);

CREATE TABLE IF NOT EXISTS public.attendance_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  attendance_record_id varchar,
  entity_type varchar NOT NULL CHECK (entity_type IN ('student', 'teacher', 'session', 'settings')),
  entity_id varchar NOT NULL,
  action varchar NOT NULL,
  before_data jsonb,
  after_data jsonb,
  changed_by varchar NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  details text
);
CREATE INDEX IF NOT EXISTS attendance_audit_school_changed_idx
  ON public.attendance_audit_logs (school_id, changed_at DESC);

-- One server-side authorization predicate is shared by attendance RLS and APIs.
-- It supports current-year assignments, legacy class_subjects, Form Teachers
-- for daily attendance, and date-limited substitute lessons.
CREATE OR REPLACE FUNCTION private.auth_can_mark_attendance(
  target_school_id varchar,
  target_class_id varchar,
  target_subject_id varchar,
  target_period_id uuid,
  target_date date
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.teachers t ON t.user_id = u.id AND t.school_id = target_school_id
    WHERE u.id = private.auth_user_id()
      AND u.role = 'teacher'
      AND u.school_id = target_school_id
      AND t.status = 'active'
      AND (
        (
          target_period_id IS NULL
          AND target_subject_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = target_class_id
              AND c.school_id = target_school_id
              AND c.class_teacher_id = u.id
          )
        )
        OR EXISTS (
          SELECT 1
          FROM public.teacher_class_subject_assignments a
          JOIN public.academic_years ay
            ON ay.id = a.academic_year_id
           AND ay.school_id = a.school_id
           AND ay.is_current = true
          WHERE a.school_id = target_school_id
            AND a.class_id = target_class_id
            AND a.teacher_id = t.id
            AND (target_subject_id IS NULL OR a.subject_id = target_subject_id)
            AND (a.section_id IS NULL OR target_section_id_placeholder(a.section_id, target_school_id))
        )
        OR EXISTS (
          SELECT 1
          FROM public.class_subjects cs
          WHERE cs.school_id = target_school_id
            AND cs.class_id = target_class_id
            AND cs.teacher_id = t.id
            AND cs.is_active = true
            AND (target_subject_id IS NULL OR cs.subject_id = target_subject_id)
        )
        OR EXISTS (
          SELECT 1
          FROM public.timetable_substitutions sub
          JOIN public.timetable_slots slot
            ON slot.id = sub.entry_id
           AND slot.school_id = sub.school_id
          JOIN public.periods p
            ON p.school_id = slot.school_id
           AND p.number = slot.period_number
          WHERE sub.school_id = target_school_id
            AND sub.substitute_teacher_id = t.id
            AND sub.substitute_date = target_date
            AND slot.class_id = target_class_id
            AND slot.is_active = true
            AND (target_period_id IS NULL OR p.id = target_period_id)
            AND (target_subject_id IS NULL OR slot.subject_id = target_subject_id)
            AND trim(to_char(target_date, 'Day')) = slot.day_of_week
        )
      )
  );
$$;

-- Replace the old tenant-wide ALL policy for attendance with role/assignment checks.
DROP POLICY IF EXISTS tenant_scope_v2 ON public.attendance_records;
DROP POLICY IF EXISTS attendance_role_read ON public.attendance_records;
DROP POLICY IF EXISTS attendance_admin_all ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_read_assigned ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_insert_assigned ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_update_assigned ON public.attendance_records;

CREATE POLICY attendance_admin_all ON public.attendance_records
  FOR ALL TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND private.auth_user_role() IN ('school_admin', 'super_admin')
  )
  WITH CHECK (
    (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id())
    AND private.auth_user_role() IN ('school_admin', 'super_admin')
  );

CREATE POLICY attendance_teacher_read_assigned ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND private.auth_can_mark_attendance(school_id, class_id, subject_id, period_id, date)
  );

CREATE POLICY attendance_teacher_insert_assigned ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.auth_school_id()
    AND marked_by = private.auth_user_id()
    AND private.auth_can_mark_attendance(school_id, class_id, subject_id, period_id, date)
  );

CREATE POLICY attendance_teacher_update_assigned ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND marked_by = private.auth_user_id()
    AND private.auth_can_mark_attendance(school_id, class_id, subject_id, period_id, date)
  )
  WITH CHECK (
    school_id = private.auth_school_id()
    AND marked_by = private.auth_user_id()
    AND private.auth_can_mark_attendance(school_id, class_id, subject_id, period_id, date)
  );

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_settings_admin_all ON public.attendance_settings
  FOR ALL TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','super_admin'))
  WITH CHECK ((private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id()) AND private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY attendance_settings_teacher_read ON public.attendance_settings
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'teacher');

CREATE POLICY attendance_sessions_admin_all ON public.attendance_sessions
  FOR ALL TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','super_admin'))
  WITH CHECK ((private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id()) AND private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY attendance_sessions_teacher_read ON public.attendance_sessions
  FOR SELECT TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND private.auth_can_mark_attendance(school_id, class_id, NULL, period_id, date)
  );
CREATE POLICY attendance_sessions_teacher_insert ON public.attendance_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.auth_school_id()
    AND teacher_id IN (SELECT id FROM public.teachers WHERE user_id = private.auth_user_id() AND school_id = private.auth_school_id())
    AND private.auth_can_mark_attendance(school_id, class_id, NULL, period_id, date)
  );
CREATE POLICY attendance_sessions_teacher_update ON public.attendance_sessions
  FOR UPDATE TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND teacher_id IN (SELECT id FROM public.teachers WHERE user_id = private.auth_user_id() AND school_id = private.auth_school_id())
    AND is_locked = false
    AND private.auth_can_mark_attendance(school_id, class_id, NULL, period_id, date)
  )
  WITH CHECK (
    school_id = private.auth_school_id()
    AND teacher_id IN (SELECT id FROM public.teachers WHERE user_id = private.auth_user_id() AND school_id = private.auth_school_id())
    AND is_locked = false
    AND private.auth_can_mark_attendance(school_id, class_id, NULL, period_id, date)
  );

CREATE POLICY teacher_attendance_admin_all ON public.teacher_attendance
  FOR ALL TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','super_admin'))
  WITH CHECK ((private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id()) AND private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY teacher_attendance_self_read ON public.teacher_attendance
  FOR SELECT TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND teacher_id IN (SELECT id FROM public.teachers WHERE user_id = private.auth_user_id() AND school_id = private.auth_school_id())
  );

CREATE POLICY attendance_audit_admin_all ON public.attendance_audit_logs
  FOR ALL TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','super_admin'))
  WITH CHECK ((private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id()) AND private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY attendance_audit_teacher_read_own ON public.attendance_audit_logs
  FOR SELECT TO authenticated
  USING (
    school_id = private.auth_school_id()
    AND changed_by = private.auth_user_id()
    AND private.auth_user_role() = 'teacher'
  );

REVOKE ALL ON FUNCTION private.auth_can_mark_attendance(varchar, varchar, varchar, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_can_mark_attendance(varchar, varchar, varchar, uuid, date) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_audit_logs TO authenticated;

COMMIT;
