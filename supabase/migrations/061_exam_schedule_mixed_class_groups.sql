-- Mixed-class exam groups: explicitly selected students can sit one shared session.
BEGIN;

CREATE TABLE IF NOT EXISTS public.exam_schedule_cohort_students (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  schedule_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  class_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT exam_cohort_schedule_school_fk FOREIGN KEY (schedule_id, school_id)
    REFERENCES public.exam_schedules(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_cohort_student_school_fk FOREIGN KEY (student_id, school_id)
    REFERENCES public.students(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_cohort_class_school_fk FOREIGN KEY (class_id, school_id)
    REFERENCES public.classes(id, school_id) ON DELETE CASCADE,
  CONSTRAINT exam_cohort_unique_student UNIQUE (schedule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_cohort_school_class
  ON public.exam_schedule_cohort_students (school_id, class_id, schedule_id);

ALTER TABLE public.exam_schedule_cohort_students ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_schedule_cohort_students FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exam_schedule_cohort_students TO service_role;
DROP POLICY IF EXISTS exam_schedule_cohort_service_role_all ON public.exam_schedule_cohort_students;
CREATE POLICY exam_schedule_cohort_service_role_all
  ON public.exam_schedule_cohort_students FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.schoolos_set_exam_schedule_cohort(
  p_school_id VARCHAR(64),
  p_schedule_id VARCHAR(64),
  p_student_ids TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_schedule public.exam_schedules%ROWTYPE;
  v_requested_count INTEGER := COALESCE(cardinality(p_student_ids), 0);
  v_valid_count INTEGER;
BEGIN
  SELECT * INTO v_schedule
    FROM public.exam_schedules
   WHERE id = p_schedule_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam schedule was not found in this school.'; END IF;
  IF v_schedule.status <> 'draft' THEN RAISE EXCEPTION 'Only draft exam schedules can have their student group changed.'; END IF;
  IF v_requested_count > v_schedule.seat_capacity THEN RAISE EXCEPTION 'The selected group exceeds room capacity.'; END IF;
  IF v_requested_count <> (SELECT COUNT(DISTINCT value) FROM unnest(COALESCE(p_student_ids, ARRAY[]::TEXT[])) AS value) THEN
    RAISE EXCEPTION 'The selected student list contains duplicates.';
  END IF;

  SELECT COUNT(*) INTO v_valid_count
    FROM public.students AS student
   WHERE student.school_id = p_school_id
     AND student.status = 'active'
     AND student.id = ANY(COALESCE(p_student_ids, ARRAY[]::TEXT[]));
  IF v_valid_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more selected students are inactive or do not belong to this school.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.students AS student
     WHERE student.school_id = p_school_id
       AND student.id = ANY(COALESCE(p_student_ids, ARRAY[]::TEXT[]))
       AND NOT EXISTS (
         SELECT 1 FROM public.class_subjects AS assignment
          WHERE assignment.school_id = p_school_id
            AND assignment.class_id = student.class_id
            AND assignment.subject_id = v_schedule.subject_id
            AND assignment.is_active IS TRUE
       )
  ) THEN
    RAISE EXCEPTION 'Every selected class must have the scheduled subject assigned.';
  END IF;

  DELETE FROM public.exam_schedule_cohort_students
   WHERE school_id = p_school_id AND schedule_id = p_schedule_id;

  INSERT INTO public.exam_schedule_cohort_students (id, school_id, schedule_id, student_id, class_id)
  SELECT 'cohort-' || gen_random_uuid()::TEXT, p_school_id, p_schedule_id, student.id, student.class_id
    FROM public.students AS student
   WHERE student.school_id = p_school_id
     AND student.status = 'active'
     AND student.id = ANY(COALESCE(p_student_ids, ARRAY[]::TEXT[]));

  RETURN v_requested_count;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_set_exam_schedule_cohort(VARCHAR, VARCHAR, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_set_exam_schedule_cohort(VARCHAR, VARCHAR, TEXT[]) TO service_role;

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
  v_cohort_count INTEGER;
BEGIN
  SELECT * INTO v_schedule
    FROM public.exam_schedules
   WHERE id = p_schedule_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exam schedule was not found in this school.'; END IF;
  IF v_schedule.status <> 'draft' THEN RAISE EXCEPTION 'Only draft exam schedules can be published.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_school_id || ':' || v_schedule.exam_date::text || ':room:' || lower(btrim(v_schedule.room_name)), 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_school_id || ':' || v_schedule.exam_date::text || ':class:' || v_schedule.class_id, 0
  ));

  IF EXISTS (
    SELECT 1 FROM public.exam_schedules AS other
     WHERE other.school_id = p_school_id AND other.id <> p_schedule_id
       AND other.status <> 'cancelled'
       AND (lower(btrim(other.room_name)) = lower(btrim(v_schedule.room_name))
            OR other.class_id = v_schedule.class_id)
       AND other.exam_date = v_schedule.exam_date
       AND (v_schedule.exam_date + v_schedule.start_time) < (other.exam_date + other.end_time)
       AND (other.exam_date + other.start_time) < (v_schedule.exam_date + v_schedule.end_time)
  ) THEN RAISE EXCEPTION 'The selected room or class is already booked during this time.'; END IF;

  IF EXISTS (
    SELECT 1
      FROM public.class_subjects AS current_assignment
      JOIN public.class_subjects AS other_assignment
        ON other_assignment.school_id = p_school_id
       AND other_assignment.teacher_id = current_assignment.teacher_id
       AND other_assignment.is_active IS TRUE
      JOIN public.exam_schedules AS other
        ON other.school_id = p_school_id
       AND other.class_id = other_assignment.class_id
       AND other.subject_id = other_assignment.subject_id
       AND other.id <> p_schedule_id
       AND other.status <> 'cancelled'
       AND other.exam_date = v_schedule.exam_date
       AND v_schedule.start_time < other.end_time
       AND other.start_time < v_schedule.end_time
     WHERE current_assignment.school_id = p_school_id
       AND (
         current_assignment.class_id = v_schedule.class_id
         OR EXISTS (
           SELECT 1 FROM public.exam_schedule_cohort_students AS cohort_class
            WHERE cohort_class.school_id = p_school_id
              AND cohort_class.schedule_id = p_schedule_id
              AND cohort_class.class_id = current_assignment.class_id
         )
       )
       AND current_assignment.subject_id = v_schedule.subject_id
       AND current_assignment.is_active IS TRUE
       AND current_assignment.teacher_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'The assigned teacher already has an overlapping exam.'; END IF;

  SELECT COUNT(*) INTO v_cohort_count
    FROM public.exam_schedule_cohort_students
   WHERE school_id = p_school_id AND schedule_id = p_schedule_id;

  IF v_cohort_count > 0 THEN
    SELECT COUNT(*) INTO v_student_count
      FROM public.exam_schedule_cohort_students AS cohort
      JOIN public.students AS student
        ON student.id = cohort.student_id
       AND student.school_id = p_school_id
       AND student.status = 'active'
     WHERE cohort.school_id = p_school_id AND cohort.schedule_id = p_schedule_id;
    IF v_student_count <> v_cohort_count THEN
      RAISE EXCEPTION 'The selected exam group contains inactive students. Rebuild the group before publishing.';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.exam_schedule_cohort_students AS cohort
        JOIN public.exam_seat_assignments AS seat
          ON seat.school_id = p_school_id AND seat.student_id = cohort.student_id
        JOIN public.exam_schedules AS other
          ON other.id = seat.schedule_id AND other.school_id = p_school_id
       WHERE cohort.school_id = p_school_id AND cohort.schedule_id = p_schedule_id
         AND other.id <> p_schedule_id AND other.status = 'published'
         AND other.exam_date = v_schedule.exam_date
         AND v_schedule.start_time < other.end_time
         AND other.start_time < v_schedule.end_time
    ) THEN RAISE EXCEPTION 'One or more students already have an exam at this time.'; END IF;
  ELSE
    SELECT COUNT(*) INTO v_student_count
      FROM public.students AS student
     WHERE student.school_id = p_school_id
       AND student.class_id = v_schedule.class_id
       AND student.status = 'active';
    IF EXISTS (
      SELECT 1
        FROM public.students AS student
        JOIN public.exam_seat_assignments AS seat
          ON seat.school_id = p_school_id AND seat.student_id = student.id
        JOIN public.exam_schedules AS other
          ON other.id = seat.schedule_id AND other.school_id = p_school_id
       WHERE student.school_id = p_school_id
         AND student.class_id = v_schedule.class_id
         AND student.status = 'active'
         AND other.id <> p_schedule_id AND other.status = 'published'
         AND other.exam_date = v_schedule.exam_date
         AND v_schedule.start_time < other.end_time
         AND other.start_time < v_schedule.end_time
    ) THEN RAISE EXCEPTION 'One or more students already have an exam at this time.'; END IF;
  END IF;

  IF v_student_count = 0 THEN RAISE EXCEPTION 'This exam group has no active students.'; END IF;
  IF v_student_count > v_schedule.seat_capacity THEN RAISE EXCEPTION 'Room capacity is too small for the selected exam group.'; END IF;

  IF v_cohort_count > 0 THEN
    INSERT INTO public.exam_seat_assignments (id, school_id, schedule_id, student_id, seat_number)
    SELECT 'seat-' || gen_random_uuid()::TEXT, p_school_id, p_schedule_id, cohort.student_id,
           ROW_NUMBER() OVER (ORDER BY student.student_id, student.id)::INTEGER
      FROM public.exam_schedule_cohort_students AS cohort
      JOIN public.students AS student ON student.id = cohort.student_id AND student.school_id = p_school_id
     WHERE cohort.school_id = p_school_id AND cohort.schedule_id = p_schedule_id;
  ELSE
    INSERT INTO public.exam_seat_assignments (id, school_id, schedule_id, student_id, seat_number)
    SELECT 'seat-' || gen_random_uuid()::TEXT, p_school_id, p_schedule_id, student.id,
           ROW_NUMBER() OVER (ORDER BY student.student_id, student.id)::INTEGER
      FROM public.students AS student
     WHERE student.school_id = p_school_id
       AND student.class_id = v_schedule.class_id
       AND student.status = 'active';
  END IF;

  UPDATE public.exam_schedules
     SET status = 'published', published_by = p_published_by,
         published_at = NOW(), updated_at = NOW()
   WHERE id = p_schedule_id AND school_id = p_school_id;

  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'status', 'published',
    'seat_count', v_student_count, 'published_at', NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_publish_exam_schedule(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_publish_exam_schedule(VARCHAR, VARCHAR, VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
