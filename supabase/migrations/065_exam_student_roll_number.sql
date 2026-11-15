-- Optional school-managed roll number for exam room rosters.
-- Nullable and deliberately has no generated default: existing student IDs and history stay untouched.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS roll_number VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_students_school_class_roll_number
  ON public.students (school_id, class_id, roll_number)
  WHERE roll_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
