-- Allow Kindergarten (grade_level = 0) in every school database.
-- Safe to rerun and matches the already-applied production constraint.
BEGIN;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_grade_level_check;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_grade_level_check
  CHECK (grade_level >= 0 AND grade_level <= 12);

COMMIT;
