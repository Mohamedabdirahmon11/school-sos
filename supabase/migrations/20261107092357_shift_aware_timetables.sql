-- Shift-aware timetable support.
-- Legacy timetable_settings columns remain Shift 1; no existing times or timetable rows are rewritten.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS shift SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_shift_check;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_shift_check CHECK (shift IN (1, 2));

ALTER TABLE public.timetable_settings
  ADD COLUMN IF NOT EXISTS shift2_first_period_start VARCHAR(5) NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS shift2_period_minutes INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS shift2_break_after_period INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS shift2_break_minutes INTEGER NOT NULL DEFAULT 20;

ALTER TABLE public.timetable_settings
  DROP CONSTRAINT IF EXISTS timetable_settings_shift2_period_minutes_check,
  ADD CONSTRAINT timetable_settings_shift2_period_minutes_check CHECK (shift2_period_minutes BETWEEN 20 AND 120),
  DROP CONSTRAINT IF EXISTS timetable_settings_shift2_break_after_period_check,
  ADD CONSTRAINT timetable_settings_shift2_break_after_period_check CHECK (shift2_break_after_period BETWEEN 1 AND 5),
  DROP CONSTRAINT IF EXISTS timetable_settings_shift2_break_minutes_check,
  ADD CONSTRAINT timetable_settings_shift2_break_minutes_check CHECK (shift2_break_minutes BETWEEN 0 AND 120),
  DROP CONSTRAINT IF EXISTS timetable_settings_shift2_first_period_start_check,
  ADD CONSTRAINT timetable_settings_shift2_first_period_start_check CHECK (shift2_first_period_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE public.teacher_unavailability
  ADD COLUMN IF NOT EXISTS shift SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public.teacher_unavailability
  DROP CONSTRAINT IF EXISTS teacher_unavailability_school_id_teacher_id_day_of_week_per_key;
ALTER TABLE public.teacher_unavailability
  ADD CONSTRAINT teacher_unavailability_school_teacher_day_period_shift_key
  UNIQUE (school_id, teacher_id, day_of_week, period_number, shift);
ALTER TABLE public.teacher_unavailability
  DROP CONSTRAINT IF EXISTS teacher_unavailability_shift_check;
ALTER TABLE public.teacher_unavailability
  ADD CONSTRAINT teacher_unavailability_shift_check CHECK (shift IN (1, 2));

CREATE INDEX IF NOT EXISTS idx_timetable_class_shift
  ON public.classes (school_id, shift, is_archived);
CREATE INDEX IF NOT EXISTS idx_teacher_unavailability_shift_scope
  ON public.teacher_unavailability (school_id, teacher_id, shift, day_of_week);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_unavailability ENABLE ROW LEVEL SECURITY;

-- Teacher clashes are warnings, not write blockers. API code computes actual
-- clock-time overlaps; period numbers alone are not comparable across shifts.
CREATE OR REPLACE FUNCTION public.schoolos_replace_class_timetable(
  p_school_id VARCHAR, p_class_id VARCHAR, p_slots JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = p_class_id AND c.school_id = p_school_id AND c.is_archived = FALSE
  ) THEN
    RAISE EXCEPTION 'Class does not belong to this school.';
  END IF;

  UPDATE public.timetable_slots
  SET is_active = FALSE
  WHERE school_id = p_school_id AND class_id = p_class_id AND is_active = TRUE;

  INSERT INTO public.timetable_slots (
    id, school_id, class_id, day_of_week, period_number, start_time, end_time,
    subject_id, teacher_id, room_number, is_active
  )
  SELECT
    n.id, p_school_id, p_class_id, n.day_of_week, n.period_number, n.start_time, n.end_time,
    n.subject_id, n.teacher_id, n.room_number, TRUE
  FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS n(
    id VARCHAR, day_of_week VARCHAR, period_number INTEGER, start_time VARCHAR, end_time VARCHAR,
    subject_id VARCHAR, teacher_id VARCHAR, room_number VARCHAR
  )
  ON CONFLICT (id) DO UPDATE SET
    day_of_week = EXCLUDED.day_of_week,
    period_number = EXCLUDED.period_number,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    subject_id = EXCLUDED.subject_id,
    teacher_id = EXCLUDED.teacher_id,
    room_number = EXCLUDED.room_number,
    is_active = TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) TO service_role;

-- Swapping keeps each class in its own shift and recomputes the moved periods'
-- clock times using that class's shift configuration. Teacher overlap remains
-- visible as a warning in the API/UI, never as a database exception.
CREATE OR REPLACE FUNCTION public.schoolos_swap_timetable_slots(
  p_school_id VARCHAR, p_first_id VARCHAR, p_second_id VARCHAR
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  first_slot public.timetable_slots%ROWTYPE;
  second_slot public.timetable_slots%ROWTYPE;
  first_shift INTEGER;
  second_shift INTEGER;
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
BEGIN
  SELECT * INTO first_slot FROM public.timetable_slots
  WHERE id = p_first_id AND school_id = p_school_id AND is_active = TRUE FOR UPDATE;
  SELECT * INTO second_slot FROM public.timetable_slots
  WHERE id = p_second_id AND school_id = p_school_id AND is_active = TRUE FOR UPDATE;
  IF first_slot.id IS NULL OR second_slot.id IS NULL OR first_slot.id = second_slot.id THEN
    RAISE EXCEPTION 'Choose two different active timetable slots in this school.';
  END IF;

  SELECT COALESCE(c.shift, 1),
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_first_period_start, '13:00') ELSE COALESCE(s.first_period_start, '08:00') END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_period_minutes, 40) ELSE COALESCE(s.period_minutes, 40) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_after_period, 3) ELSE COALESCE(s.break_after_period, 3) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_minutes, 20) ELSE COALESCE(s.break_minutes, 20) END
  INTO first_shift, first_start, first_minutes, first_break_after, first_break_minutes
  FROM public.classes c
  LEFT JOIN public.timetable_settings s ON s.school_id = c.school_id
  WHERE c.id = first_slot.class_id AND c.school_id = p_school_id;

  SELECT COALESCE(c.shift, 1),
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_first_period_start, '13:00') ELSE COALESCE(s.first_period_start, '08:00') END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_period_minutes, 40) ELSE COALESCE(s.period_minutes, 40) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_after_period, 3) ELSE COALESCE(s.break_after_period, 3) END,
    CASE WHEN COALESCE(c.shift, 1) = 2 THEN COALESCE(s.shift2_break_minutes, 20) ELSE COALESCE(s.break_minutes, 20) END
  INTO second_shift, second_start, second_minutes, second_break_after, second_break_minutes
  FROM public.classes c
  LEFT JOIN public.timetable_settings s ON s.school_id = c.school_id
  WHERE c.id = second_slot.class_id AND c.school_id = p_school_id;

  first_target_start := split_part(first_start, ':', 1)::INTEGER * 60
    + split_part(first_start, ':', 2)::INTEGER
    + (second_slot.period_number - 1) * first_minutes
    + CASE WHEN second_slot.period_number > first_break_after THEN first_break_minutes ELSE 0 END;
  second_target_start := split_part(second_start, ':', 1)::INTEGER * 60
    + split_part(second_start, ':', 2)::INTEGER
    + (first_slot.period_number - 1) * second_minutes
    + CASE WHEN first_slot.period_number > second_break_after THEN second_break_minutes ELSE 0 END;
  first_target_end := first_target_start + first_minutes;
  second_target_end := second_target_start + second_minutes;

  UPDATE public.timetable_slots SET
    day_of_week = second_slot.day_of_week,
    period_number = second_slot.period_number,
    start_time = lpad((first_target_start / 60)::TEXT, 2, '0') || ':' || lpad((first_target_start % 60)::TEXT, 2, '0'),
    end_time = lpad((first_target_end / 60)::TEXT, 2, '0') || ':' || lpad((first_target_end % 60)::TEXT, 2, '0')
  WHERE id = p_first_id AND school_id = p_school_id;

  UPDATE public.timetable_slots SET
    day_of_week = first_slot.day_of_week,
    period_number = first_slot.period_number,
    start_time = lpad((second_target_start / 60)::TEXT, 2, '0') || ':' || lpad((second_target_start % 60)::TEXT, 2, '0'),
    end_time = lpad((second_target_end / 60)::TEXT, 2, '0') || ':' || lpad((second_target_end % 60)::TEXT, 2, '0')
  WHERE id = p_second_id AND school_id = p_school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
