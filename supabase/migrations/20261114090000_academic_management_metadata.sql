-- Academic Management: class codes, year-scoped classes, and subject descriptions.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS class_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(9);

ALTER TABLE public.classes ALTER COLUMN section SET DEFAULT '';

UPDATE public.classes c
SET academic_year = s.academic_year
FROM public.schools s
WHERE c.school_id = s.id AND c.academic_year IS NULL;

UPDATE public.classes
SET academic_year = '2026-2027'
WHERE academic_year IS NULL;

UPDATE public.classes
SET class_code = 'CLS-' || upper(regexp_replace(coalesce(name, 'CLASS'), '[^A-Za-z0-9]+', '-', 'g')) || '-' ||
  upper(right(regexp_replace(id, '[^A-Za-z0-9]', '', 'g'), 6))
WHERE class_code IS NULL OR btrim(class_code) = '';

ALTER TABLE public.classes
  ALTER COLUMN class_code SET NOT NULL,
  ALTER COLUMN academic_year SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_school_year_code
  ON public.classes (school_id, academic_year, lower(class_code));

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.subjects
  ALTER COLUMN credit_units SET DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_school_code
  ON public.subjects (school_id, lower(code));

CREATE OR REPLACE FUNCTION schoolos_bulk_import(p_payload JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO classes (id, school_id, branch_id, name, class_code, academic_year, grade_level, section, shift, room_number, capacity, monthly_fee)
  SELECT id, school_id, branch_id, name, class_code, academic_year, grade_level, section, COALESCE(shift, 1), room_number, capacity, monthly_fee
  FROM jsonb_to_recordset(COALESCE(p_payload->'classes', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, name VARCHAR, class_code VARCHAR,
    academic_year VARCHAR, grade_level INTEGER, section VARCHAR, shift SMALLINT,
    room_number VARCHAR, capacity INTEGER, monthly_fee NUMERIC
  );

  INSERT INTO students (id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    admission_date, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, status, pin_hash)
  SELECT id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    CURRENT_DATE, date_of_birth, student_phone, parent_phone, NULL, class_id, section, 'active', pin_hash
  FROM jsonb_to_recordset(COALESCE(p_payload->'students', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, student_id VARCHAR, first_name VARCHAR,
    middle_name VARCHAR, last_name VARCHAR, gender VARCHAR, date_of_birth DATE, student_phone VARCHAR,
    parent_phone VARCHAR, class_id VARCHAR, section VARCHAR, pin_hash TEXT
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
    pin_hash = EXCLUDED.pin_hash,
    full_name = CASE WHEN users.role = 'parent' AND users.full_name = '' THEN EXCLUDED.full_name ELSE users.full_name END;

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
