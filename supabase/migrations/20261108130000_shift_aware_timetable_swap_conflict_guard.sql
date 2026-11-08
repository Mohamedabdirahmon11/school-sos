-- Preserve shift-specific times when swapping timetable slots and reject
-- teacher/room overlaps atomically inside the database function.
CREATE OR REPLACE FUNCTION public.schoolos_swap_timetable_slots(
  p_school_id VARCHAR,
  p_first_id VARCHAR,
  p_second_id VARCHAR
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  first_slot public.timetable_slots%ROWTYPE;
  second_slot public.timetable_slots%ROWTYPE;
  first_start VARCHAR(5);
  second_start VARCHAR(5);
  first_minutes INTEGER;
  second_minutes INTEGER;
  first_break_after INTEGER;
  second_break_after INTEGER;
  first_break_minutes INTEGER;
  second_break_minutes INTEGER;
  first_target_start INTEGER;
  second_target_start INTEGER;
  first_target_end INTEGER;
  second_target_end INTEGER;
  first_start_text VARCHAR(5);
  first_end_text VARCHAR(5);
  second_start_text VARCHAR(5);
  second_end_text VARCHAR(5);
BEGIN
  SELECT * INTO first_slot
  FROM public.timetable_slots
  WHERE id = p_first_id AND school_id = p_school_id AND is_active = TRUE
  FOR UPDATE;

  SELECT * INTO second_slot
  FROM public.timetable_slots
  WHERE id = p_second_id AND school_id = p_school_id AND is_active = TRUE
  FOR UPDATE;

  IF first_slot.id IS NULL OR second_slot.id IS NULL OR first_slot.id = second_slot.id THEN
    RAISE EXCEPTION 'Choose two different active timetable slots in this school.';
  END IF;

  SELECT
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_first_period_start, '13:00') ELSE COALESCE(s.first_period_start, '08:00') END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_period_minutes, 40) ELSE COALESCE(s.period_minutes, 40) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_after_period, 3) ELSE COALESCE(s.break_after_period, 3) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_minutes, 20) ELSE COALESCE(s.break_minutes, 20) END
  INTO first_start, first_minutes, first_break_after, first_break_minutes
  FROM public.classes c
  LEFT JOIN public.timetable_settings s ON s.school_id = c.school_id
  WHERE c.id = first_slot.class_id AND c.school_id = p_school_id;

  SELECT
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_first_period_start, '13:00') ELSE COALESCE(s.first_period_start, '08:00') END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_period_minutes, 40) ELSE COALESCE(s.period_minutes, 40) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_after_period, 3) ELSE COALESCE(s.break_after_period, 3) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_minutes, 20) ELSE COALESCE(s.break_minutes, 20) END
  INTO second_start, second_minutes, second_break_after, second_break_minutes
  FROM public.classes c
  LEFT JOIN public.timetable_settings s ON s.school_id = c.school_id
  WHERE c.id = second_slot.class_id AND c.school_id = p_school_id;

  first_target_start :=
    split_part(first_start, ':', 1)::INTEGER * 60
    + split_part(first_start, ':', 2)::INTEGER
    + (second_slot.period_number - 1) * first_minutes
    + CASE WHEN second_slot.period_number > first_break_after THEN first_break_minutes ELSE 0 END;

  second_target_start :=
    split_part(second_start, ':', 1)::INTEGER * 60
    + split_part(second_start, ':', 2)::INTEGER
    + (first_slot.period_number - 1) * second_minutes
    + CASE WHEN first_slot.period_number > second_break_after THEN second_break_minutes ELSE 0 END;

  first_target_end := first_target_start + first_minutes;
  second_target_end := second_target_start + second_minutes;

  first_start_text := lpad((first_target_start / 60)::TEXT, 2, '0') || ':' || lpad((first_target_start % 60)::TEXT, 2, '0');
  first_end_text := lpad((first_target_end / 60)::TEXT, 2, '0') || ':' || lpad((first_target_end % 60)::TEXT, 2, '0');
  second_start_text := lpad((second_target_start / 60)::TEXT, 2, '0') || ':' || lpad((second_target_start % 60)::TEXT, 2, '0');
  second_end_text := lpad((second_target_end / 60)::TEXT, 2, '0') || ':' || lpad((second_target_end % 60)::TEXT, 2, '0');

  IF EXISTS (
    SELECT 1 FROM public.timetable_slots other
    WHERE other.school_id = p_school_id AND other.is_active = TRUE
      AND other.id NOT IN (p_first_id, p_second_id)
      AND other.day_of_week = second_slot.day_of_week
      AND other.teacher_id = first_slot.teacher_id
      AND first_start_text < other.end_time AND first_end_text > other.start_time
  ) OR EXISTS (
    SELECT 1 FROM public.timetable_slots other
    WHERE other.school_id = p_school_id AND other.is_active = TRUE
      AND other.id NOT IN (p_first_id, p_second_id)
      AND other.day_of_week = first_slot.day_of_week
      AND other.teacher_id = second_slot.teacher_id
      AND second_start_text < other.end_time AND second_end_text > other.start_time
  ) THEN
    RAISE EXCEPTION 'The swap would create an overlapping teacher schedule.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.timetable_slots other
    WHERE other.school_id = p_school_id AND other.is_active = TRUE
      AND other.id NOT IN (p_first_id, p_second_id)
      AND other.day_of_week = second_slot.day_of_week
      AND NULLIF(BTRIM(first_slot.room_number), '') IS NOT NULL
      AND LOWER(BTRIM(other.room_number)) = LOWER(BTRIM(first_slot.room_number))
      AND first_start_text < other.end_time AND first_end_text > other.start_time
  ) OR EXISTS (
    SELECT 1 FROM public.timetable_slots other
    WHERE other.school_id = p_school_id AND other.is_active = TRUE
      AND other.id NOT IN (p_first_id, p_second_id)
      AND other.day_of_week = first_slot.day_of_week
      AND NULLIF(BTRIM(second_slot.room_number), '') IS NOT NULL
      AND LOWER(BTRIM(other.room_number)) = LOWER(BTRIM(second_slot.room_number))
      AND second_start_text < other.end_time AND second_end_text > other.start_time
  ) THEN
    RAISE EXCEPTION 'The swap would create an overlapping classroom reservation.';
  END IF;

  IF first_slot.day_of_week = second_slot.day_of_week
    AND first_slot.teacher_id = second_slot.teacher_id
    AND first_start_text < second_end_text AND first_end_text > second_start_text THEN
    RAISE EXCEPTION 'The two swapped periods would overlap for the same teacher.';
  END IF;

  IF first_slot.day_of_week = second_slot.day_of_week
    AND NULLIF(BTRIM(first_slot.room_number), '') IS NOT NULL
    AND LOWER(BTRIM(first_slot.room_number)) = LOWER(BTRIM(second_slot.room_number))
    AND first_start_text < second_end_text AND first_end_text > second_start_text THEN
    RAISE EXCEPTION 'The two swapped periods would reserve the same room at overlapping times.';
  END IF;

  UPDATE public.timetable_slots SET
    day_of_week = second_slot.day_of_week,
    period_number = second_slot.period_number,
    start_time = first_start_text,
    end_time = first_end_text
  WHERE id = p_first_id AND school_id = p_school_id;

  UPDATE public.timetable_slots SET
    day_of_week = first_slot.day_of_week,
    period_number = first_slot.period_number,
    start_time = second_start_text,
    end_time = second_end_text
  WHERE id = p_second_id AND school_id = p_school_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) TO service_role;
