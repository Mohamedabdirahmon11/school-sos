-- Keep the fresh schema and upgraded databases consistent: KG uses grade level 0.
ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_grade_level_check;

ALTER TABLE public.classes
  ADD CONSTRAINT classes_grade_level_check
  CHECK (grade_level BETWEEN 0 AND 12);
