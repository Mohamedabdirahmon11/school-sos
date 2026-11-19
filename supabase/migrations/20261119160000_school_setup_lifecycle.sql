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
ALTER TABLE public.exam_periods
  DROP CONSTRAINT IF EXISTS exam_periods_results_publish_after_exam_check;
ALTER TABLE public.exam_periods
  ADD CONSTRAINT exam_periods_results_publish_after_exam_check
  CHECK (results_publish_date IS NULL OR results_publish_date >= end_date) NOT VALID;
ALTER TABLE public.exam_periods
  VALIDATE CONSTRAINT exam_periods_results_publish_after_exam_check;

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
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.term_status ts
     WHERE ts.school_id=NEW.school_id AND ts.term_id=NEW.id AND ts.status='closed'
  ) THEN
    RAISE EXCEPTION 'Closed semesters are read-only. Reopen the semester before changing its dates.';
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
  IF NEW.name = 'Semester 1' AND EXISTS (
    SELECT 1 FROM public.terms t
     WHERE t.school_id=NEW.school_id AND t.academic_year_id=NEW.academic_year_id
       AND t.name='Semester 2' AND t.id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
       AND NEW.end_date >= t.start_date
  ) THEN
    RAISE EXCEPTION 'Semester 1 must end before Semester 2 begins.';
  END IF;
  IF NEW.name = 'Semester 2' AND EXISTS (
    SELECT 1 FROM public.terms t
     WHERE t.school_id=NEW.school_id AND t.academic_year_id=NEW.academic_year_id
       AND t.name='Semester 1' AND t.id<>COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000'::uuid)
       AND NEW.start_date <= t.end_date
  ) THEN
    RAISE EXCEPTION 'Semester 2 must begin after Semester 1 ends.';
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

  UPDATE public.terms t
     SET is_current = false, updated_at = now()
   WHERE t.school_id = p_school_id
     AND t.is_current = true
     AND EXISTS (SELECT 1 FROM public.academic_years ay WHERE ay.id=t.academic_year_id AND ay.school_id=p_school_id AND ay.status='closed');

  INSERT INTO public.term_status(school_id, term_id, status, closed_by, closed_at, updated_at)
  SELECT t.school_id, t.id, 'closed', p_actor_id, now(), now()
    FROM public.terms t
    JOIN public.academic_years ay ON ay.id=t.academic_year_id AND ay.school_id=t.school_id
    LEFT JOIN public.term_status ts ON ts.school_id=t.school_id AND ts.term_id=t.id
   WHERE t.school_id=p_school_id AND ay.status='closed'
     AND COALESCE(ts.status,'open') <> 'closed'
  ON CONFLICT (school_id, term_id) DO UPDATE
    SET status='closed', closed_by=p_actor_id, closed_at=now(), updated_at=now();

  UPDATE public.schools
     SET academic_year = (SELECT name FROM public.academic_years WHERE id = p_year_id AND school_id = p_school_id),
         updated_at = now()
   WHERE id = p_school_id;
  PERFORM public.schoolos_sync_school_semester_dates(p_school_id, p_year_id);
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

  UPDATE public.terms SET is_current=false, updated_at=now()
   WHERE school_id=p_school_id AND academic_year_id=p_year_id AND is_current=true;
  INSERT INTO public.term_status(school_id, term_id, status, closed_by, closed_at, updated_at)
  SELECT t.school_id, t.id, 'closed', p_actor_id, now(), now()
    FROM public.terms t
    LEFT JOIN public.term_status ts ON ts.school_id=t.school_id AND ts.term_id=t.id
   WHERE t.school_id=p_school_id AND t.academic_year_id=p_year_id
     AND COALESCE(ts.status,'open') <> 'closed'
  ON CONFLICT (school_id, term_id) DO UPDATE
    SET status='closed', closed_by=p_actor_id, closed_at=now(), updated_at=now();
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_close_academic_year(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_close_academic_year(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_sync_school_semester_dates(
  p_school_id text, p_year_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.schools s
     SET terms = jsonb_build_object(
       'semester1Start', (SELECT t.start_date::text FROM public.terms t WHERE t.school_id=p_school_id AND t.academic_year_id=p_year_id AND t.name='Semester 1'),
       'semester1End', (SELECT t.end_date::text FROM public.terms t WHERE t.school_id=p_school_id AND t.academic_year_id=p_year_id AND t.name='Semester 1'),
       'semester2Start', (SELECT t.start_date::text FROM public.terms t WHERE t.school_id=p_school_id AND t.academic_year_id=p_year_id AND t.name='Semester 2'),
       'semester2End', (SELECT t.end_date::text FROM public.terms t WHERE t.school_id=p_school_id AND t.academic_year_id=p_year_id AND t.name='Semester 2')
     ),
     current_semester = COALESCE(
       (SELECT t.name FROM public.terms t WHERE t.school_id=p_school_id AND t.academic_year_id=p_year_id AND t.is_current=true LIMIT 1),
       s.current_semester
     ),
     updated_at = now()
   WHERE s.id = p_school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_sync_school_semester_dates(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_sync_school_semester_dates(text, uuid) TO service_role;

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
  PERFORM public.schoolos_sync_school_semester_dates(p_school_id, v_year_id);
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_set_semester_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_set_semester_status(text, uuid, text, text) TO service_role;

-- Closed semesters protect marks, attendance and exam-period configuration
-- at the database boundary, including service-role writes from backend APIs.
CREATE OR REPLACE FUNCTION public.schoolos_guard_closed_student_marks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id text;
  v_term_id uuid;
  v_academic_year text;
  v_semester text;
BEGIN
  IF TG_OP='DELETE' THEN
    v_school_id:=OLD.school_id; v_term_id:=OLD.term_id;
    v_academic_year:=OLD.academic_year; v_semester:=OLD.semester;
  ELSE
    v_school_id:=NEW.school_id; v_term_id:=NEW.term_id;
    v_academic_year:=NEW.academic_year; v_semester:=NEW.semester;
  END IF;
  IF v_term_id IS NULL THEN
    SELECT t.id INTO v_term_id
      FROM public.terms t
      JOIN public.academic_years ay ON ay.id=t.academic_year_id AND ay.school_id=t.school_id
     WHERE t.school_id=v_school_id AND t.name=v_semester AND ay.name=v_academic_year
     LIMIT 1;
  END IF;
  IF v_term_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.term_status ts
     WHERE ts.school_id=v_school_id AND ts.term_id=v_term_id AND ts.status='closed'
  ) THEN
    RAISE EXCEPTION 'Marks cannot be changed while the semester is closed.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS student_marks_closed_term_guard ON public.student_marks;
CREATE TRIGGER student_marks_closed_term_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.student_marks
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_closed_student_marks();

CREATE OR REPLACE FUNCTION public.schoolos_guard_closed_component_marks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id text;
  v_component_id uuid;
  v_term_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_school_id:=OLD.school_id; v_component_id:=OLD.component_id;
  ELSE v_school_id:=NEW.school_id; v_component_id:=NEW.component_id; END IF;
  SELECT ms.term_id INTO v_term_id
    FROM public.mark_components mc
    JOIN public.mark_structures ms ON ms.id=mc.structure_id AND ms.school_id=mc.school_id
   WHERE mc.id=v_component_id AND mc.school_id=v_school_id;
  IF v_term_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.term_status ts
     WHERE ts.school_id=v_school_id AND ts.term_id=v_term_id AND ts.status='closed'
  ) THEN
    RAISE EXCEPTION 'Component marks cannot be changed while the semester is closed.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS component_marks_closed_term_guard ON public.component_marks;
CREATE TRIGGER component_marks_closed_term_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.component_marks
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_closed_component_marks();

CREATE OR REPLACE FUNCTION public.schoolos_guard_closed_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id text;
  v_date date;
  v_term_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_school_id:=OLD.school_id; v_date:=OLD.date;
  ELSE v_school_id:=NEW.school_id; v_date:=NEW.date; END IF;
  SELECT t.id INTO v_term_id
    FROM public.terms t
   WHERE t.school_id=v_school_id AND v_date BETWEEN t.start_date AND t.end_date
   ORDER BY t.start_date DESC
   LIMIT 1;
  IF v_term_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.term_status ts
     WHERE ts.school_id=v_school_id AND ts.term_id=v_term_id AND ts.status='closed'
  ) THEN
    RAISE EXCEPTION 'Attendance cannot be changed while the semester is closed.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS attendance_closed_term_guard ON public.attendance_records;
CREATE TRIGGER attendance_closed_term_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.schoolos_guard_closed_attendance();

CREATE OR REPLACE FUNCTION public.schoolos_guard_closed_exam_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id text;
  v_term_id uuid;
  v_term_start date;
  v_term_end date;
BEGIN
  IF TG_OP='DELETE' THEN
    v_school_id:=OLD.school_id; v_term_id:=OLD.term_id;
  ELSE
    v_school_id:=NEW.school_id; v_term_id:=NEW.term_id;
    SELECT start_date,end_date INTO v_term_start,v_term_end
      FROM public.terms WHERE id=v_term_id AND school_id=v_school_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Exam period must belong to a valid school semester.'; END IF;
    IF NEW.start_date > NEW.end_date OR NEW.start_date < v_term_start OR NEW.end_date > v_term_end THEN
      RAISE EXCEPTION 'Examination dates must fall within the semester dates.';
    END IF;
    IF NEW.results_publish_date IS NOT NULL AND NEW.results_publish_date < NEW.end_date THEN
      RAISE EXCEPTION 'Results cannot be published before the examination period ends.';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='published' AND (
      NEW.start_date IS DISTINCT FROM OLD.start_date OR
      NEW.end_date IS DISTINCT FROM OLD.end_date OR
      NEW.results_publish_date IS DISTINCT FROM OLD.results_publish_date OR
      NEW.status IS DISTINCT FROM OLD.status
    ) THEN
      RAISE EXCEPTION 'Published examination periods are locked.';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.term_status ts
     WHERE ts.school_id=v_school_id AND ts.term_id=v_term_id AND ts.status='closed'
  ) THEN
    RAISE EXCEPTION 'Exam periods cannot be changed while the semester is closed.';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_guard_closed_student_marks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_guard_closed_component_marks() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_guard_closed_attendance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_guard_closed_exam_period() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
