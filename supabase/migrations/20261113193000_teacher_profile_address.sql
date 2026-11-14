-- Add the teacher address field used by the School Admin teacher profile.
-- Additive only: safe to apply once through the normal migration pipeline.
BEGIN;
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
COMMENT ON COLUMN public.teachers.address IS 'Optional contact/home address supplied by the school administrator.';
COMMIT;
