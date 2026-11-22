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
  class_id varchar NOT NULL, subject_id varchar NOT NULL, teacher_id varchar
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

-- Atomic rollback: a failed timetable cleanup must roll back the assignment update too.
INSERT INTO public.teachers(id,school_id,status,max_periods_per_week) VALUES ('t-old','school-a','active',30),('t-new','school-a','active',30);
INSERT INTO public.academic_years(id,school_id,is_current) VALUES ('00000000-0000-0000-0000-000000000001','school-a',true);
INSERT INTO public.class_subjects(school_id,class_id,subject_id,periods_per_week) VALUES ('school-a','class-a','math',5);
INSERT INTO public.teacher_class_subject_assignments(id,school_id,academic_year_id,class_id,subject_id,teacher_id)
VALUES ('00000000-0000-0000-0000-000000000011','school-a','00000000-0000-0000-0000-000000000001','class-a','math','t-old');
INSERT INTO public.timetable_slots(school_id,class_id,subject_id,teacher_id) VALUES ('school-a','class-a','math','t-old');
CREATE FUNCTION public.fail_timetable_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'simulated timetable cleanup failure'; END $$;
CREATE TRIGGER fail_timetable_cleanup BEFORE DELETE ON public.timetable_slots
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
  IF EXISTS (SELECT 1 FROM public.timetable_slots WHERE school_id='school-a' AND class_id='class-a' AND subject_id='math') THEN
    RAISE EXCEPTION 'dependent timetable slot was not cleaned';
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
