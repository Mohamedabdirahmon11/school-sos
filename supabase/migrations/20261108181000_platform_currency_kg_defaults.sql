-- Align platform, school, invoice and fee-range currency defaults with the ETB configuration.
-- Include KG in the default school grade list without removing existing grades.
BEGIN;
ALTER TABLE public.super_admin_settings ALTER COLUMN platform_currency SET DEFAULT 'ETB';
ALTER TABLE public.schools ALTER COLUMN currency SET DEFAULT 'ETB';
ALTER TABLE public.subscription_invoices ALTER COLUMN currency SET DEFAULT 'ETB';
ALTER TABLE public.fee_ranges ALTER COLUMN currency SET DEFAULT 'ETB';
ALTER TABLE public.schools ALTER COLUMN class_levels
  SET DEFAULT '[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]'::jsonb;
UPDATE public.schools
SET class_levels = jsonb_build_array(0) || COALESCE(class_levels, '[]'::jsonb)
WHERE NOT COALESCE(class_levels, '[]'::jsonb) @> '[0]'::jsonb;
COMMIT;
