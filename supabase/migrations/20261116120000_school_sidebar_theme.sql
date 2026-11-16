-- Store validated, school-scoped navigation appearance preferences.
-- The existing schools RLS policies continue to control tenant reads and writes.
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS sidebar_theme jsonb NOT NULL DEFAULT '{
    "preset": "brand",
    "backgroundColor": "#102c2a",
    "textColor": "#ffffff",
    "accentColor": "#0f766e",
    "activeStyle": "pill",
    "radius": "rounded",
    "density": "comfortable",
    "iconStyle": "outline",
    "showGroupLabels": true,
    "width": 276,
    "defaultCollapsed": false,
    "fontSize": "normal",
    "showLogo": true,
    "showSchoolName": true,
    "showUserCard": true
  }'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'schools_sidebar_theme_object_check'
      AND conrelid = 'public.schools'::regclass
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_sidebar_theme_object_check
      CHECK (jsonb_typeof(sidebar_theme) = 'object');
  END IF;
END
$$;

COMMENT ON COLUMN public.schools.sidebar_theme IS
  'Validated school-scoped sidebar appearance settings; values are mapped to allowlisted CSS variables by the application.';
