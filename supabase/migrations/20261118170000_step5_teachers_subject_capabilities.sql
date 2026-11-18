-- Step 5: teacher registration metadata and school-scoped subject capabilities.
-- Preserve existing teacher IDs, staff IDs, user accounts and linked records.
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS teacher_code text;
ALTER TABLE public.teachers ALTER COLUMN phone DROP NOT NULL, ALTER COLUMN phone SET DEFAULT NULL;

WITH numbered AS (
  SELECT id, school_id,
    'T' || lpad(row_number() OVER (PARTITION BY school_id ORDER BY created_at, id)::text, 3, '0') AS code
  FROM public.teachers WHERE teacher_code IS NULL OR btrim(teacher_code) = ''
)
UPDATE public.teachers t SET teacher_code = numbered.code
FROM numbered WHERE numbered.id = t.id AND numbered.school_id = t.school_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_teacher_code ON public.teachers (school_id, teacher_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_phone_normalized
  ON public.teachers (school_id, regexp_replace(phone, '\\D', '', 'g'))
  WHERE nullif(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.schoolos_assign_teacher_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE next_code integer;
BEGIN
  IF NEW.teacher_code IS NOT NULL AND btrim(NEW.teacher_code) <> '' THEN
    RAISE EXCEPTION 'teacher_code is generated automatically and cannot be supplied';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('teacher-code:' || NEW.school_id::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(teacher_code, '^T', ''), '')::integer), 0) + 1
    INTO next_code FROM public.teachers
    WHERE school_id = NEW.school_id AND teacher_code ~ '^T[0-9]+$';
  NEW.teacher_code := 'T' || lpad(next_code::text, 3, '0');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS teachers_assign_teacher_code ON public.teachers;
CREATE TRIGGER teachers_assign_teacher_code BEFORE INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.schoolos_assign_teacher_code();

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_id_school ON public.teachers (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_id_school ON public.subjects (id, school_id);

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id text PRIMARY KEY DEFAULT ('ts-' || gen_random_uuid()::text),
  school_id text NOT NULL,
  teacher_id varchar NOT NULL,
  subject_id varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_subjects_teacher_school_fk FOREIGN KEY (teacher_id, school_id)
    REFERENCES public.teachers (id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_subjects_subject_school_fk FOREIGN KEY (subject_id, school_id)
    REFERENCES public.subjects (id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_subjects_teacher_subject_unique UNIQUE (teacher_id, subject_id)
);
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.teacher_subjects;
CREATE POLICY tenant_scope_v2 ON public.teacher_subjects FOR ALL
  USING (private.auth_user_role()::text = 'super_admin' OR school_id = private.auth_school_id()::text)
  WITH CHECK (private.auth_user_role()::text = 'super_admin' OR school_id = private.auth_school_id()::text);
DROP POLICY IF EXISTS teacher_subjects_parent_student_block ON public.teacher_subjects;
CREATE POLICY teacher_subjects_parent_student_block ON public.teacher_subjects FOR ALL
  USING (private.auth_user_role()::text NOT IN ('parent', 'student'))
  WITH CHECK (private.auth_user_role()::text NOT IN ('parent', 'student'));
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school_teacher ON public.teacher_subjects (school_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school_subject ON public.teacher_subjects (school_id, subject_id);

CREATE OR REPLACE FUNCTION public.schoolos_sync_teacher_subjects(p_school_id text, p_teacher_id text, p_subject_ids text[])
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE saved_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE id = p_teacher_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'Macallinka lagama helin dugsigan';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_subject_ids, ARRAY[]::text[])) AS requested(subject_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = requested.subject_id AND s.school_id = p_school_id)) THEN
    RAISE EXCEPTION 'Maaddooyinka la doortay waa inay ka tirsanaadaan dugsigan';
  END IF;
  DELETE FROM public.teacher_subjects WHERE school_id = p_school_id AND teacher_id = p_teacher_id;
  INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id)
  SELECT p_school_id, p_teacher_id, requested.subject_id
  FROM (SELECT DISTINCT unnest(COALESCE(p_subject_ids, ARRAY[]::text[])) AS subject_id) requested;
  GET DIAGNOSTICS saved_count = ROW_COUNT;
  RETURN saved_count;
END; $$;
REVOKE ALL ON FUNCTION public.schoolos_sync_teacher_subjects(text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schoolos_sync_teacher_subjects(text, text, text[]) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
