-- Step 3: make the existing subjects catalogue safe for school-scoped subject management.
-- Existing subject rows and names are intentionally preserved.
ALTER TABLE public.subjects
  ALTER COLUMN code SET DEFAULT '';

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_code_format_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_code_format_check
  CHECK (code IS NULL OR (code = upper(btrim(code)) AND char_length(code) <= 6));

ALTER TABLE public.subjects
  DROP CONSTRAINT IF EXISTS subjects_name_trimmed_nonempty_check;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_name_trimmed_nonempty_check
  CHECK (char_length(btrim(name)) > 0 AND name = btrim(name));

DROP INDEX IF EXISTS public.uq_subjects_school_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_school_code
  ON public.subjects (school_id, lower(btrim(code)))
  WHERE nullif(btrim(code), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_school_name_ci
  ON public.subjects (school_id, lower(btrim(name)));

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
