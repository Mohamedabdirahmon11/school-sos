\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.teacher_class_subject_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id varchar NOT NULL,
  academic_year_id uuid NOT NULL, term_id uuid, class_id varchar NOT NULL,
  section_id uuid, subject_id varchar NOT NULL, teacher_id varchar NOT NULL,
  qualification_override boolean NOT NULL DEFAULT false, created_by varchar,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.teachers (
  id varchar PRIMARY KEY, school_id varchar NOT NULL, status varchar NOT NULL,
  max_periods_per_week integer
);
CREATE TABLE public.class_subjects (
  school_id varchar NOT NULL, class_id varchar NOT NULL, subject_id varchar NOT NULL,
  periods_per_week integer NOT NULL, is_active boolean NOT NULL DEFAULT true, teacher_id varchar,
  PRIMARY KEY (school_id,class_id,subject_id)
);
CREATE TABLE public.terms (id uuid PRIMARY KEY, school_id varchar, academic_year_id uuid, is_current boolean);
CREATE TABLE public.academic_years (id uuid PRIMARY KEY, school_id varchar, is_current boolean);
CREATE TABLE public.teacher_assignment_audit (
  id bigserial PRIMARY KEY, school_id varchar, assignment_id uuid, action text,
  before_data jsonb, after_data jsonb, changed_by varchar
);
CREATE TABLE public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id varchar NOT NULL,
  class_id varchar NOT NULL, subject_id varchar NOT NULL, teacher_id varchar, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.schools (id text PRIMARY KEY, setup_progress jsonb);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY schools_tenant_scope ON public.schools FOR SELECT TO authenticated USING (id = current_setting('app.school_id', true));
INSERT INTO public.schools(id,setup_progress) VALUES
  ('school-complete','{"completedAt":"2026-11-22T12:34:56.000Z"}'::jsonb),
  ('school-incomplete','{"currentStep":1,"completedSteps":[]}'::jsonb);

CREATE TABLE public.classes (
  id text PRIMARY KEY, school_id varchar NOT NULL, class_teacher_id varchar,
  is_archived boolean DEFAULT false
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.classes TO authenticated;
CREATE POLICY classes_school_scope ON public.classes
  FOR SELECT TO authenticated
  USING (school_id = current_setting('app.school_id', true));

\i supabase/migrations/20261122120000_atomic_teacher_assignment_upsert.sql
\i supabase/migrations/20261122121000_one_active_form_teacher_per_school.sql
\i supabase/migrations/20261122122000_school_setup_completed_at.sql
DO $setup$
BEGIN
  IF (SELECT setup_completed_at FROM public.schools WHERE id='school-complete') IS NULL THEN RAISE EXCEPTION 'legacy completion timestamp was not backfilled'; END IF;
  IF (SELECT setup_completed_at FROM public.schools WHERE id='school-incomplete') IS NOT NULL THEN RAISE EXCEPTION 'incomplete existing school must remain NULL'; END IF;
  INSERT INTO public.schools(id,setup_progress) VALUES ('school-new','{}'::jsonb);
  IF (SELECT setup_completed_at FROM public.schools WHERE id='school-new') IS NOT NULL THEN RAISE EXCEPTION 'new school must remain NULL'; END IF;
END $setup$;

-- Atomic rollback: a failed timetable cleanup must roll back the assignment update too.
INSERT INTO public.teachers(id,school_id,status,max_periods_per_week) VALUES ('t-old','school-a','active',30),('t-new','school-a','active',30);
INSERT INTO public.academic_years(id,school_id,is_current) VALUES ('00000000-0000-0000-0000-000000000001','school-a',true);
INSERT INTO public.class_subjects(school_id,class_id,subject_id,periods_per_week) VALUES ('school-a','class-a','math',5);
INSERT INTO public.teacher_class_subject_assignments(id,school_id,academic_year_id,class_id,subject_id,teacher_id)
VALUES ('00000000-0000-0000-0000-000000000011','school-a','00000000-0000-0000-0000-000000000001','class-a','math','t-old');
INSERT INTO public.timetable_slots(school_id,class_id,subject_id,teacher_id) VALUES ('school-a','class-a','math','t-old');
CREATE FUNCTION public.fail_timetable_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'simulated timetable cleanup failure'; END $$;
CREATE TRIGGER fail_timetable_cleanup BEFORE UPDATE ON public.timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.fail_timetable_cleanup();
DO $$
BEGIN
  BEGIN
    PERFORM public.upsert_teacher_assignment_atomic(
      '00000000-0000-0000-0000-000000000011','school-a',
      '00000000-0000-0000-0000-000000000001',NULL,'class-a',NULL,
      'math','t-new',false,'test-user',true
    );
    RAISE EXCEPTION 'expected cleanup failure was not raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'expected cleanup failure was not raised' THEN RAISE; END IF;
  END;
END $$;
DO $$
BEGIN
  IF (SELECT teacher_id FROM public.teacher_class_subject_assignments WHERE id='00000000-0000-0000-0000-000000000011') <> 't-old' THEN
    RAISE EXCEPTION 'assignment update was not rolled back with timetable cleanup';
  END IF;
END $$;
DROP TRIGGER fail_timetable_cleanup ON public.timetable_slots;
DROP FUNCTION public.fail_timetable_cleanup();

-- Successful atomic update cleans dependent timetable rows and records its audit.
SELECT public.upsert_teacher_assignment_atomic(
  '00000000-0000-0000-0000-000000000011','school-a',
  '00000000-0000-0000-0000-000000000001',NULL,'class-a',NULL,
  'math','t-new',false,'test-user',true
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.timetable_slots WHERE school_id='school-a' AND class_id='class-a' AND subject_id='math' AND is_active = true) THEN
    RAISE EXCEPTION 'dependent timetable slot was not deactivated';
  END IF;
  IF (SELECT count(*) FROM public.teacher_assignment_audit WHERE school_id='school-a') <> 1 THEN
    RAISE EXCEPTION 'assignment audit was not committed atomically';
  END IF;
END $$;

-- The school-wide active Form Teacher unique index rejects duplicates without deleting rows.
INSERT INTO public.classes(id,school_id,class_teacher_id) VALUES ('class-1','school-a','teacher-form');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.classes(id,school_id,class_teacher_id) VALUES ('class-2','school-a','teacher-form');
    RAISE EXCEPTION 'duplicate Form Teacher was not rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

-- RLS prevents an authenticated school user from reading another school's classes.
INSERT INTO public.classes(id,school_id,class_teacher_id) VALUES ('class-b','school-b','teacher-b');
SET ROLE authenticated;
SET app.school_id = 'school-a';
DO $$
DECLARE visible_rows integer;
BEGIN
  SELECT count(*) INTO visible_rows FROM public.classes WHERE id='class-b';
  IF visible_rows <> 0 THEN RAISE EXCEPTION 'cross-school RLS isolation failed'; END IF;
END $$;
RESET ROLE;
SELECT 'SQL migration integration checks passed' AS result;

-- Exercise the Supabase index/RLS performance migration on isolated fixture tables.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.auth_user_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'school_admin'::text $$;
CREATE OR REPLACE FUNCTION private.auth_has_term_assignment(varchar,varchar,varchar,uuid,varchar) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION private.auth_can_access_student(varchar) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

CREATE TABLE IF NOT EXISTS public.class_sections (id text NOT NULL, school_id varchar NOT NULL);
CREATE TABLE IF NOT EXISTS public.attendance_records (id text NOT NULL, school_id varchar NOT NULL, student_id text NOT NULL, date date NOT NULL);
CREATE TABLE IF NOT EXISTS public.students (id text NOT NULL, school_id varchar NOT NULL);
CREATE TABLE IF NOT EXISTS public.subjects (id text NOT NULL, school_id varchar NOT NULL);
CREATE TABLE IF NOT EXISTS public.mark_structures (id text NOT NULL, school_id varchar NOT NULL, class_id text, term_id uuid);
CREATE TABLE IF NOT EXISTS public.mark_components (id text NOT NULL, school_id varchar NOT NULL, structure_id text NOT NULL);
CREATE TABLE IF NOT EXISTS public.report_cards (
  id text NOT NULL, school_id varchar NOT NULL, student_id text NOT NULL,
  published_at timestamptz, is_stale boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.term_status (id text NOT NULL, school_id varchar NOT NULL, term_id uuid);

ALTER TABLE public.mark_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mark_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.term_status ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS academic_years_id_school_uidx ON public.academic_years(id,school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_student_date ON public.attendance_records(school_id,student_id,date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance_records(school_id,student_id,date);
CREATE UNIQUE INDEX IF NOT EXISTS class_sections_id_school_uidx ON public.class_sections(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS classes_id_school_id_uidx ON public.classes(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS classes_id_school_uidx ON public.classes(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS students_id_school_uidx ON public.students(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_id_school_id_uidx ON public.subjects(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_id_school_uidx ON public.subjects(id,school_id);
CREATE UNIQUE INDEX IF NOT EXISTS terms_id_school_uidx ON public.terms(id,school_id);

CREATE POLICY mark_components_read ON public.mark_components FOR SELECT TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin') OR EXISTS (
  SELECT 1 FROM public.mark_structures ms
  WHERE ms.id=mark_components.structure_id AND ms.school_id=mark_components.school_id
    AND EXISTS (
      SELECT 1 FROM public.teacher_class_subject_assignments a
      WHERE a.school_id=ms.school_id
        AND (ms.class_id IS NULL OR a.class_id=ms.class_id)
        AND (a.term_id IS NULL OR a.term_id=ms.term_id)
        AND private.auth_has_term_assignment(a.school_id,a.class_id,a.subject_id,ms.term_id,NULL)
    )
));
CREATE POLICY mark_components_admin_write ON public.mark_components FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY mark_structures_read ON public.mark_structures FOR SELECT TO authenticated
USING (
  private.auth_user_role() IN ('school_admin','super_admin')
  OR EXISTS (
    SELECT 1 FROM public.teacher_class_subject_assignments a
    WHERE a.school_id=mark_structures.school_id
      AND (mark_structures.class_id IS NULL OR a.class_id=mark_structures.class_id)
      AND (a.term_id IS NULL OR a.term_id=mark_structures.term_id)
      AND private.auth_has_term_assignment(a.school_id,a.class_id,a.subject_id,mark_structures.term_id,NULL)
  )
);
CREATE POLICY mark_structures_admin_write ON public.mark_structures FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY report_cards_admin_all ON public.report_cards FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
CREATE POLICY report_cards_parent_published_read ON public.report_cards FOR SELECT TO authenticated
USING (
  published_at IS NOT NULL AND is_stale=false
  AND private.auth_user_role() IN ('parent','student')
  AND private.auth_can_access_student(student_id)
);
CREATE POLICY term_status_read ON public.term_status FOR SELECT TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin','teacher'));
CREATE POLICY term_status_admin_write ON public.term_status FOR ALL TO authenticated
USING (private.auth_user_role() IN ('school_admin','super_admin'))
WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));

\i supabase/migrations/20261126100000_supabase_duplicate_index_and_rls_policy_cleanup.sql
\i supabase/migrations/20261126100000_supabase_duplicate_index_and_rls_policy_cleanup.sql

DO $rls_perf$
DECLARE
  table_name text;
  select_count integer;
  write_count integer;
  report_policy text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['mark_components','mark_structures','report_cards','term_status'] LOOP
    SELECT count(*) INTO select_count
    FROM pg_policies
    WHERE schemaname='public' AND tablename=table_name
      AND cmd='SELECT' AND roles @> ARRAY['authenticated']::name[];
    IF select_count <> 1 THEN
      RAISE EXCEPTION '% should have exactly one authenticated SELECT policy; got %', table_name, select_count;
    END IF;
    SELECT count(*) INTO write_count
    FROM pg_policies
    WHERE schemaname='public' AND tablename=table_name
      AND cmd IN ('INSERT','UPDATE','DELETE') AND roles @> ARRAY['authenticated']::name[];
    IF write_count <> 3 THEN
      RAISE EXCEPTION '% should have three explicit admin write policies; got %', table_name, write_count;
    END IF;
  END LOOP;

  SELECT qual INTO report_policy FROM pg_policies
  WHERE schemaname='public' AND tablename='report_cards' AND policyname='report_cards_read';
  IF report_policy IS NULL OR report_policy NOT LIKE '%published_at IS NOT NULL%'
     OR report_policy NOT LIKE '%is_stale%' OR report_policy NOT LIKE '%auth_can_access_student%' THEN
    RAISE EXCEPTION 'combined report-card SELECT policy lost parent/student published-read restrictions';
  END IF;

  IF to_regclass('public.idx_attendance_student') IS NOT NULL
     OR to_regclass('public.academic_years_id_school_uidx') IS NOT NULL
     OR to_regclass('public.class_sections_id_school_uidx') IS NOT NULL
     OR to_regclass('public.classes_id_school_id_uidx') IS NOT NULL
     OR to_regclass('public.classes_id_school_uidx') IS NOT NULL
     OR to_regclass('public.students_id_school_uidx') IS NOT NULL
     OR to_regclass('public.subjects_id_school_id_uidx') IS NOT NULL
     OR to_regclass('public.subjects_id_school_uidx') IS NOT NULL
     OR to_regclass('public.terms_id_school_uidx') IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate index cleanup did not remove every intended duplicate';
  END IF;
END $rls_perf$;

SELECT 'Supabase RLS/index performance migration checks passed' AS result;
