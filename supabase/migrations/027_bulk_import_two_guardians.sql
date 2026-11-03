-- Keep bulk student imports aligned with the two-guardian student model.
-- Existing parent PIN hashes are preserved when new siblings are imported.
CREATE OR REPLACE FUNCTION schoolos_bulk_import(p_payload JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO classes (id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee)
  SELECT id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee
  FROM jsonb_to_recordset(COALESCE(p_payload->'classes', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, name VARCHAR, grade_level INTEGER,
    section VARCHAR, room_number VARCHAR, capacity INTEGER, monthly_fee NUMERIC
  );

  INSERT INTO students (id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    admission_date, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, status, pin_hash)
  SELECT id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    CURRENT_DATE, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, 'active', pin_hash
  FROM jsonb_to_recordset(COALESCE(p_payload->'students', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, student_id VARCHAR, first_name VARCHAR,
    middle_name VARCHAR, last_name VARCHAR, gender VARCHAR, date_of_birth DATE, student_phone VARCHAR,
    father_phone VARCHAR, mother_phone VARCHAR, class_id VARCHAR, section VARCHAR, pin_hash TEXT
  );

  INSERT INTO users (id, school_id, branch_id, role, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, password_hash, is_blocked, failed_login_attempts)
  SELECT id, school_id, branch_id, role::user_role_enum, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, '', false, 0
  FROM jsonb_to_recordset(COALESCE(p_payload->'users', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, role VARCHAR, full_name VARCHAR, phone VARCHAR,
    parent_phone VARCHAR, student_id VARCHAR, linked_student_ids TEXT[], pin_hash TEXT
  )
  ON CONFLICT (id) DO UPDATE SET
    linked_student_ids = EXCLUDED.linked_student_ids,
    pin_hash = CASE
      WHEN users.pin_hash IS NULL OR users.pin_hash = '' THEN EXCLUDED.pin_hash
      ELSE users.pin_hash
    END,
    full_name = CASE
      WHEN users.role = 'parent' AND users.full_name = '' THEN EXCLUDED.full_name
      ELSE users.full_name
    END,
    phone = CASE WHEN users.phone IS NULL OR users.phone = '' THEN EXCLUDED.phone ELSE users.phone END,
    parent_phone = CASE WHEN users.parent_phone IS NULL OR users.parent_phone = '' THEN EXCLUDED.parent_phone ELSE users.parent_phone END;

  INSERT INTO audit_logs (id, action, category, school_id, school_name, user_id, user_name, user_role, details, severity)
  SELECT id, action, category, school_id, school_name, user_id, user_name, user_role::user_role_enum, details, 'info'
  FROM jsonb_to_recordset(COALESCE(p_payload->'audit_logs', '[]'::jsonb)) AS x(
    id VARCHAR, action VARCHAR, category VARCHAR, school_id VARCHAR, school_name VARCHAR,
    user_id VARCHAR, user_name VARCHAR, user_role VARCHAR, details TEXT
  );
END;
$$;

REVOKE ALL ON FUNCTION schoolos_bulk_import(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schoolos_bulk_import(JSONB) TO service_role;
