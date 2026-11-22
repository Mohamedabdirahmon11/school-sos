-- School-wide Conduct weighting for the Ethiopian report-card workflow.
-- Additive and safe for existing schools: Conduct remains excluded by default.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS include_conduct_in_average boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.include_conduct_in_average IS
  'When true, the separate Conduct score participates in report-card totals and averages; false keeps it display-only.';
