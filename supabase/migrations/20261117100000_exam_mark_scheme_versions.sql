-- Version school exam mark schemes and preserve the exact scheme used for each saved mark.
-- Additive only: existing configurations and mark values are retained.
ALTER TABLE public.exam_configs
  ADD COLUMN IF NOT EXISTS scheme_version integer NOT NULL DEFAULT 1
    CHECK (scheme_version > 0);

ALTER TABLE public.student_marks
  ADD COLUMN IF NOT EXISTS scheme_version integer NOT NULL DEFAULT 1
    CHECK (scheme_version > 0),
  ADD COLUMN IF NOT EXISTS scheme_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill existing marks with the scheme that was configured for their school/year.
-- This does not change scores, percentages, approval state, or publication state.
UPDATE public.student_marks AS marks
SET scheme_version = COALESCE(config.scheme_version, 1),
    scheme_snapshot = COALESCE(config.assessment_components, '[]'::jsonb)
FROM public.exam_configs AS config
WHERE config.school_id = marks.school_id
  AND config.academic_year = marks.academic_year
  AND marks.scheme_snapshot = '[]'::jsonb;

COMMENT ON COLUMN public.exam_configs.scheme_version IS
  'Monotonically increasing mark-scheme version for this school and academic year.';
COMMENT ON COLUMN public.student_marks.scheme_version IS
  'Mark-scheme version used when this student mark was first saved.';
COMMENT ON COLUMN public.student_marks.scheme_snapshot IS
  'Immutable assessment component snapshot used to calculate this mark.';
