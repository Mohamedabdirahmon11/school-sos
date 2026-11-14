-- Serialize per-school student ID allocation across single and bulk registration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.school_student_id_sequences (
  school_id VARCHAR(64) PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_student_id_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.school_student_id_sequences FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.schoolos_reserve_student_ids(p_school_id TEXT, p_count INTEGER)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last BIGINT;
  v_start BIGINT;
  v_ids TEXT[];
BEGIN
  IF NULLIF(btrim(p_school_id), '') IS NULL OR p_count IS NULL OR p_count < 1 OR p_count > 2000 THEN
    RAISE EXCEPTION 'Student ID reservation request is invalid.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
    RAISE EXCEPTION 'School was not found.';
  END IF;

  INSERT INTO public.school_student_id_sequences (school_id, last_number)
  SELECT p_school_id,
         COALESCE(MAX(substring(student_id FROM 2)::BIGINT), 0)
    FROM public.students
   WHERE school_id = p_school_id AND student_id ~ '^S[0-9]+$'
  ON CONFLICT (school_id) DO NOTHING;

  UPDATE public.school_student_id_sequences
     SET last_number = last_number + p_count,
         updated_at = now()
   WHERE school_id = p_school_id
   RETURNING last_number INTO v_last;

  v_start := v_last - p_count + 1;
  SELECT array_agg('S' || lpad(n::TEXT, GREATEST(3, length(n::TEXT)), '0') ORDER BY n)
    INTO v_ids
    FROM generate_series(v_start, v_last) AS n;
  RETURN v_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_reserve_student_ids(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_reserve_student_ids(TEXT, INTEGER) TO service_role;

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
  v_linked_ids TEXT[];
  v_parent_id VARCHAR(64);
  v_student JSONB;
  v_class public.classes%ROWTYPE;
  v_enrolled INTEGER;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Invalid student registration payload.'; END IF;
  v_school_id := NULLIF(btrim(p_payload->>'school_id'), '');
  v_guardian_phone := NULLIF(btrim(p_payload->>'guardian_phone'), '');
  v_guardian_name := NULLIF(btrim(p_payload->>'guardian_name'), '');
  v_pin_hash := NULLIF(p_payload->>'pin_hash', '');
  IF v_school_id IS NULL OR v_guardian_phone IS NULL OR v_guardian_name IS NULL OR v_pin_hash IS NULL THEN
    RAISE EXCEPTION 'School, guardian name, guardian phone and PIN hash are required.';
  END IF;
  IF length(v_guardian_name) > 160 OR length(v_guardian_phone) > 30 THEN RAISE EXCEPTION 'Guardian details exceed the allowed length.'; END IF;

  SELECT * INTO v_class
    FROM public.classes
   WHERE id = p_payload->>'class_id'
     AND school_id = v_school_id
     AND is_archived = false
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Class is unavailable or does not belong to this school.'; END IF;
  SELECT count(*)::INTEGER INTO v_enrolled
    FROM public.students
   WHERE school_id = v_school_id AND class_id = v_class.id AND status = 'active';
  IF v_enrolled >= v_class.capacity THEN RAISE EXCEPTION 'The selected class has reached capacity.'; END IF;

  v_student_id := (public.schoolos_reserve_student_ids(v_school_id, 1))[1];
  v_student_pk := 'std-' || pg_catalog.gen_random_uuid()::TEXT;
  v_normalized_phone := regexp_replace(v_guardian_phone, '[^0-9]', '', 'g');
  IF v_normalized_phone = '' THEN RAISE EXCEPTION 'Guardian phone number is invalid.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_school_id || ':' || v_normalized_phone, 1));

  INSERT INTO public.students (
    id, school_id, branch_id, student_id, first_name, middle_name, last_name,
    gender, admission_date, student_phone, father_phone, father_name,
    class_id, section, status, pin_hash, address
  ) VALUES (
    v_student_pk, v_school_id, v_class.branch_id,
    v_student_id, btrim(p_payload->>'first_name'), btrim(p_payload->>'middle_name'),
    btrim(p_payload->>'last_name'), p_payload->>'gender',
    COALESCE(NULLIF(p_payload->>'admission_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(p_payload->>'student_phone'), ''), v_guardian_phone, v_guardian_name,
    v_class.id, COALESCE(NULLIF(btrim(v_class.section), ''), 'A'),
    'active', v_pin_hash, COALESCE(p_payload->>'address', '')
  );

  INSERT INTO public.users (
    id, school_id, branch_id, role, full_name, phone, student_id,
    password_hash, pin_hash, is_blocked, failed_login_attempts
  ) VALUES (
    'usr-student-' || v_student_pk, v_school_id, v_class.branch_id,
    'student'::public.user_role_enum,
    btrim(concat_ws(' ', p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name')),
    COALESCE(NULLIF(btrim(p_payload->>'student_phone'), ''), v_guardian_phone),
    v_student_id, '', v_pin_hash, false, 0
  );

  SELECT u.id, COALESCE(u.linked_student_ids, ARRAY[]::TEXT[])
    INTO v_parent_id, v_linked_ids
    FROM public.users AS u
   WHERE u.school_id = v_school_id AND u.role = 'parent'::public.user_role_enum
     AND regexp_replace(COALESCE(NULLIF(u.phone, ''), u.parent_phone, ''), '[^0-9]', '', 'g') = v_normalized_phone
   ORDER BY u.created_at, u.id LIMIT 1 FOR UPDATE;

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
       SET linked_student_ids = CASE WHEN v_student_pk = ANY(COALESCE(v_linked_ids, ARRAY[]::TEXT[]))
             THEN COALESCE(v_linked_ids, ARRAY[]::TEXT[])
             ELSE array_append(COALESCE(v_linked_ids, ARRAY[]::TEXT[]), v_student_pk) END,
           full_name = CASE WHEN full_name IS NULL OR btrim(full_name) = '' OR full_name LIKE 'Parent of %'
             THEN v_guardian_name ELSE full_name END,
           phone = COALESCE(NULLIF(phone, ''), v_guardian_phone),
           parent_phone = COALESCE(NULLIF(parent_phone, ''), v_guardian_phone)
     WHERE id = v_parent_id;
  END IF;

  INSERT INTO public.audit_logs (
    id, action, category, school_id, school_name, user_id, user_name, user_role, details, severity
  ) VALUES (
    'log-' || pg_catalog.gen_random_uuid()::TEXT, 'STUDENT_REGISTERED', 'school',
    v_school_id, COALESCE(p_payload->>'school_name', ''), p_payload->>'created_by',
    COALESCE(p_payload->>'created_by_name', ''), COALESCE(p_payload->>'created_by_role', 'school_admin')::public.user_role_enum,
    'Registered student ' || v_student_id || ' and linked parent/guardian account.', 'info'
  );

  SELECT to_jsonb(s) INTO v_student FROM public.students AS s
   WHERE s.id = v_student_pk AND s.school_id = v_school_id;
  RETURN jsonb_build_object('student', v_student, 'student_id', v_student_id);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_create_student(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_create_student(JSONB) TO service_role;
CREATE OR REPLACE FUNCTION public.schoolos_sync_student_guardian(
  p_school_id TEXT,
  p_student_pk TEXT,
  p_old_phone TEXT,
  p_new_phone TEXT,
  p_guardian_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_student RECORD;
  v_old_phone TEXT;
  v_new_phone TEXT;
  v_parent_id VARCHAR(64);
  v_linked_ids TEXT[];
  v_name TEXT;
BEGIN
  SELECT id, school_id, first_name, branch_id, pin_hash
    INTO v_student
    FROM public.students
   WHERE id = p_student_pk AND school_id = p_school_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student was not found in this school.'; END IF;

  v_old_phone := regexp_replace(COALESCE(p_old_phone, ''), '[^0-9]', '', 'g');
  v_new_phone := regexp_replace(COALESCE(p_new_phone, ''), '[^0-9]', '', 'g');
  IF v_new_phone = '' THEN RAISE EXCEPTION 'Parent / guardian phone number is invalid.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_school_id || ':' || v_new_phone, 1));

  IF v_old_phone <> '' AND v_old_phone <> v_new_phone THEN
    UPDATE public.users
       SET linked_student_ids = array_remove(COALESCE(linked_student_ids, ARRAY[]::TEXT[]), p_student_pk)
     WHERE school_id = p_school_id
       AND role = 'parent'::public.user_role_enum
       AND (
         regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_old_phone
         OR regexp_replace(COALESCE(parent_phone, ''), '[^0-9]', '', 'g') = v_old_phone
       );
  END IF;

  SELECT id, COALESCE(linked_student_ids, ARRAY[]::TEXT[])
    INTO v_parent_id, v_linked_ids
    FROM public.users
   WHERE school_id = p_school_id
     AND role = 'parent'::public.user_role_enum
     AND (
       regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = v_new_phone
       OR regexp_replace(COALESCE(parent_phone, ''), '[^0-9]', '', 'g') = v_new_phone
     )
   ORDER BY created_at, id
   LIMIT 1
   FOR UPDATE;

  v_name := COALESCE(NULLIF(btrim(p_guardian_name), ''), 'Parent of ' || v_student.first_name);
  IF v_parent_id IS NULL THEN
    INSERT INTO public.users (
      id, school_id, branch_id, role, full_name, phone, parent_phone,
      password_hash, pin_hash, linked_student_ids, is_blocked, failed_login_attempts
    ) VALUES (
      'usr-parent-' || pg_catalog.gen_random_uuid()::TEXT,
      p_school_id, v_student.branch_id, 'parent'::public.user_role_enum,
      v_name, p_new_phone, p_new_phone, '', v_student.pin_hash,
      ARRAY[p_student_pk], false, 0
    );
  ELSE
    UPDATE public.users
       SET linked_student_ids = CASE
             WHEN p_student_pk = ANY(v_linked_ids) THEN v_linked_ids
             ELSE array_append(v_linked_ids, p_student_pk) END,
           full_name = CASE
             WHEN full_name IS NULL OR btrim(full_name) = '' OR full_name LIKE 'Parent of %'
             THEN v_name ELSE full_name END,
           phone = COALESCE(NULLIF(phone, ''), p_new_phone),
           parent_phone = COALESCE(NULLIF(parent_phone, ''), p_new_phone)
     WHERE id = v_parent_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_sync_student_guardian(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_sync_student_guardian(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;


CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_phone_normalized_school
  ON public.users (
    school_id,
    regexp_replace(COALESCE(NULLIF(phone, ''), parent_phone, ''), '[^0-9]', '', 'g')
  )
  WHERE role = 'parent'::public.user_role_enum
    AND regexp_replace(COALESCE(NULLIF(phone, ''), parent_phone, ''), '[^0-9]', '', 'g') <> '';

NOTIFY pgrst, 'reload schema';
COMMIT;
