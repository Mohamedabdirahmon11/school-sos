\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TYPE public.user_role_enum AS ENUM ('super_admin','school_admin','teacher','accountant','student','parent');
CREATE TABLE public.schools (id VARCHAR(64) PRIMARY KEY, name TEXT, code TEXT);
CREATE TABLE public.students (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id),
  branch_id VARCHAR(64),
  student_id VARCHAR(64) NOT NULL,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  father_phone TEXT,
  mother_phone TEXT,
  student_phone TEXT,
  pin_hash TEXT,
  status TEXT DEFAULT 'active'
);
CREATE TABLE public.users (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) REFERENCES public.schools(id),
  branch_id VARCHAR(64),
  role public.user_role_enum NOT NULL,
  full_name TEXT,
  phone TEXT,
  parent_phone TEXT,
  student_id VARCHAR(64),
  linked_student_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  pin_hash TEXT,
  password_hash TEXT DEFAULT '',
  is_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ
);
CREATE TABLE public.assignments (school_id VARCHAR(64), class_id VARCHAR(64), due_date DATE);
CREATE TABLE public.student_marks (school_id VARCHAR(64), student_id VARCHAR(64), published_at TIMESTAMPTZ);
CREATE TABLE public.notice_reads (id TEXT PRIMARY KEY, school_id VARCHAR(64), user_id VARCHAR(64), notice_id TEXT);
\i supabase/migrations/20261123010000_parent_portal_relationships.sql
CREATE TABLE public.user_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id VARCHAR(64));
CREATE TABLE public.lockout_counters (
  id TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id TEXT PRIMARY KEY, action TEXT, category TEXT, school_id VARCHAR(64), school_name TEXT,
  user_id VARCHAR(64), user_name TEXT, user_role public.user_role_enum, ip_address TEXT, details TEXT, severity TEXT
);

INSERT INTO public.schools(id,name,code) VALUES ('pin-school-a','PIN School A','PINA'), ('pin-school-b','PIN School B','PINB');
INSERT INTO public.students(id,school_id,student_id,first_name,pin_hash)
VALUES ('legacy-child','pin-school-a','ST-0001','Legacy Student','scrypt:legacy');
INSERT INTO public.users(id,school_id,role,full_name,linked_student_ids,must_change_password)
VALUES ('legacy-parent','pin-school-a','parent','Legacy Parent',ARRAY['legacy-child'],false);

\i supabase/migrations/20261123083200_parent_student_accounts.sql
\i supabase/migrations/20261123090000_bulk_pin_reset_rotation.sql
-- Re-running both migrations must be safe and must not duplicate relationship rows.
\i supabase/migrations/20261123083200_parent_student_accounts.sql
\i supabase/migrations/20261123090000_bulk_pin_reset_rotation.sql

DO $$
DECLARE
  v_count INTEGER;
  v_rotation BOOLEAN;
  v_rls BOOLEAN;
  v_function TEXT;
BEGIN
  SELECT count(*) INTO v_count FROM public.parent_students
   WHERE parent_id='legacy-parent' AND student_id='legacy-child' AND school_id='pin-school-a';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Legacy explicit parent links were not backfilled exactly once.'; END IF;
  SELECT must_change_password INTO v_rotation FROM public.users WHERE id='legacy-parent';
  IF v_rotation IS DISTINCT FROM false THEN RAISE EXCEPTION 'Migration unexpectedly forced existing parent accounts to rotate.'; END IF;

  INSERT INTO public.students(id,school_id,student_id,first_name,pin_hash)
  VALUES ('new-child-1','pin-school-a','ST-0002','New Student','scrypt:hash'),
         ('new-child-2','pin-school-a','ST-0003','Sibling','scrypt:hash');
  INSERT INTO public.users(id,school_id,role,full_name,linked_student_ids,pin_hash)
  VALUES ('new-parent','pin-school-a','parent','New Parent',ARRAY['new-child-1'],'scrypt:hash');
  SELECT must_change_password INTO v_rotation FROM public.users WHERE id='new-parent';
  IF v_rotation IS DISTINCT FROM true THEN RAISE EXCEPTION 'New parent account must require first-login PIN rotation.'; END IF;
  UPDATE public.users SET linked_student_ids=ARRAY['new-child-1','new-child-2'] WHERE id='new-parent';
  INSERT INTO public.users(id,school_id,role,full_name,linked_student_ids,pin_hash)
  VALUES ('second-parent','pin-school-a','parent','Second Parent',ARRAY['new-child-1'],'scrypt:hash');
  SELECT count(*) INTO v_count FROM public.parent_students
   WHERE school_id='pin-school-a' AND student_id='new-child-1';
  IF v_count <> 2 THEN RAISE EXCEPTION 'One student must support two separate parent accounts.'; END IF;
  SELECT count(*) INTO v_count FROM public.parent_students
   WHERE parent_id='new-parent' AND school_id='pin-school-a';
  IF v_count <> 2 THEN RAISE EXCEPTION 'One parent account must link to multiple children.'; END IF;

  INSERT INTO public.users(id,school_id,role,full_name,phone,parent_phone,pin_hash)
  VALUES ('phone-parent-a','pin-school-a','parent','Phone Parent A','+251 911 222 333','+251 911 222 333','scrypt:hash');
  BEGIN
    INSERT INTO public.users(id,school_id,role,full_name,phone,parent_phone,pin_hash)
    VALUES ('phone-parent-duplicate','pin-school-a','parent','Duplicate Phone Parent','+251911222333',NULL,'scrypt:hash');
    RAISE EXCEPTION 'Duplicate normalized parent phone was accepted in one school.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  INSERT INTO public.users(id,school_id,role,full_name,phone,pin_hash)
  VALUES ('phone-parent-other-school','pin-school-b','parent','Other School Phone Parent','+251911222333','scrypt:hash');
  UPDATE public.users SET linked_student_ids=ARRAY['new-child-1'] WHERE id='new-parent';
  SELECT count(*) INTO v_count FROM public.parent_students
   WHERE parent_id='new-parent' AND student_id='new-child-2' AND school_id='pin-school-a' AND revoked_at IS NOT NULL;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Removed child relationship must be revoked immediately.'; END IF;

  INSERT INTO public.users(id,school_id,role,full_name,student_id,pin_hash)
  VALUES ('new-student-user','pin-school-a','student','New Student','ST-0002','scrypt:hash');
  SELECT must_change_password INTO v_rotation FROM public.users WHERE id='new-student-user';
  IF v_rotation IS DISTINCT FROM true THEN RAISE EXCEPTION 'New student account must require first-login PIN rotation.'; END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='parent_students';
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'parent_students RLS must be enabled.'; END IF;
  IF has_table_privilege('anon', 'public.parent_students', 'SELECT') OR has_table_privilege('authenticated', 'public.parent_students', 'SELECT') THEN
    RAISE EXCEPTION 'Untrusted anon/authenticated roles must not read parent-child links directly.';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.parent_students', 'SELECT') THEN
    RAISE EXCEPTION 'Service role must retain access for server-verified relationship checks.';
  END IF;
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='lockout_counters';
  IF v_rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'lockout_counters RLS must be enabled.'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='lockout_counters' AND column_name='lockout_count'
  ) THEN RAISE EXCEPTION 'Exponential lockout count must persist in the database.'; END IF;

  SELECT pg_get_functiondef('public.schoolos_bulk_reset_student_pins(jsonb)'::regprocedure) INTO v_function;
  IF position('must_change_password = true' IN v_function) = 0 THEN RAISE EXCEPTION 'Bulk student PIN reset must require PIN rotation.'; END IF;

  INSERT INTO public.students(id,school_id,student_id,first_name,pin_hash)
  VALUES ('missing-account-child','pin-school-a','ST-0004','Backfill Student','scrypt:old');
  INSERT INTO public.lockout_counters(id,attempt_count) VALUES ('sp:PINA:ST-0002',5), ('sp:PINA:ST-0004',2);
  INSERT INTO public.user_sessions(user_id) VALUES ('new-student-user');
  INSERT INTO public.users(id,school_id,role,full_name,phone,student_id,pin_hash,must_change_password)
  VALUES ('parent-pin-untouched','pin-school-a','parent','Parent','+251911111111',NULL,'scrypt:parent-before',false);
  PERFORM public.schoolos_bulk_reset_student_pins(jsonb_build_object(
    'school_id','pin-school-a',
    'changed_by','school-admin-test',
    'changed_by_name','School Admin',
    'changed_by_role','school_admin',
    'changed_by_ip','192.0.2.1',
    'students',jsonb_build_array(
      jsonb_build_object('student_id','ST-0002','pin_hash','scrypt:rotated'),
      jsonb_build_object('student_id','ST-0004','pin_hash','scrypt:backfill')
    )
  ));
  SELECT must_change_password INTO v_rotation FROM public.users WHERE id='new-student-user';
  IF v_rotation IS DISTINCT FROM true THEN RAISE EXCEPTION 'Bulk reset did not force existing student account PIN rotation.'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_sessions WHERE user_id='new-student-user') THEN
    RAISE EXCEPTION 'Bulk reset did not invalidate student sessions.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lockout_counters WHERE id IN ('sp:PINA:ST-0002','sp:PINA:ST-0004')) THEN
    RAISE EXCEPTION 'Bulk reset did not clear student account lockouts.';
  END IF;
  SELECT count(*) INTO v_count FROM public.users
   WHERE school_id='pin-school-a' AND role='student'::public.user_role_enum AND student_id='ST-0004';
  IF v_count <> 1 THEN RAISE EXCEPTION 'Admin-selected legacy backfill did not create exactly one student account.'; END IF;
  SELECT must_change_password INTO v_rotation FROM public.users WHERE student_id='ST-0004' AND school_id='pin-school-a';
  IF v_rotation IS DISTINCT FROM true THEN RAISE EXCEPTION 'Backfilled student account must require first-login PIN rotation.'; END IF;
  IF (SELECT pin_hash FROM public.users WHERE id='parent-pin-untouched') <> 'scrypt:parent-before' THEN
    RAISE EXCEPTION 'Student bulk reset unexpectedly changed a parent PIN.';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.parent_students(parent_id,student_id,school_id)
    VALUES ('new-parent','legacy-child','pin-school-b');
    RAISE EXCEPTION 'Cross-school parent-child link was accepted.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

SELECT 'parent/student PIN migration tests passed' AS result;
