-- Persist first-login School Admin setup progress without changing existing school data.
-- Existing schools are treated as already onboarded; schools created after this migration
-- start at step 1 and must finish the wizard before their normal dashboard is available.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schools'
      AND column_name = 'setup_progress'
  ) THEN
    ALTER TABLE public.schools
      ADD COLUMN setup_progress JSONB NOT NULL
      DEFAULT '{"currentStep": 1, "completedSteps": [], "skippedSteps": [], "completedAt": null}'::JSONB;

    UPDATE public.schools
    SET setup_progress = '{"currentStep": 10, "completedSteps": [1,2,3,4,5,6,7,8,9,10], "skippedSteps": [], "completedAt": "legacy"}'::JSONB;
  END IF;
END $$;

COMMENT ON COLUMN public.schools.setup_progress IS
  'School Admin first-login setup wizard progress. Existing schools are backfilled as legacy-complete; new schools start at step 1.';
