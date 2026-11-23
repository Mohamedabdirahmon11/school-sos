-- Bulk student PIN resets also force the student to rotate the temporary PIN
-- and invalidate all active student sessions. Parent credentials are untouched.
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

  PERFORM s.id
    FROM public.students AS s
    JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
      ON item.student_id = s.student_id
   WHERE s.school_id = v_school_id
   FOR UPDATE OF s;

  SELECT COUNT(*) INTO v_matched_count
    FROM public.students AS s
    JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
      ON item.student_id = s.student_id
   WHERE s.school_id = v_school_id;

  IF v_matched_count <> v_requested_count THEN
    RAISE EXCEPTION 'One or more students were not found in this school. No PINs were changed.';
  END IF;

  UPDATE public.students AS s
     SET pin_hash = item.pin_hash
    FROM jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
   WHERE s.school_id = v_school_id
     AND s.student_id = item.student_id;

  -- Admin-triggered bulk reset is also the explicit backfill path for legacy
  -- students without a portal user. It creates only the selected accounts and
  -- returns one-time PIN slips from the API; it never auto-provisions at migration time.
  INSERT INTO public.users (
    id, school_id, branch_id, role, full_name, phone, student_id,
    password_hash, pin_hash, is_blocked, failed_login_attempts, must_change_password
  )
  SELECT
    'usr-student-' || s.id,
    s.school_id,
    s.branch_id,
    'student'::public.user_role_enum,
    btrim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)),
    COALESCE(NULLIF(btrim(s.student_phone), ''), s.father_phone),
    s.student_id,
    '',
    item.pin_hash,
    false,
    0,
    true
  FROM public.students AS s
  JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
    ON item.student_id = s.student_id
  WHERE s.school_id = v_school_id
    AND NOT EXISTS (
      SELECT 1 FROM public.users AS existing
       WHERE existing.school_id = s.school_id
         AND existing.role = 'student'::public.user_role_enum
         AND existing.student_id = s.student_id
    )
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.users AS u
     SET pin_hash = item.pin_hash,
         must_change_password = true,
         failed_login_attempts = 0,
         locked_until = NULL
    FROM public.students AS s
    JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
      ON item.student_id = s.student_id
   WHERE s.school_id = v_school_id
     AND u.school_id = v_school_id
     AND u.role = 'student'::public.user_role_enum
     AND (u.student_id = s.student_id OR u.id = 'usr-student-' || s.id);

  DELETE FROM public.user_sessions AS session
   WHERE session.user_id IN (
     SELECT u.id
       FROM public.users AS u
       JOIN public.students AS s
         ON s.school_id = u.school_id
        AND (u.student_id = s.student_id OR u.id = 'usr-student-' || s.id)
       JOIN jsonb_to_recordset(p_payload->'students') AS item(student_id TEXT, pin_hash TEXT)
         ON item.student_id = s.student_id
      WHERE u.school_id = v_school_id
        AND u.role = 'student'::public.user_role_enum
   );

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
         'Bulk reset of ' || v_requested_count || ' student PINs; next login requires PIN rotation. Parent account PINs were unchanged.',
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
