-- Persist the first-login School Admin setup wizard without changing school business data.
-- Existing schools created before this migration are treated as already onboarded.
-- Schools created from this migration onward start at step 1.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS setup_progress JSONB NOT NULL
  DEFAULT '{"currentStep": 1, "completedSteps": [], "skippedSteps": [], "completedAt": null}'::JSONB;

UPDATE public.schools
SET setup_progress = '{"currentStep": 10, "completedSteps": [1,2,3,4,5,6,7,8,9,10], "skippedSteps": [], "completedAt": "legacy"}'::JSONB
WHERE created_at < TIMESTAMPTZ '2026-11-09 13:00:00+00'
  AND setup_progress = '{"currentStep": 1, "completedSteps": [], "skippedSteps": [], "completedAt": null}'::JSONB;

COMMENT ON COLUMN public.schools.setup_progress IS
  'School Admin first-login setup wizard progress. Existing schools are backfilled as legacy-complete; new schools start at step 1.';
