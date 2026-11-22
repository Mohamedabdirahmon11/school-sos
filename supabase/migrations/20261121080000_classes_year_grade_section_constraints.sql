-- Classes & Sections foundation: enforce one active section per school/year/grade
-- and one active Form Teacher class per school. Existing class IDs and all
-- dependent records remain unchanged; archived rows are intentionally excluded.

DO $classes$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.classes
    WHERE COALESCE(is_archived, false) = false
      AND academic_year IS NOT NULL
    GROUP BY school_id, academic_year, grade_level, lower(btrim(COALESCE(section, '')))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add class identity constraint: duplicate active school/year/grade/section rows exist. Resolve duplicates without deleting dependent records.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.classes
    WHERE COALESCE(is_archived, false) = false
      AND class_teacher_id IS NOT NULL
    GROUP BY school_id, class_teacher_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add Form Teacher constraint: a teacher is assigned to multiple active classes in the same school. Resolve assignments first.';
  END IF;
END
$classes$;

CREATE UNIQUE INDEX IF NOT EXISTS classes_school_year_grade_section_uidx
  ON public.classes (
    school_id,
    academic_year,
    grade_level,
    lower(btrim(COALESCE(section, '')))
  )
  WHERE COALESCE(is_archived, false) = false
    AND academic_year IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS classes_school_form_teacher_uidx
  ON public.classes (school_id, class_teacher_id)
  WHERE COALESCE(is_archived, false) = false
    AND class_teacher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS classes_school_year_grade_idx
  ON public.classes (school_id, academic_year, grade_level)
  WHERE COALESCE(is_archived, false) = false;
