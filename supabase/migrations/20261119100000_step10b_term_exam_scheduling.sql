-- STEP 10B: term-exam timetable, shifts, mixed-room seating and invigilation.
-- Additive migration: reuses exam_rooms, exam_schedules, cohort and seat rows;
-- existing quizzes/marks and all previously published schedules remain intact.
BEGIN;

-- Classes already use a numeric shift for the lesson timetable (1/2). Keep it
-- unchanged and expose a dedicated, explicit normal exam shift instead.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS normal_exam_shift TEXT NOT NULL DEFAULT 'morning';
UPDATE public.classes
   SET normal_exam_shift = CASE WHEN shift = 2 THEN 'afternoon' ELSE 'morning' END
 WHERE normal_exam_shift IS NULL OR normal_exam_shift NOT IN ('morning','afternoon');
ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_normal_exam_shift_check;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_normal_exam_shift_check
  CHECK (normal_exam_shift IN ('morning','afternoon'));

CREATE TABLE IF NOT EXISTS public.exam_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id UUID NOT NULL,
  name VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by VARCHAR(64),
  published_by VARCHAR(64),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  FOREIGN KEY (term_id, school_id) REFERENCES public.terms(id, school_id) ON DELETE RESTRICT,
  CHECK (start_date <= end_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS exam_periods_school_term_uidx
  ON public.exam_periods(school_id, term_id);
CREATE INDEX IF NOT EXISTS exam_periods_school_dates_idx
  ON public.exam_periods(school_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.class_exam_settings (
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL,
  term_id UUID NOT NULL,
  exam_shift TEXT NOT NULL CHECK (exam_shift IN ('morning','afternoon')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, class_id, term_id),
  FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (term_id, school_id) REFERENCES public.terms(id, school_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.exam_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_period_id UUID NOT NULL,
  exam_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  UNIQUE (exam_period_id, exam_date),
  FOREIGN KEY (exam_period_id, school_id) REFERENCES public.exam_periods(id, school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS exam_days_school_date_idx ON public.exam_days(school_id, exam_date);

CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_day_id UUID NOT NULL,
  seq SMALLINT NOT NULL CHECK (seq > 0),
  name VARCHAR(80) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_tag TEXT NOT NULL DEFAULT 'all' CHECK (shift_tag IN ('morning','afternoon','all')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  UNIQUE (exam_day_id, seq),
  FOREIGN KEY (exam_day_id, school_id) REFERENCES public.exam_days(id, school_id) ON DELETE CASCADE,
  CHECK (start_time < end_time)
);
CREATE INDEX IF NOT EXISTS exam_sessions_school_day_time_idx
  ON public.exam_sessions(school_id, exam_day_id, start_time);

-- Extend the existing schedule master instead of creating a parallel exam
-- schedule table. One row represents one subject for one manhaj group/session;
-- room-by-room allocations live on the existing seat assignment records.
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS exam_period_id UUID,
  ADD COLUMN IF NOT EXISTS exam_session_id UUID,
  ADD COLUMN IF NOT EXISTS manhaj_group_key VARCHAR(128),
  ADD COLUMN IF NOT EXISTS exam_shift TEXT;
ALTER TABLE public.exam_schedules
  DROP CONSTRAINT IF EXISTS exam_schedules_exam_type_check;
ALTER TABLE public.exam_schedules
  ADD CONSTRAINT exam_schedules_exam_type_check
  CHECK (exam_type IN ('small','big','term'));
ALTER TABLE public.exam_schedules
  ADD CONSTRAINT exam_schedules_period_school_fk
    FOREIGN KEY (exam_period_id, school_id) REFERENCES public.exam_periods(id, school_id) ON DELETE CASCADE,
  ADD CONSTRAINT exam_schedules_session_school_fk
    FOREIGN KEY (exam_session_id, school_id) REFERENCES public.exam_sessions(id, school_id) ON DELETE RESTRICT,
  ADD CONSTRAINT exam_schedules_exam_shift_check
    CHECK (exam_shift IS NULL OR exam_shift IN ('morning','afternoon','all'));
CREATE UNIQUE INDEX IF NOT EXISTS exam_schedules_term_group_subject_uidx
  ON public.exam_schedules(school_id, exam_session_id, manhaj_group_key, subject_id, exam_shift)
  WHERE exam_type = 'term' AND exam_session_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS exam_schedules_term_period_idx
  ON public.exam_schedules(school_id, exam_period_id, exam_session_id)
  WHERE exam_type = 'term';

-- Keep the old room_id as a legacy/single-room hint. Mixed term exams assign
-- each student to a room via exam_seat_assignments.room_id.
ALTER TABLE public.exam_schedules
  DROP CONSTRAINT IF EXISTS exam_schedules_published_room_required;
ALTER TABLE public.exam_schedules
  ADD CONSTRAINT exam_schedules_published_room_required
  CHECK (status <> 'published' OR exam_type = 'term' OR room_id IS NOT NULL);

ALTER TABLE public.exam_seat_assignments
  ADD COLUMN IF NOT EXISTS room_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS class_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS exam_number INTEGER;
ALTER TABLE public.exam_seat_assignments
  ADD CONSTRAINT exam_seats_room_school_fk
    FOREIGN KEY (room_id, school_id) REFERENCES public.exam_rooms(id, school_id) ON DELETE RESTRICT,
  ADD CONSTRAINT exam_seats_class_school_fk
    FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE,
  ADD CONSTRAINT exam_seats_exam_number_check
    CHECK (exam_number IS NULL OR exam_number > 0);
CREATE UNIQUE INDEX IF NOT EXISTS exam_seats_term_class_number_uidx
  ON public.exam_seat_assignments(school_id, schedule_id, class_id, exam_number)
  WHERE exam_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS exam_seats_term_room_idx
  ON public.exam_seat_assignments(school_id, schedule_id, room_id, class_id, exam_number);

CREATE TABLE IF NOT EXISTS public.exam_invigilators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_session_id UUID NOT NULL,
  room_id VARCHAR(64) NOT NULL,
  teacher_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, school_id),
  UNIQUE (school_id, exam_session_id, teacher_id),
  UNIQUE (school_id, exam_session_id, room_id, teacher_id),
  FOREIGN KEY (exam_session_id, school_id) REFERENCES public.exam_sessions(id, school_id) ON DELETE CASCADE,
  FOREIGN KEY (room_id, school_id) REFERENCES public.exam_rooms(id, school_id) ON DELETE RESTRICT,
  FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS exam_invigilators_school_session_idx
  ON public.exam_invigilators(school_id, exam_session_id, room_id);

-- Invigilators may not supervise a class/subject they teach in the same
-- session. The guard also verifies the teacher, room and session are in one school.
CREATE OR REPLACE FUNCTION public.schoolos_guard_exam_invigilator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.exam_seat_assignments seat
      JOIN public.exam_schedules schedule
        ON schedule.id = seat.schedule_id AND schedule.school_id = seat.school_id
      JOIN public.class_subjects assignment
        ON assignment.school_id = seat.school_id
       AND assignment.class_id = COALESCE(seat.class_id, (
         SELECT student.class_id FROM public.students student
          WHERE student.id = seat.student_id AND student.school_id = seat.school_id
       ))
       AND assignment.subject_id = schedule.subject_id
       AND assignment.teacher_id = NEW.teacher_id
       AND assignment.is_active IS TRUE
     WHERE seat.school_id = NEW.school_id
       AND seat.room_id = NEW.room_id
       AND schedule.exam_session_id = NEW.exam_session_id
       AND schedule.exam_type = 'term'
  ) THEN
    RAISE EXCEPTION 'A teacher cannot invigilate a class-subject they teach.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS exam_invigilator_teaching_conflict ON public.exam_invigilators;
CREATE TRIGGER exam_invigilator_teaching_conflict
BEFORE INSERT OR UPDATE OF school_id, exam_session_id, room_id, teacher_id
ON public.exam_invigilators
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_exam_invigilator();

-- These tables are only accessed through the authenticated SchoolOS API,
-- which applies school_id from the signed server session. Keep direct client
-- table access closed, matching the existing exam-room/schedule security model.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['exam_periods','class_exam_settings','exam_days','exam_sessions','exam_invigilators'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_role_all', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
