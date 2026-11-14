-- Student Management: durable student profile fields and atomic student/guardian registration.
-- This migration is additive; it does not rewrite existing student or parent data.
BEGIN;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS father_name VARCHAR(160) NOT NULL DEFAULT '';

-- Preserve existing real parent names when they are already available in parent accounts.
UPDATE public.students AS s
   SET father_name = u.full_name
  FROM public.users AS u
 WHERE u.school_id = s.school_id
   AND u.role = 'parent'::public.user_role_enum
   AND NULLIF(btrim(u.full_name), '') IS NOT NULL
   AND u.full_name !~* '^Parent of '
   AND regexp_replace(COALESCE(NULLIF(u.phone, ''), u.parent_phone, ''), '[^0-9]', '', 'g')
       = regexp_replace(COALESCE(s.father_phone, ''), '[^0-9]', '', 'g')
   AND btrim(s.father_name) = '';

CREATE OR REPLACE FUNCTION public.schoolos_create_student(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_school_id VARCHAR(64);
  v_student_id VARCHAR(40);
  v_student_pk VARCHAR(64);
  v_guardian_phone TEXT;
  v_guardian_name TEXT;
  v_normalized_phone TEXT;
  v_pin_hash TEXT;
  v_next_number BIGINT;
  v_linked_ids TEXT[];
  v_parent_id VARCHAR(64);
  v_student JSONB;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid student registration payload.';
  END IF;

  v_school_id := NULLIF(btrim(p_payload->>'school_id'), '');
  v_guardian_phone := NULLIF(btrim(p_payload->>'guardian_phone'), '');
  v_guardian_name := NULLIF(btrim(p_payload->>'guardian_name'), '');
  v_pin_hash := NULLIF(p_payload->>'pin_hash', '');

  IF v_school_id IS NULL OR v_guardian_phone IS NULL OR v_guardian_name IS NULL OR v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'School, guardian name, guardian phone and PIN hash are required.';
  END IF;
  IF length(v_guardian_name) > 160 OR length(v_guardian_phone) > 30 THEN
    RAISE EXCEPTION 'Guardian details exceed the allowed length.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_school_id, 0));

  SELECT COALESCE(MAX(substring(s.student_id FROM 2)::BIGINT), 0) + 1
    INTO v_next_number
    FROM public.students AS s
   WHERE s.school_id = v_school_id
     AND s.student_id ~ '^S[0-9]+$';

  v_student_id := 'S' || lpad(v_next_number::TEXT, GREATEST(3, length(v_next_number::TEXT)), '0');
  v_student_pk := 'std-' || pg_catalog.gen_random_uuid()::TEXT;
  v_normalized_phone := pg_catalog.regexp_replace(v_guardian_phone, '[^0-9]', '', 'g');

  IF v_normalized_phone = '' THEN
    RAISE EXCEPTION 'Guardian phone number is invalid.';
  END IF;

  INSERT INTO public.students (
    id, school_id, branch_id, student_id, first_name, middle_name, last_name,
    gender, admission_date, student_phone, father_phone, father_name,
    class_id, section, status, pin_hash, address
  ) VALUES (
    v_student_pk, v_school_id, NULLIF(p_payload->>'branch_id', ''),
    v_student_id, btrim(p_payload->>'first_name'), btrim(p_payload->>'middle_name'),
    btrim(p_payload->>'last_name'), p_payload->>'gender',
    COALESCE(NULLIF(p_payload->>'admission_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(p_payload->>'student_phone'), ''), v_guardian_phone, v_guardian_name,
    p_payload->>'class_id', COALESCE(NULLIF(btrim(p_payload->>'section'), ''), 'A'),
    'active', v_pin_hash, COALESCE(p_payload->>'address', '')
  );

  INSERT INTO public.users (
    id, school_id, branch_id, role, full_name, phone, student_id,
    password_hash, pin_hash, is_blocked, failed_login_attempts
  ) VALUES (
    'usr-student-' || v_student_pk, v_school_id, NULLIF(p_payload->>'branch_id', ''),
    'student'::public.user_role_enum,
    btrim(concat_ws(' ', p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name')),
    COALESCE(NULLIF(btrim(p_payload->>'student_phone'), ''), v_guardian_phone),
    v_student_id, '', v_pin_hash, false, 0
  );

  SELECT u.id, COALESCE(u.linked_student_ids, ARRAY[]::TEXT[])
    INTO v_parent_id, v_linked_ids
    FROM public.users AS u
   WHERE u.school_id = v_school_id
     AND u.role = 'parent'::public.user_role_enum
     AND pg_catalog.regexp_replace(COALESCE(NULLIF(u.phone, ''), u.parent_phone, ''), '[^0-9]', '', 'g') = v_normalized_phone
   ORDER BY u.created_at, u.id
   LIMIT 1
   FOR UPDATE;

  IF v_parent_id IS NULL THEN
    v_parent_id := 'usr-parent-' || pg_catalog.gen_random_uuid()::TEXT;
    INSERT INTO public.users (
      id, school_id, role, full_name, phone, parent_phone, password_hash,
      pin_hash, linked_student_ids, is_blocked, failed_login_attempts
    ) VALUES (
      v_parent_id, v_school_id, 'parent'::public.user_role_enum,
      v_guardian_name, v_guardian_phone, v_guardian_phone, '',
      v_pin_hash, ARRAY[v_student_pk], false, 0
    );
  ELSE
    UPDATE public.users
       SET linked_student_ids = CASE
             WHEN v_student_pk = ANY(COALESCE(v_linked_ids, ARRAY[]::TEXT[])) THEN COALESCE(v_linked_ids, ARRAY[]::TEXT[])
             ELSE array_append(COALESCE(v_linked_ids, ARRAY[]::TEXT[]), v_student_pk)
           END,
           full_name = CASE
             WHEN full_name IS NULL OR btrim(full_name) = '' OR full_name LIKE 'Parent of %'
             THEN v_guardian_name ELSE full_name END,
           phone = COALESCE(NULLIF(phone, ''), v_guardian_phone),
           parent_phone = COALESCE(NULLIF(parent_phone, ''), v_guardian_phone)
     WHERE id = v_parent_id;
  END IF;

  SELECT pg_catalog.to_jsonb(s) INTO v_student
    FROM public.students AS s
   WHERE s.id = v_student_pk AND s.school_id = v_school_id;

  RETURN jsonb_build_object('student', v_student, 'student_id', v_student_id);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_create_student(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_create_student(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
