\set ON_ERROR_STOP on
CREATE TABLE public.schools (id text PRIMARY KEY);
INSERT INTO public.schools VALUES ('school-a'),('school-b');
CREATE TABLE public.classes (id text NOT NULL, school_id text NOT NULL, UNIQUE (id, school_id));
CREATE TABLE public.students (id text NOT NULL PRIMARY KEY, school_id text NOT NULL);
CREATE UNIQUE INDEX idx_students_id_school_unique ON public.students (id, school_id);
CREATE UNIQUE INDEX students_id_school_id_parent_link_uidx ON public.students (id, school_id);
INSERT INTO public.classes VALUES ('class-a','school-a'),('class-b','school-b');
INSERT INTO public.students VALUES ('student-a','school-a'),('student-b','school-b');
CREATE TABLE public.child_records (
  id text PRIMARY KEY, school_id text NOT NULL, class_id text NOT NULL, student_id text NOT NULL,
  CONSTRAINT child_records_class_school_fk FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id),
  CONSTRAINT child_records_student_school_fk FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id)
);
CREATE INDEX child_records_school_class_wrong_idx ON public.child_records (school_id, class_id);
CREATE INDEX child_records_student_only_idx ON public.child_records (student_id);
CREATE TABLE public.inventory_items (id text NOT NULL, school_id text NOT NULL, UNIQUE (id, school_id));
CREATE TABLE public.inventory_transactions (
  id text PRIMARY KEY, school_id text NOT NULL, item_id text NOT NULL,
  CONSTRAINT inventory_transactions_item_school_fk FOREIGN KEY (item_id, school_id) REFERENCES public.inventory_items(id, school_id)
);
CREATE INDEX inventory_transactions_item_school_idx ON public.inventory_transactions (item_id, school_id);
CREATE INDEX idx_inventory_transactions_item_school_fk ON public.inventory_transactions (item_id, school_id);
INSERT INTO public.child_records VALUES ('record-a','school-a','class-a','student-a');
INSERT INTO public.inventory_items VALUES ('item-a','school-a');
INSERT INTO public.inventory_transactions VALUES ('transaction-a','school-a','item-a');
\i supabase/migrations/20261126100400_fk_index_coverage_hardening.sql
\i supabase/migrations/20261126100400_fk_index_coverage_hardening.sql
DO $assertions$
BEGIN
  IF to_regclass('public.students_id_school_id_parent_link_uidx') IS NOT NULL THEN RAISE EXCEPTION 'redundant students composite unique index was not removed'; END IF;
  IF to_regclass('public.idx_students_id_school_unique') IS NULL THEN RAISE EXCEPTION 'constraint-supporting students unique index was removed'; END IF;
  IF to_regclass('public.idx_inventory_transactions_item_school_fk') IS NOT NULL THEN RAISE EXCEPTION 'redundant inventory transaction index was not removed'; END IF;
  IF to_regclass('public.inventory_transactions_item_school_idx') IS NULL THEN RAISE EXCEPTION 'existing inventory FK index was removed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='public.child_records'::regclass AND i.indisvalid AND i.indisready AND i.indnkeyatts>=2 AND left(i.indkey::text,3)='3 2') THEN RAISE EXCEPTION 'correct class_id, school_id index missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='public.child_records'::regclass AND i.indisvalid AND i.indisready AND i.indnkeyatts>=2 AND left(i.indkey::text,3)='4 2') THEN RAISE EXCEPTION 'correct student_id, school_id index missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint con JOIN pg_namespace ns ON ns.oid=(SELECT relnamespace FROM pg_class WHERE oid=con.conrelid)
    WHERE con.contype='f' AND ns.nspname='public' AND NOT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid=con.conrelid AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND i.indnkeyatts>=cardinality(con.conkey)
        AND left(i.indkey::text,length(array_to_string(con.conkey,' ')))=array_to_string(con.conkey,' ')
    )
  ) THEN RAISE EXCEPTION 'public foreign key still lacks a correctly ordered index'; END IF;
END
$assertions$;
SELECT 'FK index coverage checks passed' AS result;
