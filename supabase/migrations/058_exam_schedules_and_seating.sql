-- School-scoped exam timetable, room allocation, and automatically assigned seats.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_id_school_unique
  ON public.classes (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_id_school_unique
  ON public.subjects (id, school_id);

CREATE TABLE IF NOT EXISTS public.exam_schedules (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL,
  subject_id VARCHAR(64) NOT NULL,
  exam_name VARCHAR(120) NOT NULL,
  exam_type VARCHAR(16) NOT NULL CHECK (exam_type IN ('small', 'big')),
  academic_year VARCHAR(24) NOT NULL,
  semester VARCHAR(16) NOT NULL CHECK (semester IN ('Semester 1', 'Semester 2')),
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room_name VARCHAR(120) NOT NULL,
  seat_capacity INTEGER NOT NULL CHECK (seat_capacity BETWEEN 1 AND 500),
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  created_by VARCHAR(64) NOT NULL,
  published_by VARCHAR(64),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_schedules_valid_time CHECK (start_time < end_time),
  CONSTRAINT exam_schedules_id_school_unique UNIQUE (id, school_id),
  CONSTRAINT exam_schedules_class_school_fk FOREIGN KEY (class_id, school_id)
    REFERENCES public.classes(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_schedules_subject_school_fk FOREIGN KEY (subject_id, school_id)
    REFERENCES public.subjects(id, school_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_school_date
  ON public.exam_schedules (school_id, exam_date, start_time);
CREATE INDEX IF NOT EXISTS idx_exam_schedules_school_class
  ON public.exam_schedules (school_id, class_id, academic_year, semester);

CREATE TABLE IF NOT EXISTS public.exam_seat_assignments (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  schedule_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  seat_number INTEGER NOT NULL CHECK (seat_number > 0),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_seats_schedule_school_fk FOREIGN KEY (schedule_id, school_id)
    REFERENCES public.exam_schedules(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_seats_student_school_fk FOREIGN KEY (student_id, school_id)
    REFERENCES public.students(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_seats_unique_student UNIQUE (schedule_id, student_id),
  CONSTRAINT exam_seats_unique_number UNIQUE (schedule_id, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_exam_seats_school_schedule
  ON public.exam_seat_assignments (school_id, schedule_id, seat_number);

ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_seat_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_schedules, public.exam_seat_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_schedules, public.exam_seat_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_publish_exam_schedule(
  p_school_id VARCHAR(64),
  p_schedule_id VARCHAR(64),
  p_published_by VARCHAR(64)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schedule public.exam_schedules%ROWTYPE;
  v_student_count INTEGER;
BEGIN
  SELECT * INTO v_schedule
    FROM public.exam_schedules
   WHERE id = p_schedule_id AND school_id = p_school_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam schedule was not found in this school.';
  END IF;
  IF v_schedule.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft exam schedules can be published.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.exam_schedules AS other
     WHERE other.school_id = p_school_id
       AND other.id <> p_schedule_id
       AND other.status <> 'cancelled'
       AND (lower(btrim(other.room_name)) = lower(btrim(v_schedule.room_name))
            OR other.class_id = v_schedule.class_id)
       AND other.exam_date = v_schedule.exam_date
       AND (v_schedule.exam_date + v_schedule.start_time) < (other.exam_date + other.end_time)
       AND (other.exam_date + other.start_time) < (v_schedule.exam_date + v_schedule.end_time)
  ) THEN
    RAISE EXCEPTION 'The selected room is already booked during this time.';
  END IF;

  SELECT COUNT(*) INTO v_student_count
    FROM public.students AS student
   WHERE student.school_id = p_school_id
     AND student.class_id = v_schedule.class_id
     AND student.status = 'active';

  IF v_student_count = 0 THEN
    RAISE EXCEPTION 'This class has no active students to assign seats to.';
  END IF;
  IF v_student_count > v_schedule.seat_capacity THEN
    RAISE EXCEPTION 'Room capacity is too small for the active students in this class.';
  END IF;

  INSERT INTO public.exam_seat_assignments (
    id, school_id, schedule_id, student_id, seat_number
  )
  SELECT
    'seat-' || gen_random_uuid()::text,
    p_school_id,
    p_schedule_id,
    student.id,
    ROW_NUMBER() OVER (ORDER BY student.student_id, student.id)::INTEGER
  FROM public.students AS student
  WHERE student.school_id = p_school_id
    AND student.class_id = v_schedule.class_id
    AND student.status = 'active';

  UPDATE public.exam_schedules
     SET status = 'published',
         published_by = p_published_by,
         published_at = NOW(),
         updated_at = NOW()
   WHERE id = p_schedule_id
     AND school_id = p_school_id;

  RETURN jsonb_build_object(
    'schedule_id', p_schedule_id,
    'status', 'published',
    'seat_count', v_student_count,
    'published_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_publish_exam_schedule(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_publish_exam_schedule(VARCHAR, VARCHAR, VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
