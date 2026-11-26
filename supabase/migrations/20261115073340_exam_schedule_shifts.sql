-- Per-school exam shifts. Existing schedules remain in the General shift.
BEGIN;
ALTER TABLE public.exam_schedules
  ADD COLUMN IF NOT EXISTS shift_name VARCHAR(80) NOT NULL DEFAULT 'General';
CREATE INDEX IF NOT EXISTS idx_exam_schedules_school_shift_date
  ON public.exam_schedules (school_id, shift_name, exam_date, start_time);
NOTIFY pgrst, 'reload schema';
COMMIT;
