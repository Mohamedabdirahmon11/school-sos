-- School registration profile fields and public school-logo storage.
-- Timestamped migration follows the repository's deployed migration ordering.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS school_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schools_school_type_check'
      AND conrelid = 'public.schools'::regclass
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_school_type_check
      CHECK (school_type IS NULL OR school_type IN ('primary', 'secondary', 'combined')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.schools VALIDATE CONSTRAINT schools_school_type_check;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('school-logos', 'school-logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
