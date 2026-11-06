-- Per-school calendar preference. Dates already stored as Gregorian SQL dates are
-- intentionally left unchanged; conversion belongs at the application boundary.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS calendar_type VARCHAR(20);

UPDATE public.schools
   SET calendar_type = CASE
     WHEN timezone = 'Africa/Addis_Ababa' THEN 'ethiopian'
     ELSE 'gregorian'
   END
 WHERE calendar_type IS NULL;

ALTER TABLE public.schools
  ALTER COLUMN calendar_type SET DEFAULT 'ethiopian',
  ALTER COLUMN calendar_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'schools_calendar_type_check'
       AND conrelid = 'public.schools'::regclass
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_calendar_type_check
      CHECK (calendar_type IN ('ethiopian', 'gregorian'));
  END IF;
END $$;

COMMENT ON COLUMN public.schools.calendar_type IS
  'Preferred school-facing calendar. Persisted date columns remain Gregorian ISO dates.';
