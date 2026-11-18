-- Step 5: teacher registration metadata and school-scoped subject capabilities.
-- Additive and tenant-scoped. Preserve existing teacher IDs, staff IDs, accounts and relations.

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS teacher_code varchar(16);
ALTER TABLE public.teachers
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN phone SET DEFAULT NULL;

-- Keep existing codes; assign the next available T-code independently per school.
WITH numbered AS (
  SELECT t.id, t.school_id,
         row_number() OVER (PARTITION BY t.school_id ORDER BY t.created_at, t.id) AS rn
  FROM public.teachers t
  WHERE t.teacher_code IS NULL OR btrim(t.teacher_code) = ''
),
bases AS (
  SELECT school_id,
         COALESCE(MAX(substring(teacher_code FROM 2)::integer)
           FILTER (WHERE teacher_code ~ '^T[0-9]+$'), 0) AS last_code
  FROM public.teachers
  GROUP BY school_id
)
UPDATE public.teachers t
SET teacher_code = 'T' || lpad((bases.last_code + numbered.rn)::text, 3, '0')
FROM numbered
JOIN bases ON bases.school_id = numbered.school_id
WHERE t.id = numbered.id AND t.school_id = numbered.school_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_teacher_code
  ON public.teachers (school_id, teacher_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_phone_normalized
  ON public.teachers (
    school_id,
    NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '')
  )
  WHERE NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL;

-- Required for the composite same-school foreign key below.
CREATE UNIQUE INDEX IF NOT EXISTS teachers_id_school_id_uidx
  ON public.teachers (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS subjects_id_school_id_uidx
  ON public.subjects (id, school_id);

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id varchar(64) PRIMARY KEY DEFAULT ('ts-' || gen_random_uuid()::text),
  school_id varchar(64) NOT NULL,
  teacher_id varchar(64) NOT NULL,
  subject_id varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teacher_subjects_teacher_school_fk
    FOREIGN KEY (teacher_id, school_id)
    REFERENCES public.teachers (id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_subjects_subject_school_fk
    FOREIGN KEY (subject_id, school_id)
    REFERENCES public.subjects (id, school_id) ON DELETE CASCADE,
  CONSTRAINT teacher_subjects_teacher_subject_unique
    UNIQUE (teacher_id, subject_id)
);

ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_subjects_school_scope ON public.teacher_subjects;
CREATE POLICY teacher_subjects_school_scope ON public.teacher_subjects
  FOR ALL TO authenticated
  USING (
    private.auth_user_role()::text = 'super_admin'
    OR (
      private.auth_user_role()::text NOT IN ('parent', 'student')
      AND school_id = private.auth_school_id()::text
    )
  )
  WITH CHECK (
    private.auth_user_role()::text = 'super_admin'
    OR (
      private.auth_user_role()::text NOT IN ('parent', 'student')
      AND school_id = private.auth_school_id()::text
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school_teacher
  ON public.teacher_subjects (school_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school_subject
  ON public.teacher_subjects (school_id, subject_id);

CREATE OR REPLACE FUNCTION public.schoolos_assign_teacher_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_code integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('teacher-code:' || NEW.school_id::text, 0));
  SELECT COALESCE(MAX(substring(teacher_code FROM 2)::integer), 0) + 1
    INTO next_code
  FROM public.teachers
  WHERE school_id = NEW.school_id AND teacher_code ~ '^T[0-9]+$';
  NEW.teacher_code := 'T' || lpad(next_code::text, 3, '0');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_assign_teacher_code() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS teachers_assign_teacher_code ON public.teachers;
CREATE TRIGGER teachers_assign_teacher_code
  BEFORE INSERT ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.schoolos_assign_teacher_code();

CREATE OR REPLACE FUNCTION public.schoolos_sync_teacher_subjects(
  p_school_id text,
  p_teacher_id text,
  p_subject_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  saved_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teachers
    WHERE id = p_teacher_id AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'Macallinka lagama helin dugsigan';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_subject_ids, ARRAY[]::text[])) AS requested(subject_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = requested.subject_id AND s.school_id = p_school_id
    )
  ) THEN
    RAISE EXCEPTION 'Maaddooyinka la doortay waa inay ka tirsanaadaan dugsigan';
  END IF;

  DELETE FROM public.teacher_subjects
  WHERE school_id = p_school_id AND teacher_id = p_teacher_id;

  INSERT INTO public.teacher_subjects (school_id, teacher_id, subject_id)
  SELECT p_school_id, p_teacher_id, requested.subject_id
  FROM (
    SELECT DISTINCT unnest(COALESCE(p_subject_ids, ARRAY[]::text[])) AS subject_id
  ) requested;

  GET DIAGNOSTICS saved_count = ROW_COUNT;
  RETURN saved_count;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_sync_teacher_subjects(text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schoolos_sync_teacher_subjects(text, text, text[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
