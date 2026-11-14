-- Add the teacher address field used by the School Admin teacher profile.
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
COMMENT ON COLUMN public.teachers.address IS 'Optional contact/home address supplied by the school administrator.';
