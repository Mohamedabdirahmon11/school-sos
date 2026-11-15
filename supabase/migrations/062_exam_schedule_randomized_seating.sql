-- Randomized, stable seat ordering for mixed-class exam rooms.
-- The hash makes the shuffle stable for a published schedule and reproducible for audits.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_publish_exam_schedule(
  p_school_id VARCHAR(64),
  p_schedule_id VARCHAR(64),
  p_published_by VARCHAR(64)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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
              AND cohort_class.is_selected IS TRUE
              AND cohort_class.class_id = current_assignment.class_id
         )
       )
       AND current_assignment.subject_id = v_schedule.subject_id
       AND current_assignment.is_active IS TRUE
       AND current_assignment.teacher_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'The assigned teacher already has an overlapping exam.'; END IF;

  SELECT COUNT(*) INTO v_cohort_count
    FROM public.exam_schedule_cohort_students
   WHERE school_id = p_school_id AND schedule_id = p_schedule_id AND is_selected IS TRUE;

  IF v_cohort_count > 0 THEN
    SELECT COUNT(*) INTO v_student_count
      FROM public.exam_schedule_cohort_students AS cohort
      JOIN public.students AS student
        ON student.id = cohort.student_id
       AND student.school_id = p_school_id
       AND student.status = 'active'
     WHERE cohort.school_id = p_school_id AND cohort.schedule_id = p_schedule_id AND cohort.is_selected IS TRUE;
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
         AND cohort.is_selected IS TRUE
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
           ROW_NUMBER() OVER (ORDER BY md5(cohort.student_id || v_schedule.id), student.student_id, student.id)::INTEGER
      FROM public.exam_schedule_cohort_students AS cohort
      JOIN public.students AS student ON student.id = cohort.student_id AND student.school_id = p_school_id
     WHERE cohort.school_id = p_school_id AND cohort.schedule_id = p_schedule_id AND cohort.is_selected IS TRUE;
  ELSE
    INSERT INTO public.exam_seat_assignments (id, school_id, schedule_id, student_id, seat_number)
    SELECT 'seat-' || gen_random_uuid()::TEXT, p_school_id, p_schedule_id, student.id,
           ROW_NUMBER() OVER (ORDER BY md5(student.id || v_schedule.id), student.student_id, student.id)::INTEGER
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
