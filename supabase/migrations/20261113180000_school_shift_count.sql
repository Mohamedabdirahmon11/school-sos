-- Configure whether each school runs one or two daily shifts.
-- Existing classes already assigned to Shift 2 automatically enable two shifts.
ALTER TABLE public.timetable_settings
  ADD COLUMN IF NOT EXISTS shift_count SMALLINT NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.timetable_settings'::regclass
      AND conname = 'timetable_settings_shift_count_check'
  ) THEN
    ALTER TABLE public.timetable_settings
      ADD CONSTRAINT timetable_settings_shift_count_check CHECK (shift_count IN (1, 2));
  END IF;
END $$;

UPDATE public.timetable_settings settings
SET shift_count = 2
WHERE EXISTS (
  SELECT 1 FROM public.classes classes
  WHERE classes.school_id = settings.school_id AND classes.shift = 2
);

INSERT INTO public.timetable_settings (school_id, shift_count)
SELECT DISTINCT school_id, 2
FROM public.classes
WHERE shift = 2
ON CONFLICT (school_id) DO UPDATE SET shift_count = 2;
