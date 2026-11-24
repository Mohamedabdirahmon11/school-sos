\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.auth_user_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.user_role', true), '') $$;
CREATE OR REPLACE FUNCTION public.auth_school_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.school_id', true), '') $$;
CREATE TABLE public.schools(id varchar(64) PRIMARY KEY);
INSERT INTO public.schools VALUES ('school-a'),('school-b');
CREATE TABLE public.classes(id varchar(64) PRIMARY KEY, school_id varchar(64) NOT NULL REFERENCES public.schools(id));
INSERT INTO public.classes VALUES ('class-a','school-a'),('class-b','school-b');
CREATE TABLE public.admission_applications(
  id varchar(64) PRIMARY KEY, school_id varchar(64) NOT NULL REFERENCES public.schools(id),
  class_id varchar(64) NOT NULL REFERENCES public.classes(id), applied_date date NOT NULL DEFAULT CURRENT_DATE,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  student_id varchar(64)
);
CREATE TABLE public.staff_members(
  id varchar(64) PRIMARY KEY, school_id varchar(64) NOT NULL REFERENCES public.schools(id),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[]
);
INSERT INTO public.admission_applications(id,school_id,class_id,status) VALUES
 ('app-pending','school-a','class-a','pending'),
 ('app-approved','school-a','class-a','approved'),
 ('app-rejected','school-a','class-a','rejected');
\i supabase/migrations/013_people_admin_pipeline_roles.sql
\i supabase/migrations/013_people_admin_pipeline_roles.sql
DO $$
BEGIN
  IF (SELECT pipeline_stage FROM public.admission_applications WHERE id='app-pending') <> 'applied' THEN RAISE EXCEPTION 'pending legacy application did not map to applied'; END IF;
  IF (SELECT pipeline_stage FROM public.admission_applications WHERE id='app-approved') <> 'enrolled' THEN RAISE EXCEPTION 'approved legacy application did not map to enrolled'; END IF;
  IF (SELECT pipeline_stage FROM public.admission_applications WHERE id='app-rejected') <> 'rejected' THEN RAISE EXCEPTION 'rejected legacy application did not map to rejected'; END IF;
  INSERT INTO public.staff_roles(id,school_id,name,permissions) VALUES ('role-a','school-a','Admissions Officer',ARRAY['admissions_manage']);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='staff_members' AND column_name='role_id') THEN RAISE EXCEPTION 'staff_members.role_id missing'; END IF;
END $$;
SET ROLE authenticated;
SET app.user_role='school_admin';
SET app.school_id='school-a';
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.staff_roles;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'tenant role read isolation failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.staff_roles WHERE school_id='school-b') THEN RAISE EXCEPTION 'cross-school role data leaked'; END IF;
END $$;
RESET ROLE;
UPDATE public.admission_applications SET status='approved' WHERE id='app-pending';
DO $$
BEGIN
  IF (SELECT pipeline_stage FROM public.admission_applications WHERE id='app-pending') <> 'enrolled' THEN RAISE EXCEPTION 'status trigger did not synchronize enrolled stage'; END IF;
END $$;
SELECT 'People Admin migration integration checks passed' AS result;
