-- Ensure every foreign-key relationship has a full, correctly ordered child-side index.
-- PostgreSQL requires the FK columns to be the leading index keys in the same order.
-- Also remove two redundant indexes discovered after the tenant-integrity migration.
BEGIN;

DROP INDEX IF EXISTS public.idx_inventory_transactions_item_school_fk;
DROP INDEX IF EXISTS public.students_id_school_id_parent_link_uidx;

-- Keep the pre-existing equivalent tenant constraints; remove duplicate copies.
ALTER TABLE public.class_sections DROP CONSTRAINT IF EXISTS class_sections_class_group_school_fk;
ALTER TABLE public.class_subjects DROP CONSTRAINT IF EXISTS class_subjects_class_school_fk;
ALTER TABLE public.class_subjects DROP CONSTRAINT IF EXISTS class_subjects_subject_school_fk;
ALTER TABLE public.inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_item_school_fk;
ALTER TABLE public.parent_students DROP CONSTRAINT IF EXISTS parent_students_parent_school_fk;
ALTER TABLE public.parent_students DROP CONSTRAINT IF EXISTS parent_students_student_school_fk;

DO $fk_indexes$
DECLARE
  r record;
  v_columns text;
  v_suffix text;
  v_index_name text;
BEGIN
  FOR r IN
    SELECT DISTINCT con.conrelid, con.conkey, rel.relname AS table_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = con.conrelid
          AND i.indisvalid
          AND i.indisready
          AND i.indpred IS NULL
          AND i.indnkeyatts >= cardinality(con.conkey)
          AND left(
            i.indkey::text,
            length(array_to_string(con.conkey, ' '))
          ) = array_to_string(con.conkey, ' ')
      )
    ORDER BY con.conrelid, con.conkey
  LOOP
    SELECT
      string_agg(format('%I', a.attname), ', ' ORDER BY k.ord),
      string_agg(a.attname, '_' ORDER BY k.ord)
    INTO v_columns, v_suffix
    FROM unnest(r.conkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = r.conrelid
     AND a.attnum = k.attnum;

    v_index_name :=
      left('idx_fk_' || r.table_name || '_' || v_suffix, 54)
      || '_' || substr(md5(r.table_name || ':' || v_suffix), 1, 8);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
      v_index_name,
      r.table_name,
      v_columns
    );
  END LOOP;
END
$fk_indexes$;

DO $verify_fk_indexes$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_namespace ns ON ns.oid = (
      SELECT relnamespace FROM pg_class WHERE oid = con.conrelid
    )
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = con.conrelid
          AND i.indisvalid
          AND i.indisready
          AND i.indpred IS NULL
          AND i.indnkeyatts >= cardinality(con.conkey)
          AND left(
            i.indkey::text,
            length(array_to_string(con.conkey, ' '))
          ) = array_to_string(con.conkey, ' ')
      )
  ) THEN
    RAISE EXCEPTION 'One or more public foreign keys still lack a covering child-side index';
  END IF;
END
$verify_fk_indexes$;

COMMIT;
