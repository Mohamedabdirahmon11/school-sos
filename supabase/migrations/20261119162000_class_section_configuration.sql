-- Complete section setup: configurable capacity and Form Teacher assignment.
-- The existing legacy classes remain the source of truth for student, exam,
-- attendance and timetable relationships.
BEGIN;

ALTER TABLE public.class_groups
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.class_sections
  ADD COLUMN IF NOT EXISTS max_students integer NOT NULL DEFAULT 40;
UPDATE public.class_sections SET max_students = 40 WHERE max_students IS NULL;
ALTER TABLE public.class_sections
  ALTER COLUMN max_students SET DEFAULT 40,
  ALTER COLUMN max_students SET NOT NULL;
ALTER TABLE public.class_sections
  DROP CONSTRAINT IF EXISTS class_sections_max_students_check;
ALTER TABLE public.class_sections
  ADD CONSTRAINT class_sections_max_students_check
  CHECK (max_students BETWEEN 1 AND 1000) NOT VALID;
ALTER TABLE public.class_sections
  VALIDATE CONSTRAINT class_sections_max_students_check;
CREATE INDEX IF NOT EXISTS class_sections_school_legacy_class_idx
  ON public.class_sections (school_id, legacy_class_id)
  WHERE legacy_class_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.schoolos_update_class_section_config(
  p_school_id text,
  p_section_id uuid,
  p_name text,
  p_max_students integer,
  p_teacher_user_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_section public.class_sections%ROWTYPE;
  v_class public.classes%ROWTYPE;
BEGIN
  IF p_max_students IS NULL OR p_max_students < 1 OR p_max_students > 1000
     OR p_name IS NULL OR char_length(btrim(p_name)) < 1 OR char_length(btrim(p_name)) > 80 THEN
    RAISE EXCEPTION 'Enter a section name and a capacity from 1 to 1000.';
  END IF;

  SELECT * INTO v_section
    FROM public.class_sections
   WHERE id = p_section_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND OR v_section.legacy_class_id IS NULL THEN
    RAISE EXCEPTION 'Section is not connected to a school class.';
  END IF;

  SELECT * INTO v_class
    FROM public.classes
   WHERE id = v_section.legacy_class_id AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy class was not found for this section.'; END IF;

  IF p_teacher_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.teachers
     WHERE school_id = p_school_id AND user_id = p_teacher_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected Form Teacher must be an active teacher in this school.';
  END IF;

  UPDATE public.classes
     SET capacity = p_max_students,
         section = btrim(p_name),
         class_teacher_id = p_teacher_user_id
   WHERE id = v_class.id AND school_id = p_school_id;

  UPDATE public.class_sections
     SET name = btrim(p_name),
         max_students = p_max_students,
         updated_at = now()
   WHERE id = v_section.id AND school_id = p_school_id
   RETURNING * INTO v_section;

  RETURN jsonb_build_object(
    'id', v_section.id,
    'name', v_section.name,
    'legacy_class_id', v_section.legacy_class_id,
    'max_students', v_section.max_students,
    'class_teacher_id', p_teacher_user_id,
    'capacity', p_max_students
  );
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_update_class_section_config(text, uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_update_class_section_config(text, uuid, text, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_reorder_class_groups(
  p_school_id text, p_ordered_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total integer;
  v_distinct integer;
  v_updated integer;
BEGIN
  IF p_ordered_ids IS NULL THEN RAISE EXCEPTION 'Class order is required.'; END IF;
  SELECT count(*) INTO v_total FROM public.class_groups WHERE school_id = p_school_id;
  SELECT count(DISTINCT x.id) INTO v_distinct FROM unnest(p_ordered_ids) AS x(id);
  IF cardinality(p_ordered_ids) <> v_total OR v_distinct <> v_total THEN
    RAISE EXCEPTION 'The class order must include every class exactly once.';
  END IF;
  UPDATE public.class_groups g
     SET sort_order = ordered.ordinality::integer * 100,
         updated_at = now()
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS ordered(id, ordinality)
   WHERE g.id = ordered.id AND g.school_id = p_school_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_total THEN RAISE EXCEPTION 'One or more classes do not belong to this school.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_reorder_class_groups(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_reorder_class_groups(text, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_set_class_group_active(
  p_school_id text, p_group_id uuid, p_is_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.class_groups
   WHERE id=p_group_id AND school_id=p_school_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class group not found in this school.'; END IF;

  UPDATE public.class_groups
     SET is_active=p_is_active, updated_at=now()
   WHERE id=p_group_id AND school_id=p_school_id;

  UPDATE public.classes c
     SET is_archived=NOT p_is_active
    FROM public.class_sections s
   WHERE s.class_id=p_group_id AND s.school_id=p_school_id
     AND s.legacy_class_id=c.id AND c.school_id=p_school_id;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_set_class_group_active(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_set_class_group_active(text, uuid, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
