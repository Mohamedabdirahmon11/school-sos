-- Add distinct KG1/KG2/KG3 identities without changing existing class rows.
-- Legacy KG records keep kindergarten_level NULL and remain readable as generic KG.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS kindergarten_level smallint;

ALTER TABLE public.classes
  DROP CONSTRAINT IF EXISTS classes_kindergarten_level_check;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_kindergarten_level_check
  CHECK (kindergarten_level IS NULL OR (grade_level = 0 AND kindergarten_level BETWEEN 1 AND 3));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.classes
    WHERE kindergarten_level IS NOT NULL
      AND (grade_level <> 0 OR kindergarten_level NOT BETWEEN 1 AND 3)
  ) THEN
    RAISE EXCEPTION 'Invalid kindergarten_level data: only KG grade_level=0 and stages 1–3 are allowed.';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.classes_school_year_grade_section_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS classes_school_year_grade_section_uidx
  ON public.classes (
    school_id,
    academic_year,
    grade_level,
    COALESCE(kindergarten_level, 0),
    lower(btrim(COALESCE(section, '')))
  )
  WHERE COALESCE(is_archived, false) = false
    AND academic_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS classes_school_year_grade_kindergarten_idx
  ON public.classes (school_id, academic_year, grade_level, kindergarten_level)
  WHERE COALESCE(is_archived, false) = false;
