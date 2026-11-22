-- Keep the high-frequency school roster and current-year lookups indexed.
-- These indexes are school-scoped and do not change tenant access or row visibility.

CREATE INDEX IF NOT EXISTS academic_years_current_school_idx
  ON public.academic_years (school_id, id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS classes_form_teacher_school_active_idx
  ON public.classes (school_id, class_teacher_id)
  WHERE is_archived = false;
