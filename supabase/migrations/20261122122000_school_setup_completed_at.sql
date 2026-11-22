-- Dedicated setup completion timestamp, kept in sync with legacy setup_progress JSON.
-- RLS remains enforced by the existing schools table policies; this adds no new access path.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz;

-- Backfill only valid ISO timestamps. Existing incomplete schools remain NULL.
UPDATE public.schools
SET setup_completed_at = (setup_progress ->> 'completedAt')::timestamptz
WHERE setup_completed_at IS NULL
  AND jsonb_typeof(setup_progress -> 'completedAt') = 'string'
  AND (setup_progress ->> 'completedAt') ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$';
