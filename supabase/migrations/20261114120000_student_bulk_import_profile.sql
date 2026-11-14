-- Keep the atomic bulk import RPC aligned with the student registration profile.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_bulk_import(p_payload JSONB) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.classes (id, school_id, branch_id, name, class_code, academic_year, grade_level, section, shift, room_number, capacity, monthly_fee)
  SELECT id, school_id, branch_id, name, class_code, academic_year, grade_level, section, COALESCE(shift, 1), room_number, capacity, monthly_fee
    FROM jsonb_to_recordset(COALESCE(p_payload->'classes', '[]'::jsonb)) AS x(
      id VARCHAR, school_id VARCHAR, branch_id VARCHAR, name VARCHAR, class_code VARCHAR, academic_year VARCHAR,
      grade_level INTEGER, section VARCHAR, shift SMALLINT, room_number VARCHAR, capacity INTEGER, monthly_fee NUMERIC
    );

  INSERT INTO public.students (
    id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    admission_date, date_of_birth, student_phone, father_phone, father_name, mother_phone,
    class_id, section, status, pin_hash, address
  )
  SELECT id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
         COALESCE(admission_date, CURRENT_DATE), NULL, student_phone, father_phone, father_name,
         NULL, class_id, section, 'active', pin_hash, COALESCE(address, '')
    FROM jsonb_to_recordset(COALESCE(p_payload->'students', '[]'::jsonb)) AS x(
      id VARCHAR, school_id VARCHAR, branch_id VARCHAR, student_id VARCHAR,
      first_name VARCHAR, middle_name VARCHAR, last_name VARCHAR, gender VARCHAR,
      admission_date DATE, student_phone VARCHAR, father_phone VARCHAR, father_name VARCHAR,
      class_id VARCHAR, section VARCHAR, pin_hash TEXT, address TEXT
    );

  INSERT INTO public.users (
    id, school_id, branch_id, role, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, password_hash, is_blocked, failed_login_attempts
  )
  SELECT id, school_id, branch_id, role::public.user_role_enum, full_name, phone, parent_phone,
         student_id, linked_student_ids, pin_hash, '', false, 0
    FROM jsonb_to_recordset(COALESCE(p_payload->'users', '[]'::jsonb)) AS x(
      id VARCHAR, school_id VARCHAR, branch_id VARCHAR, role VARCHAR, full_name VARCHAR,
      phone VARCHAR, parent_phone VARCHAR, student_id VARCHAR, linked_student_ids TEXT[], pin_hash TEXT
    )
  ON CONFLICT (id) DO UPDATE SET
    linked_student_ids = EXCLUDED.linked_student_ids,
    pin_hash = CASE WHEN public.users.pin_hash IS NULL OR public.users.pin_hash = ''
                    THEN EXCLUDED.pin_hash ELSE public.users.pin_hash END,
    full_name = CASE WHEN public.users.role = 'parent'::public.user_role_enum
                       AND (public.users.full_name IS NULL OR public.users.full_name = '')
                     THEN EXCLUDED.full_name ELSE public.users.full_name END,
    phone = COALESCE(NULLIF(public.users.phone, ''), EXCLUDED.phone),
    parent_phone = COALESCE(NULLIF(public.users.parent_phone, ''), EXCLUDED.parent_phone);

  INSERT INTO public.audit_logs (
    id, action, category, school_id, school_name, user_id, user_name, user_role, details, severity
  )
  SELECT id, action, category, school_id, school_name, user_id, user_name,
         user_role::public.user_role_enum, details, 'info'
    FROM jsonb_to_recordset(COALESCE(p_payload->'audit_logs', '[]'::jsonb)) AS x(
      id VARCHAR, action VARCHAR, category VARCHAR, school_id VARCHAR, school_name VARCHAR,
      user_id VARCHAR, user_name VARCHAR, user_role VARCHAR, details TEXT
    );
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_bulk_import(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_bulk_import(JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
