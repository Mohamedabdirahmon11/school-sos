-- Keep the checked-in schema aligned with the already deployed shift-aware
-- timetable settings. Existing morning values are preserved; afternoon values
-- receive safe defaults for schools that have not configured shift 2 yet.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS shift SMALLINT NOT NULL DEFAULT 1;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.classes'::regclass
      AND conname = 'classes_shift_valid'
  ) THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_shift_valid CHECK (shift IN (1, 2)) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE public.classes VALIDATE CONSTRAINT classes_shift_valid;

ALTER TABLE public.timetable_settings
  ADD COLUMN IF NOT EXISTS shift2_first_period_start VARCHAR(5) NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS shift2_period_minutes INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS shift2_break_after_period INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS shift2_break_minutes INTEGER NOT NULL DEFAULT 20;

