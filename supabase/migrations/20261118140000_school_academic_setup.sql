-- Step 1: school-scoped academic year, term, working-day and daily-period setup.
-- Existing schools.setup_data and timetable_settings remain intact for compatibility.
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT academic_years_dates_check CHECK (end_date > start_date),
  CONSTRAINT academic_years_id_school_key UNIQUE (id, school_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_years_school_name
  ON public.academic_years (school_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_years_one_current
  ON public.academic_years (school_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_academic_years_school_dates
  ON public.academic_years (school_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL,
  name VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT terms_dates_check CHECK (end_date > start_date),
  CONSTRAINT terms_year_school_fkey FOREIGN KEY (academic_year_id, school_id)
    REFERENCES public.academic_years(id, school_id) ON DELETE CASCADE,
  CONSTRAINT terms_id_school_key UNIQUE (id, school_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_terms_school_year_name
  ON public.terms (school_id, academic_year_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_terms_one_current_per_school
  ON public.terms (school_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_terms_school_year_dates
  ON public.terms (school_id, academic_year_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.school_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_of_week VARCHAR(12) NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  is_working BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_school_days_school ON public.school_days (school_id);

CREATE TABLE IF NOT EXISTS public.periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 20),
  type VARCHAR(10) NOT NULL CHECK (type IN ('lesson','break')),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT periods_time_check CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_periods_school_order ON public.periods (school_id, number, start_time);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years','terms','school_days','periods'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_scope', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.auth_user_role() = ''super_admin'' OR school_id = private.auth_school_id()) WITH CHECK (private.auth_user_role() = ''super_admin'' OR school_id = private.auth_school_id())', t || '_tenant_scope', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() IN (''school_admin'',''super_admin''))', t || '_admin_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() IN (''school_admin'',''super_admin'')) WITH CHECK (private.auth_user_role() IN (''school_admin'',''super_admin''))', t || '_admin_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() IN (''school_admin'',''super_admin''))', t || '_admin_delete', t);
  END LOOP;
END $$;

-- Backfill existing academic years and terms from the established school settings.
INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
SELECT s.id,
       COALESCE(NULLIF(btrim(s.setup_data->'academicYear'->>'name'), ''), s.academic_year),
       COALESCE(NULLIF(s.setup_data->'academicYear'->>'startDate','')::date, NULLIF(s.terms->>'semester1Start','')::date),
       COALESCE(NULLIF(s.setup_data->'academicYear'->>'endDate','')::date, NULLIF(s.terms->>'semester2End','')::date),
       TRUE
FROM public.schools s
WHERE COALESCE(NULLIF(s.setup_data->'academicYear'->>'startDate','')::date, NULLIF(s.terms->>'semester1Start','')::date) IS NOT NULL
  AND COALESCE(NULLIF(s.setup_data->'academicYear'->>'endDate','')::date, NULLIF(s.terms->>'semester2End','')::date)
      > COALESCE(NULLIF(s.setup_data->'academicYear'->>'startDate','')::date, NULLIF(s.terms->>'semester1Start','')::date)
ON CONFLICT DO NOTHING;

INSERT INTO public.terms (school_id, academic_year_id, name, start_date, end_date, is_current)
SELECT s.id, ay.id, trim(t->>'name'), (t->>'startDate')::date, (t->>'endDate')::date,
       CURRENT_DATE BETWEEN (t->>'startDate')::date AND (t->>'endDate')::date
FROM public.schools s
JOIN public.academic_years ay ON ay.school_id = s.id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.setup_data->'terms') = 'array' THEN s.setup_data->'terms' ELSE '[]'::jsonb END
) t
WHERE NULLIF(t->>'name','') IS NOT NULL
  AND NULLIF(t->>'startDate','') IS NOT NULL
  AND NULLIF(t->>'endDate','') IS NOT NULL
  AND (t->>'endDate')::date > (t->>'startDate')::date
  AND (t->>'startDate')::date >= ay.start_date
  AND (t->>'endDate')::date <= ay.end_date
ON CONFLICT DO NOTHING;

INSERT INTO public.terms (school_id, academic_year_id, name, start_date, end_date, is_current)
SELECT s.id, ay.id, v.name, v.start_date, v.end_date,
       CURRENT_DATE BETWEEN v.start_date AND v.end_date
FROM public.schools s
JOIN public.academic_years ay ON ay.school_id = s.id
CROSS JOIN LATERAL (VALUES
  ('Term 1', NULLIF(s.terms->>'semester1Start','')::date, NULLIF(s.terms->>'semester1End','')::date),
  ('Term 2', NULLIF(s.terms->>'semester2Start','')::date, NULLIF(s.terms->>'semester2End','')::date)
) v(name,start_date,end_date)
WHERE v.start_date IS NOT NULL AND v.end_date IS NOT NULL AND v.end_date > v.start_date
  AND v.start_date >= ay.start_date AND v.end_date <= ay.end_date
  AND NOT EXISTS (SELECT 1 FROM public.terms x WHERE x.school_id=s.id AND x.academic_year_id=ay.id)
ON CONFLICT DO NOTHING;

-- Preserve configured working days; new/unconfigured schools use Sabti–Khamiis (Friday off).
INSERT INTO public.school_days (school_id, day_of_week, is_working)
SELECT s.id, d.day_name,
       CASE WHEN jsonb_typeof(s.setup_data->'calendar'->'workingDays') = 'array'
            THEN (s.setup_data->'calendar'->'workingDays') ? d.day_name
            ELSE d.day_name <> 'Friday' END
FROM public.schools s
CROSS JOIN (VALUES ('Monday'),('Tuesday'),('Wednesday'),('Thursday'),('Friday'),('Saturday'),('Sunday')) d(day_name)
ON CONFLICT (school_id, day_of_week) DO NOTHING;

-- Preserve the existing daily lesson count, start time, duration and configured break.
WITH settings AS (
  SELECT s.id AS school_id,
         GREATEST(2, LEAST(8, COALESCE(NULLIF(s.setup_data->'workingHours'->>'periodsPerDay','')::int, 6))) AS lesson_count,
         COALESCE(NULLIF(s.setup_data->'workingHours'->>'classStartTime','')::time, ts.first_period_start::time, TIME '08:00') AS first_start,
         COALESCE(ts.period_minutes, 40) AS lesson_minutes,
         GREATEST(1, LEAST(GREATEST(1, COALESCE(NULLIF(s.setup_data->'workingHours'->>'periodsPerDay','')::int, 6))-1, COALESCE(ts.break_after_period,3))) AS break_after,
         COALESCE(ts.break_minutes,20) AS break_minutes,
         NULLIF(s.setup_data->'workingHours'->>'breakStartTime','')::time AS configured_break_start,
         NULLIF(s.setup_data->'workingHours'->>'breakEndTime','')::time AS configured_break_end
  FROM public.schools s
  LEFT JOIN public.timetable_settings ts ON ts.school_id=s.id
), expanded AS (
  SELECT x.*,
         g.n AS display_number,
         CASE WHEN g.n = x.break_after + 1 THEN 'break' ELSE 'lesson' END AS period_type,
         CASE WHEN g.n = x.break_after + 1
              THEN COALESCE(x.configured_break_start, x.first_start + (x.break_after * x.lesson_minutes) * INTERVAL '1 minute')
              WHEN g.n <= x.break_after
              THEN x.first_start + ((g.n - 1) * x.lesson_minutes) * INTERVAL '1 minute'
              ELSE COALESCE(x.configured_break_end,
                    COALESCE(x.configured_break_start, x.first_start + (x.break_after * x.lesson_minutes) * INTERVAL '1 minute')
                    + x.break_minutes * INTERVAL '1 minute')
                   + (g.n - x.break_after - 2) * x.lesson_minutes * INTERVAL '1 minute'
         END AS period_start,
         CASE WHEN g.n = x.break_after + 1
              THEN COALESCE(x.configured_break_end,
                    COALESCE(x.configured_break_start, x.first_start + (x.break_after * x.lesson_minutes) * INTERVAL '1 minute')
                    + x.break_minutes * INTERVAL '1 minute')
              ELSE (CASE WHEN g.n <= x.break_after
                         THEN x.first_start + ((g.n - 1) * x.lesson_minutes) * INTERVAL '1 minute'
                         ELSE COALESCE(x.configured_break_end,
                               COALESCE(x.configured_break_start, x.first_start + (x.break_after * x.lesson_minutes) * INTERVAL '1 minute')
                               + x.break_minutes * INTERVAL '1 minute')
                              + (g.n - x.break_after - 2) * x.lesson_minutes * INTERVAL '1 minute'
                    END) + x.lesson_minutes * INTERVAL '1 minute'
         END AS period_end
  FROM settings x
  CROSS JOIN LATERAL generate_series(1, x.lesson_count + 1) g(n)
)
INSERT INTO public.periods (school_id, number, type, start_time, end_time)
SELECT school_id, display_number, period_type, period_start::time, period_end::time
FROM expanded
WHERE period_end::time > period_start::time
  AND NOT EXISTS (SELECT 1 FROM public.periods p WHERE p.school_id=expanded.school_id);

-- Seed sensible defaults for schools created after this migration.
CREATE OR REPLACE FUNCTION private.seed_school_academic_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.school_days (school_id, day_of_week, is_working)
  VALUES
    (NEW.id,'Monday',TRUE),(NEW.id,'Tuesday',TRUE),(NEW.id,'Wednesday',TRUE),
    (NEW.id,'Thursday',TRUE),(NEW.id,'Friday',FALSE),(NEW.id,'Saturday',TRUE),(NEW.id,'Sunday',TRUE)
  ON CONFLICT (school_id,day_of_week) DO NOTHING;
  INSERT INTO public.periods (school_id,number,type,start_time,end_time)
  VALUES
    (NEW.id,1,'lesson','08:00','08:40'),
    (NEW.id,2,'lesson','08:40','09:20'),
    (NEW.id,3,'lesson','09:20','10:00'),
    (NEW.id,4,'break','10:00','10:30'),
    (NEW.id,5,'lesson','10:30','11:10'),
    (NEW.id,6,'lesson','11:10','11:50'),
    (NEW.id,7,'lesson','11:50','12:30')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.seed_school_academic_defaults() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS schools_seed_academic_defaults ON public.schools;
CREATE TRIGGER schools_seed_academic_defaults
AFTER INSERT ON public.schools
FOR EACH ROW EXECUTE FUNCTION private.seed_school_academic_defaults();

NOTIFY pgrst, 'reload schema';
