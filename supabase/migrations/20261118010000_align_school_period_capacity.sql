-- Expand the existing timetable configuration from six to eight periods.
-- Existing school settings and timetable rows remain unchanged.
ALTER TABLE public.timetable_settings
  DROP CONSTRAINT IF EXISTS timetable_settings_break_after_period_check,
  DROP CONSTRAINT IF EXISTS timetable_settings_shift2_break_after_period_check;

ALTER TABLE public.timetable_settings
  ADD CONSTRAINT timetable_settings_break_after_period_check
    CHECK (break_after_period BETWEEN 1 AND 7) NOT VALID,
  ADD CONSTRAINT timetable_settings_shift2_break_after_period_check
    CHECK (shift2_break_after_period BETWEEN 1 AND 7) NOT VALID;

ALTER TABLE public.timetable_settings
  VALIDATE CONSTRAINT timetable_settings_break_after_period_check;
ALTER TABLE public.timetable_settings
  VALIDATE CONSTRAINT timetable_settings_shift2_break_after_period_check;

NOTIFY pgrst, 'reload schema';
