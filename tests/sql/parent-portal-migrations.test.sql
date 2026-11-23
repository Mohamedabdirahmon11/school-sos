\set ON_ERROR_STOP on
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='user_role_enum') THEN
    CREATE TYPE public.user_role_enum AS ENUM ('parent','student','teacher','school_admin','super_admin');
  END IF;
END $$;
CREATE TABLE public.schools (id varchar(64) PRIMARY KEY);
CREATE TABLE public.users (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) REFERENCES public.schools(id) ON DELETE CASCADE,
  role public.user_role_enum NOT NULL,
  linked_student_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  phone text,
  parent_phone text
);
CREATE TABLE public.students (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  father_phone text,
  mother_phone text
);
CREATE TABLE public.direct_messages (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  sender_id varchar(64) NOT NULL,
  recipient_id varchar(64) NOT NULL,
  content text NOT NULL
);
INSERT INTO public.schools(id) VALUES ('school-a'),('school-b');
INSERT INTO public.students(id,school_id,father_phone,mother_phone) VALUES
 ('student-array','school-a','+251900000001',''),
 ('student-phone','school-a','+251900000002',''),
 ('student-cross','school-b','+251900000003','');
INSERT INTO public.users(id,school_id,role,linked_student_ids,phone,parent_phone) VALUES
 ('parent-array','school-a','parent',ARRAY['student-array'],'+251900000001',''),
 ('parent-phone','school-a','parent',ARRAY[]::text[],'+251900000002','');
\ir ../../supabase/migrations/20261123010000_parent_portal_relationships.sql
\ir ../../supabase/migrations/20261123010000_parent_portal_relationships.sql

DO $$
BEGIN
  IF (SELECT count(*) FROM public.parent_students) <> 2 THEN
    RAISE EXCEPTION 'Expected two legacy parent links after backfill.';
  END IF;
  IF NOT has_table_privilege('authenticated','public.parent_students','SELECT') THEN
    RAISE EXCEPTION 'Authenticated role must not read canonical parent links directly.';
  END IF;
  IF NOT has_table_privilege('service_role','public.parent_students','SELECT') THEN
    RAISE EXCEPTION 'Service role must read canonical parent links.';
  END IF;
END $$;

INSERT INTO public.direct_messages(id,school_id,sender_id,recipient_id,content)
VALUES ('message-keep','school-a','parent-array','teacher-a','Keep message history.');
UPDATE public.users SET linked_student_ids=ARRAY[]::text[] WHERE id='parent-array';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.parent_students WHERE parent_id='parent-array' AND student_id='student-array') THEN
    RAISE EXCEPTION 'Removing an admin-managed link must revoke the parent relation.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parent_students WHERE parent_id='parent-phone' AND student_id='student-phone') THEN
    RAISE EXCEPTION 'Legacy guardian-phone backfill must be retained.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.direct_messages WHERE id='message-keep') THEN
    RAISE EXCEPTION 'Revoking a parent link must preserve message history.';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.parent_students(school_id,parent_id,student_id,relation)
    VALUES ('school-b','parent-phone','student-cross','guardian');
    RAISE EXCEPTION 'Cross-school parent/student link should fail.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.parent_students(school_id,parent_id,student_id,relation)
    VALUES ('school-a','parent-phone','student-phone','guardian');
    RAISE EXCEPTION 'Duplicate parent/student link should fail.';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

SELECT 'Parent Portal migration checks passed.' AS result;
