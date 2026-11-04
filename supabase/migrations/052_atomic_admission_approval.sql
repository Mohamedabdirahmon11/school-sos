-- Atomically approve an admission and create the student + login accounts.
-- The row locks serialize duplicate approvals and class-capacity checks.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_approve_admission(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_application public.admission_applications%ROWTYPE;
  v_class public.classes%ROWTYPE;
  v_school_id VARCHAR(64);
  v_student_id VARCHAR(64);
  v_student_code VARCHAR(50);
  v_student_user_id VARCHAR(64);
  v_pin_hash TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_parent_phone TEXT;
  v_normalized_phone TEXT;
  v_parent public.users%ROWTYPE;
  v_user_id VARCHAR(64);
  v_user_name TEXT;
  v_user_role public.user_role_enum;
  v_enrolled_count INTEGER;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR NULLIF(p_payload->>'application_id', '') IS NULL
     OR NULLIF(p_payload->>'school_id', '') IS NULL
     OR NULLIF(p_payload->>'student_id', '') IS NULL
     OR NULLIF(p_payload->>'student_record_id', '') IS NULL
     OR NULLIF(p_payload->>'student_user_id', '') IS NULL
     OR NULLIF(p_payload->>'pin_hash', '') IS NULL
     OR NULLIF(p_payload->>'approved_by', '') IS NULL THEN
    RAISE EXCEPTION 'Invalid admission approval payload.';
  END IF;

  v_school_id := p_payload->>'school_id';
  v_student_id := p_payload->>'student_id';
  v_student_user_id := p_payload->>'student_user_id';
  v_pin_hash := p_payload->>'pin_hash';
  v_user_id := p_payload->>'approved_by';
  v_user_name := COALESCE(NULLIF(p_payload->>'approved_by_name', ''), 'School Administrator');
  v_user_role := COALESCE(NULLIF(p_payload->>'approved_by_role', ''), 'school_admin')::public.user_role_enum;

  SELECT * INTO v_application
    FROM public.admission_applications
   WHERE id = p_payload->>'application_id'
     AND school_id = v_school_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admission application not found.';
  END IF;
  IF v_application.status <> 'pending' THEN
    RAISE EXCEPTION 'Admission application has already been processed.';
  END IF;

  SELECT * INTO v_class
    FROM public.classes
   WHERE id = v_application.class_id
     AND school_id = v_school_id
     AND is_archived = FALSE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected class is unavailable or belongs to another school.';
  END IF;

  SELECT count(*) INTO v_enrolled_count
    FROM public.students
   WHERE school_id = v_school_id
     AND class_id = v_class.id
     AND status = 'active';

  IF v_enrolled_count >= v_class.capacity THEN
    RAISE EXCEPTION 'The selected class has reached capacity.';
  END IF;

  v_full_name := concat_ws(' ', v_application.first_name,
    NULLIF(v_application.middle_name, ''), v_application.last_name);

  INSERT INTO public.students (
    id, school_id, branch_id, student_id, first_name, middle_name, last_name,
    gender, admission_date, father_phone, mother_phone, class_id, section,
    status, pin_hash
  ) VALUES (
    p_payload->>'student_record_id', v_school_id, v_class.branch_id, v_student_id,
    v_application.first_name, COALESCE(v_application.middle_name, ''),
    v_application.last_name, v_application.gender, CURRENT_DATE,
    v_application.father_phone, NULLIF(v_application.mother_phone, ''),
    v_class.id, COALESCE(v_class.section, 'A'), 'active', v_pin_hash
  );

  INSERT INTO public.users (
    id, school_id, role, full_name, phone, student_id, password_hash,
    pin_hash, is_blocked, failed_login_attempts
  ) VALUES (
    v_student_user_id, v_school_id, 'student'::public.user_role_enum,
    v_full_name, COALESCE(NULLIF(v_application.father_phone, ''), NULLIF(v_application.mother_phone, '')),
    v_student_id, '', v_pin_hash, FALSE, 0
  );

  FOREACH v_parent_phone IN ARRAY ARRAY[
    NULLIF(btrim(v_application.father_phone), ''),
    NULLIF(btrim(v_application.mother_phone), '')
  ] LOOP
    IF v_parent_phone IS NULL THEN
      CONTINUE;
    END IF;
    v_normalized_phone := regexp_replace(v_parent_phone, '[[:space:]()\-]', '', 'g');

    SELECT * INTO v_parent
      FROM public.users
     WHERE school_id = v_school_id
       AND role = 'parent'::public.user_role_enum
       AND (
         regexp_replace(COALESCE(phone, ''), '[[:space:]()\-]', '', 'g') = v_normalized_phone
         OR regexp_replace(COALESCE(parent_phone, ''), '[[:space:]()\-]', '', 'g') = v_normalized_phone
       )
     ORDER BY created_at
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      UPDATE public.users
         SET linked_student_ids = CASE
           WHEN COALESCE(linked_student_ids, ARRAY[]::TEXT[]) @> ARRAY[p_payload->>'student_record_id']
             THEN COALESCE(linked_student_ids, ARRAY[]::TEXT[])
           ELSE array_append(COALESCE(linked_student_ids, ARRAY[]::TEXT[]), p_payload->>'student_record_id')
         END,
         phone = COALESCE(phone, v_parent_phone),
         parent_phone = COALESCE(parent_phone, v_parent_phone)
       WHERE id = v_parent.id;
    ELSE
      INSERT INTO public.users (
        id, school_id, role, full_name, phone, parent_phone, password_hash,
        pin_hash, linked_student_ids, is_blocked, failed_login_attempts
      ) VALUES (
        'usr-parent-' || gen_random_uuid()::text, v_school_id,
        'parent'::public.user_role_enum, 'Parent of ' || v_application.first_name,
        v_parent_phone, v_parent_phone, '', v_pin_hash,
        ARRAY[p_payload->>'student_record_id'], FALSE, 0
      );
    END IF;
  END LOOP;

  UPDATE public.admission_applications
     SET status = 'approved', student_id = v_student_id
   WHERE id = v_application.id AND school_id = v_school_id;

  INSERT INTO public.audit_logs (
    id, action, category, school_id, school_name, user_id, user_name,
    user_role, details, severity
  )
  SELECT 'audit-' || gen_random_uuid()::text, 'ADMISSION_APPLICATION_APPROVED',
    'school', v_school_id, s.name, v_user_id, v_user_name, v_user_role,
    'Admission application ' || v_application.id || ' was approved and enrolled as ' || v_student_id || '.',
    'info'
  FROM public.schools s WHERE s.id = v_school_id;

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'student_id', v_student_id,
    'student_record_id', p_payload->>'student_record_id',
    'status', 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_approve_admission(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_approve_admission(JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
