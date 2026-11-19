-- Per-school date display preference. Existing dates and records are unchanged.
BEGIN;

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS date_format varchar(20) NOT NULL DEFAULT 'dd/MM/yyyy';
ALTER TABLE public.schools
  DROP CONSTRAINT IF EXISTS schools_date_format_check;
ALTER TABLE public.schools
  ADD CONSTRAINT schools_date_format_check
  CHECK (date_format IN ('dd/MM/yyyy','MM/dd/yyyy','yyyy-MM-dd')) NOT VALID;
ALTER TABLE public.schools
  VALIDATE CONSTRAINT schools_date_format_check;

NOTIFY pgrst, 'reload schema';
COMMIT;
