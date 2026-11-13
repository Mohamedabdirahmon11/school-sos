-- Five-step School Admin setup configuration.
-- Additive JSONB column: no existing school rows or business records are rewritten.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS setup_data JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.schools.setup_data IS
  'School-scoped five-step setup wizard: profile, academic year, terms, calendar/holidays, and working hours.';
