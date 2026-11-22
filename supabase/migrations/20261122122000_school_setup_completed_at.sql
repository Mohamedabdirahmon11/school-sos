-- Dedicated setup completion timestamp, kept in sync with legacy setup_progress JSON.
-- RLS remains enforced by the existing schools table policies; this adds no new access path.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- Backfill only valid ISO timestamps. Existing incomplete schools remain NULL.
UPDATE public.schools
SET setup_completed_at = (setup_progress ->> 'completedAt')::timestamptz
WHERE setup_completed_at IS NULL
  AND jsonb_typeof(setup_progress -> 'completedAt') = 'string'
  AND (setup_progress ->> 'completedAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})
;
