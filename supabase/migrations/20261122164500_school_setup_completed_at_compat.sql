-- Backward-compatible setup completion timestamp for older deployed API instances.
-- The current API no longer selects this field, but older instances still request it
-- through the nested schools relation during session hydration.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;
