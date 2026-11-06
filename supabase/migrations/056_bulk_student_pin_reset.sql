-- Atomically reset many existing student PINs for one school.
-- Raw PIN values are hashed by the API and are never persisted or returned by this RPC.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_bulk_reset_student_pins(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id VARCHAR(64);
  v_changed_by VARCHAR(64);
  v_changed_by_name TEXT;
  v_changed_by_role public.user_role_enum;
  v_requested_count INTEGER;
  v_matched_count INTEGER;
  v_updated JSONB;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR NULLIF(p_payload->>'school_id', '') IS NULL
     OR NULLIF(p_payload->>'changed_by', '') IS NULL
     OR jsonb_typeof(p_payload->'students') <> 'array' THEN
    RAISE EXCEPTION 'Invalid bulk student PIN reset payload.';
  END IF;

  v_school_id := p_payload->>'school_id';
  v_changed_by := p_payload->>'changed_by';
  v_changed_by_name := COALESCE(NULLIF(p_payload->>'changed_by_name', ''), 'School Administrator');
  v_changed_by_role := COALESCE(NULLIF(p_payload->>'changed_by_role', ''), 'school_admin')::public.user_role_enum;
  v_requested_count := jsonb_array_length(p_payload->'students');

  IF v_requested_count < 1 OR v_requested_count > 500 THEN
    RAISE EXCEPTION 'Bulk PIN reset must contain between 1 and 500 students.';
  END IF;

  IF (
    SELECT COUNT(DISTINCT item.student_id)
      FROM jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
  ) <> v_requested_count THEN
    RAISE EXCEPTION 'Duplicate student IDs are not allowed in a bulk PIN reset.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
     WHERE NULLIF(btrim(item.student_id), '') IS NULL
        OR NULLIF(item.pin_hash, '') IS NULL
        OR length(item.pin_hash) > 512
  ) THEN
    RAISE EXCEPTION 'Every student must have a valid ID and hashed PIN.';
  END IF;

  SELECT COUNT(*) INTO v_matched_count
    FROM public.students AS s
    JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
      ON item.student_id = s.student_id
   WHERE s.school_id = v_school_id
   FOR UPDATE OF s;

  IF v_matched_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more students were not found in this school. No PINs were changed.';
  END IF;

  UPDATE public.students AS s
     SET pin_hash = item.pin_hash
    FROM jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
   WHERE s.school_id = v_school_id
     AND s.student_id = item.student_id;

  -- Update student login accounts only. Parent accounts are deliberately unchanged
  -- because one parent account may be linked to multiple siblings with different PINs.
  UPDATE public.users AS u
     SET pin_hash = item.pin_hash,
         failed_login_attempts = 0,
         locked_until = NULL
    FROM public.students AS s
    JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
      ON item.student_id = s.student_id
   WHERE s.school_id = v_school_id
     AND u.school_id = v_school_id
     AND u.role = 'student'::public.user_role_enum
     AND (u.student_id = s.student_id OR u.id = 'usr-student-' || s.id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'student_id', s.student_id,
    'first_name', s.first_name,
    'middle_name', s.middle_name,
    'last_name', s.last_name
  ) ORDER BY s.student_id), '[]'::JSONB)
    INTO v_updated
    FROM public.students AS s
    JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
      ON item.student_id = s.student_id
   WHERE s.school_id = v_school_id;

  INSERT INTO public.audit_logs (
    id, action, category, school_id, school_name, user_id, user_name,
    user_role, details, severity
  )
  SELECT 'audit-' || gen_random_uuid()::text,
         'STUDENT_BULK_PIN_RESET',
         'security',
         v_school_id,
         school.name,
         v_changed_by,
         v_changed_by_name,
         v_changed_by_role,
         'Bulk reset of ' || v_requested_count || ' student PINs. Parent account PINs were unchanged.',
         'warning'
    FROM public.schools AS school
   WHERE school.id = v_school_id;

  RETURN jsonb_build_object('updated_count', v_requested_count, 'students', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_bulk_reset_student_pins(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_bulk_reset_student_pins(JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
