-- Parent portal: authoritative parent-to-student links.
-- Existing users remain the parent identity; no duplicate parent profile table is introduced.
BEGIN;

CREATE TABLE IF NOT EXISTS public.parent_students (
  id text PRIMARY KEY DEFAULT ('pls-' || gen_random_uuid()::text),
  school_id varchar(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_id varchar(64) NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id varchar(64) NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  relation varchar(40) NOT NULL DEFAULT 'guardian',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parent_students_parent_student_unique UNIQUE (parent_id, student_id),
  CONSTRAINT parent_students_school_parent_fk FOREIGN KEY (parent_id, school_id)
    REFERENCES public.users(id, school_id) ON DELETE CASCADE,
  CONSTRAINT parent_students_school_student_fk FOREIGN KEY (student_id, school_id)
    REFERENCES public.students(id, school_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS parent_students_parent_school_idx
  ON public.parent_students (parent_id, school_id, student_id);
CREATE INDEX IF NOT EXISTS parent_students_student_school_idx
  ON public.parent_students (student_id, school_id, parent_id);

-- Backfill the already-admin-managed links without changing existing account data.
INSERT INTO public.parent_students (school_id, parent_id, student_id, relation)
SELECT u.school_id, u.id, s.id, 'guardian'
FROM public.users AS u
CROSS JOIN LATERAL unnest(COALESCE(u.linked_student_ids, ARRAY[]::text[])) AS linked(student_id)
JOIN public.students AS s
  ON s.id = linked.student_id AND s.school_id = u.school_id
WHERE u.role = 'parent'::public.user_role_enum
  AND u.school_id IS NOT NULL
ON CONFLICT (parent_id, student_id) DO NOTHING;

-- Keep the canonical relation synchronized with the legacy admin-managed array.
-- Removing a link revokes portal access immediately; messages are intentionally retained.
CREATE OR REPLACE FUNCTION public.schoolos_sync_parent_student_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.role = 'parent'::public.user_role_enum AND NEW.school_id IS NOT NULL THEN
    DELETE FROM public.parent_students
    WHERE parent_id = NEW.id
      AND school_id = NEW.school_id
      AND NOT (student_id = ANY(COALESCE(NEW.linked_student_ids, ARRAY[]::text[])));

    INSERT INTO public.parent_students (school_id, parent_id, student_id, relation)
    SELECT NEW.school_id, NEW.id, s.id, 'guardian'
    FROM public.students AS s
    WHERE s.school_id = NEW.school_id
      AND s.id = ANY(COALESCE(NEW.linked_student_ids, ARRAY[]::text[]))
    ON CONFLICT (parent_id, student_id) DO NOTHING;
  ELSE
    DELETE FROM public.parent_students WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS users_sync_parent_student_links ON public.users;
CREATE TRIGGER users_sync_parent_student_links
AFTER INSERT OR UPDATE OF role, school_id, linked_student_ids ON public.users
FOR EACH ROW EXECUTE FUNCTION public.schoolos_sync_parent_student_links();

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_students_service_role_only ON public.parent_students;
CREATE POLICY parent_students_service_role_only ON public.parent_students
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.parent_students FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.parent_students TO service_role;
REVOKE ALL ON FUNCTION public.schoolos_sync_parent_student_links() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_sync_parent_student_links() TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
