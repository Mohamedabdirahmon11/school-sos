-- Step 4: class-to-subject curriculum. Reuse the existing class_subjects rows.
-- Existing teacher/exam flags and all timetable-linked rows are preserved.
CREATE UNIQUE INDEX IF NOT EXISTS classes_id_school_id_uidx
  ON public.classes (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_id_school_id_uidx
  ON public.subjects (id, school_id);

ALTER TABLE public.class_subjects
  DROP CONSTRAINT IF EXISTS class_subjects_periods_per_week_check;
ALTER TABLE public.class_subjects
  ADD CONSTRAINT class_subjects_periods_per_week_check
  CHECK (periods_per_week BETWEEN 1 AND 12) NOT VALID;
ALTER TABLE public.class_subjects
  VALIDATE CONSTRAINT class_subjects_periods_per_week_check;

-- The existing tenant triple-key already protects uniqueness; this exact pair
-- key also makes the requested class/subject uniqueness explicit.
CREATE UNIQUE INDEX IF NOT EXISTS class_subjects_class_subject_uidx
  ON public.class_subjects (class_id, subject_id);

-- Composite foreign keys prevent a row from joining a class or subject owned
-- by another school, even when a server-side write bypasses RLS.
ALTER TABLE public.class_subjects
  DROP CONSTRAINT IF EXISTS class_subjects_class_school_fkey;
ALTER TABLE public.class_subjects
  ADD CONSTRAINT class_subjects_class_school_fkey
  FOREIGN KEY (class_id, school_id)
  REFERENCES public.classes (id, school_id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.class_subjects
  VALIDATE CONSTRAINT class_subjects_class_school_fkey;

ALTER TABLE public.class_subjects
  DROP CONSTRAINT IF EXISTS class_subjects_subject_school_fkey;
ALTER TABLE public.class_subjects
  ADD CONSTRAINT class_subjects_subject_school_fkey
  FOREIGN KEY (subject_id, school_id)
  REFERENCES public.subjects (id, school_id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.class_subjects
  VALIDATE CONSTRAINT class_subjects_subject_school_fkey;

ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
-- Keep the existing tenant_scope_v2 and parent/student write-block policies.
NOTIFY pgrst, 'reload schema';
