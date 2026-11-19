-- School Setup lifecycle: managed academic years, exactly two configured semesters,
-- exam windows and result publication dates. Existing history is retained.
BEGIN;

ALTER TABLE public.academic_years
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by varchar(64);

UPDATE public.academic_years
SET status = CASE WHEN is_current THEN 'active' ELSE 'closed' END
WHERE status = 'closed' OR status IS NULL;

ALTER TABLE public.academic_years
  DROP CONSTRAINT IF EXISTS academic_years_status_check;
ALTER TABLE public.academic_years
  ADD CONSTRAINT academic_years_status_check
  CHECK (status IN ('draft','active','closed')) NOT VALID;
ALTER TABLE public.academic_years
  VALIDATE CONSTRAINT academic_years_status_check;

ALTER TABLE public.academic_years
  DROP CONSTRAINT IF EXISTS academic_years_valid_dates_check;
ALTER TABLE public.academic_years
  ADD CONSTRAINT academic_years_valid_dates_check
  CHECK (start_date <= end_date) NOT VALID;
ALTER TABLE public.academic_years
  VALIDATE CONSTRAINT academic_years_valid_dates_check;

ALTER TABLE public.exam_periods
  ADD COLUMN IF NOT EXISTS results_publish_date date;

-- Serialize year changes per school and prevent overlapping academic-year ranges.
CREATE OR REPLACE FUNCTION public.schoolos_guard_academic_year_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.schools WHERE id = NEW.school_id FOR UPDATE;
  IF NEW.start_date > NEW.end_date THEN
    RAISE EXCEPTION 'Academic year start date must be on or before its end date.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.academic_years ay
    WHERE ay.school_id = NEW.school_id
      AND ay.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(ay.start_date, ay.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Academic year dates overlap another academic year for this school.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS academic_years_guard_dates ON public.academic_years;
CREATE TRIGGER academic_years_guard_dates
BEFORE INSERT OR UPDATE OF school_id, start_date, end_date
ON public.academic_years
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_academic_year_dates();

-- Semesters may not overlap within the same academic year. Existing terms are
-- not rewritten; the guard applies to future inserts and date changes.
CREATE OR REPLACE FUNCTION public.schoolos_guard_term_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_year public.academic_years%ROWTYPE;
BEGIN
  SELECT * INTO v_year
  FROM public.academic_years
  WHERE id = NEW.academic_year_id AND school_id = NEW.school_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Academic year does not belong to this school.';
  END IF;
  IF NEW.start_date > NEW.end_date
     OR NEW.start_date < v_year.start_date
     OR NEW.end_date > v_year.end_date THEN
    RAISE EXCEPTION 'Semester dates must be valid and fall within the academic year.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.terms t
    WHERE t.school_id = NEW.school_id
      AND t.academic_year_id = NEW.academic_year_id
      AND t.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND daterange(t.start_date, t.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Semester dates overlap another semester in this academic year.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS terms_guard_dates ON public.terms;
CREATE TRIGGER terms_guard_dates
BEFORE INSERT OR UPDATE OF school_id, academic_year_id, start_date, end_date
ON public.terms
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_term_dates();

-- Atomic year activation: one active year per school, with the previous year
-- closed rather than deleted.
CREATE OR REPLACE FUNCTION public.schoolos_activate_academic_year(
  p_school_id text, p_year_id uuid, p_actor_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found.'; END IF;
  PERFORM 1 FROM public.academic_years
   WHERE id = p_year_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic year not found in this school.'; END IF;

  UPDATE public.academic_years
     SET is_current = false,
         status = 'closed',
         closed_at = COALESCE(closed_at, now()),
         closed_by = COALESCE(closed_by, p_actor_id),
         updated_at = now()
   WHERE school_id = p_school_id AND is_current = true AND id <> p_year_id;

  UPDATE public.academic_years
     SET is_current = true, status = 'active',
         closed_at = NULL, closed_by = NULL, updated_at = now()
   WHERE id = p_year_id AND school_id = p_school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_activate_academic_year(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_activate_academic_year(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_close_academic_year(
  p_school_id text, p_year_id uuid, p_actor_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.schools WHERE id = p_school_id FOR UPDATE;
  UPDATE public.academic_years
     SET is_current = false, status = 'closed',
         closed_at = now(), closed_by = p_actor_id, updated_at = now()
   WHERE id = p_year_id AND school_id = p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Academic year not found in this school.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_close_academic_year(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_close_academic_year(text, uuid, text) TO service_role;

-- A semester's open/closed state remains in term_status, the existing source of
-- truth used by exam/result workflows. Activation also enforces one current
-- semester per school using the existing partial unique index.
CREATE OR REPLACE FUNCTION public.schoolos_set_semester_status(
  p_school_id text, p_term_id uuid, p_status text, p_actor_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_year_id uuid;
BEGIN
  IF p_status NOT IN ('open','closed') THEN RAISE EXCEPTION 'Invalid semester status.'; END IF;
  SELECT academic_year_id INTO v_year_id
    FROM public.terms
   WHERE id = p_term_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Semester not found in this school.'; END IF;

  IF p_status = 'open' THEN
    IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = v_year_id AND school_id = p_school_id AND status = 'active') THEN
      RAISE EXCEPTION 'Activate the academic year before opening a semester.';
    END IF;
    UPDATE public.terms SET is_current = false, updated_at = now()
     WHERE school_id = p_school_id AND id <> p_term_id AND is_current = true;
    UPDATE public.terms SET is_current = true, updated_at = now()
     WHERE id = p_term_id AND school_id = p_school_id;
    INSERT INTO public.term_status(school_id, term_id, status, closed_by, closed_at, updated_at)
    VALUES (p_school_id, p_term_id, 'open', NULL, NULL, now())
    ON CONFLICT (school_id, term_id) DO UPDATE
      SET status='open', closed_by=NULL, closed_at=NULL, updated_at=now();
  ELSE
    UPDATE public.terms SET is_current = false, updated_at = now()
     WHERE id = p_term_id AND school_id = p_school_id;
    INSERT INTO public.term_status(school_id, term_id, status, closed_by, closed_at, updated_at)
    VALUES (p_school_id, p_term_id, 'closed', p_actor_id, now(), now())
    ON CONFLICT (school_id, term_id) DO UPDATE
      SET status='closed', closed_by=p_actor_id, closed_at=now(), updated_at=now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_set_semester_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_set_semester_status(text, uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
