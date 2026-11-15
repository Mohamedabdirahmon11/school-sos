-- Additive school-specific printable exam timetable settings.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS name_arabic TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exam_timetable_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exam_timetable_academic_year_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exam_timetable_class_group TEXT NOT NULL DEFAULT 'DHAMMAAN FASALLADA',
  ADD COLUMN IF NOT EXISTS exam_timetable_include_friday BOOLEAN NOT NULL DEFAULT FALSE;
