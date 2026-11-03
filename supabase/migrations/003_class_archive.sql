-- Add class archival without deleting existing school records.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_classes_active
  ON public.classes(school_id, is_archived);

NOTIFY pgrst, 'reload schema';
