-- Academic Management: class codes, year-scoped classes, and subject descriptions.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS class_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(9);

ALTER TABLE public.classes ALTER COLUMN section SET DEFAULT '';

UPDATE public.classes c
SET academic_year = s.academic_year
FROM public.schools s
WHERE c.school_id = s.id AND c.academic_year IS NULL;

UPDATE public.classes
SET academic_year = '2026-2027'
WHERE academic_year IS NULL;

UPDATE public.classes
SET class_code = 'CLS-' || upper(regexp_replace(coalesce(name, 'CLASS'), '[^A-Za-z0-9]+', '-', 'g')) || '-' ||
  upper(right(regexp_replace(id, '[^A-Za-z0-9]', '', 'g'), 6))
WHERE class_code IS NULL OR btrim(class_code) = '';

ALTER TABLE public.classes
  ALTER COLUMN class_code SET NOT NULL,
  ALTER COLUMN academic_year SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_school_year_code
  ON public.classes (school_id, academic_year, lower(class_code));

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.subjects
  ALTER COLUMN credit_units SET DEFAULT 0;
