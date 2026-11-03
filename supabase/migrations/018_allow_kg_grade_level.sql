-- Keep KG (grade level 0) supported in every fresh and upgraded database.
-- Idempotently replace the original 1..12 constraint with the application range.
BEGIN;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_grade_level_check;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_grade_level_check
  CHECK (grade_level BETWEEN 0 AND 12);

COMMIT;

NOTIFY pgrst, 'reload schema';
