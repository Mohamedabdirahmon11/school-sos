-- Enforce one active Form Teacher per school across all active class/section rows.
-- Do not rewrite existing records automatically; fail with a clear migration error if duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.classes
    WHERE class_teacher_id IS NOT NULL AND COALESCE(is_archived, false) = false
    GROUP BY school_id, class_teacher_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active Form Teacher assignments exist. Resolve the duplicate assignments without deleting class or student data before applying this index.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS classes_one_active_form_teacher_per_school_uidx
  ON public.classes (school_id, class_teacher_id)
  WHERE class_teacher_id IS NOT NULL AND COALESCE(is_archived, false) = false;
