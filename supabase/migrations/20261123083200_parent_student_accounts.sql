-- Parent/student portal identity links and first-login PIN enforcement.
-- Additive and rerunnable: existing users, student rows and credentials are preserved.
BEGIN;
-- The existing lockout_counters table is the durable store for per-identifier
-- and per-IP attempts. Keep exponential backoff across server restarts.
ALTER TABLE public.lockout_counters
  ADD COLUMN IF NOT EXISTS lockout_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.lockout_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lockout_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lockout_counters TO service_role;
DROP POLICY IF EXISTS lockout_counters_service_role_all ON public.lockout_counters;
CREATE POLICY lockout_counters_service_role_all ON public.lockout_counters
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- The canonical parent_students table is created by the preceding
-- 20261123010000_parent_portal_relationships migration. Keep that schema
-- (text IDs, revoked_at soft revocation and composite same-school FKs).

CREATE INDEX IF NOT EXISTS idx_parent_students_school_parent
  ON public.parent_students (school_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_school_student
  ON public.parent_students (school_id, student_id);

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.parent_students FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.parent_students TO service_role;

DROP POLICY IF EXISTS parent_students_service_role_all ON public.parent_students;
CREATE POLICY parent_students_service_role_all
  ON public.parent_students
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Existing linked_student_ids are the canonical relationship source in the
-- current application. Backfill only explicit links; do not infer links from
-- matching phone numbers and do not create or reset any account credentials.
INSERT INTO public.parent_students (parent_id, student_id, school_id, relation)
SELECT u.id, s.id, u.school_id, 'guardian'
  FROM public.users AS u
  CROSS JOIN LATERAL unnest(COALESCE(u.linked_student_ids, ARRAY[]::TEXT[])) AS linked(student_pk)
  JOIN public.students AS s
    ON s.id = linked.student_pk
   AND s.school_id = u.school_id
 WHERE u.role = 'parent'::public.user_role_enum
   AND u.school_id IS NOT NULL
ON CONFLICT (parent_id, student_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.schoolos_enforce_parent_phone_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  IF NEW.role = 'parent'::public.user_role_enum AND NEW.school_id IS NOT NULL THEN
    v_phone := regexp_replace(COALESCE(NULLIF(btrim(NEW.phone), ''), NULLIF(btrim(NEW.parent_phone), ''), ''), '[^0-9]', '', 'g');
    IF v_phone <> '' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.school_id || ':' || v_phone, 0));
      IF EXISTS (
        SELECT 1
          FROM public.users AS existing
         WHERE existing.school_id = NEW.school_id
           AND existing.role = 'parent'::public.user_role_enum
           AND existing.id <> NEW.id
           AND regexp_replace(
                 COALESCE(NULLIF(btrim(existing.phone), ''), NULLIF(btrim(existing.parent_phone), ''), ''),
                 '[^0-9]', '', 'g'
               ) = v_phone
      ) THEN
        RAISE EXCEPTION 'A parent account already exists for this phone number in this school.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schoolos_parent_phone_unique ON public.users;
CREATE TRIGGER trg_schoolos_parent_phone_unique
BEFORE INSERT OR UPDATE OF phone, parent_phone, school_id, role
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.schoolos_enforce_parent_phone_unique();

CREATE OR REPLACE FUNCTION public.schoolos_validate_parent_student_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_parent_school VARCHAR(64);
  v_parent_role public.user_role_enum;
  v_student_school VARCHAR(64);
BEGIN
  SELECT school_id, role INTO v_parent_school, v_parent_role
    FROM public.users WHERE id = NEW.parent_id;
  SELECT school_id INTO v_student_school
    FROM public.students WHERE id = NEW.student_id;
  IF v_parent_role IS DISTINCT FROM 'parent'::public.user_role_enum
     OR v_parent_school IS DISTINCT FROM NEW.school_id
     OR v_student_school IS DISTINCT FROM NEW.school_id THEN
    RAISE EXCEPTION 'Parent and student relationship must stay within one school and use a parent account.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schoolos_validate_parent_student_link ON public.parent_students;
CREATE TRIGGER trg_schoolos_validate_parent_student_link
BEFORE INSERT OR UPDATE ON public.parent_students
FOR EACH ROW
EXECUTE FUNCTION public.schoolos_validate_parent_student_link();

-- Keep the soft-revocation sync trigger installed by migration 0100.

-- Newly provisioned student/parent identities must rotate their temporary PIN.
-- Existing rows are intentionally untouched; the migration does not lock out
-- current families or silently generate credentials for legacy students.
CREATE OR REPLACE FUNCTION public.schoolos_require_portal_pin_rotation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role IN ('student'::public.user_role_enum, 'parent'::public.user_role_enum) THEN
    NEW.must_change_password := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schoolos_require_portal_pin_rotation ON public.users;
CREATE TRIGGER trg_schoolos_require_portal_pin_rotation
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.schoolos_require_portal_pin_rotation();

NOTIFY pgrst, 'reload schema';
COMMIT;
