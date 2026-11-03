-- Additive objects introduced after the first SchoolOS schema release.
-- This migration can be rerun; it never removes or rewrites application rows.

CREATE TABLE IF NOT EXISTS school_branches (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_school_branches_school ON school_branches(school_id);

ALTER TABLE students ADD COLUMN IF NOT EXISTS branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS class_id VARCHAR(64) REFERENCES classes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(school_id, class_id);
ALTER TABLE report_card_templates ADD COLUMN IF NOT EXISTS own_design_image_url TEXT;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_setup_2fa BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS fee_ranges (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  min_grade INTEGER NOT NULL,
  max_grade INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_fee_ranges_school_grades ON fee_ranges(school_id,min_grade,max_grade);

CREATE TABLE IF NOT EXISTS bus_assignments (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id VARCHAR(64) NOT NULL,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (school_id,student_id)
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id,event_type,channel)
);

CREATE TABLE IF NOT EXISTS staff_members (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  full_name VARCHAR(255) NOT NULL,
  role_title VARCHAR(100) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(50),
  monthly_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  joined_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admission_applications (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  first_name VARCHAR(120) NOT NULL,
  middle_name VARCHAR(120) NOT NULL DEFAULT '',
  last_name VARCHAR(120) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male','female')),
  grade_applying VARCHAR(80) NOT NULL,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  father_phone VARCHAR(50) NOT NULL DEFAULT '',
  mother_phone VARCHAR(50) NOT NULL DEFAULT '',
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  student_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admission_applications_school_status ON admission_applications(school_id, status, applied_date DESC);

CREATE TABLE IF NOT EXISTS library_books (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  isbn VARCHAR(50),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transport_routes (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  route_number VARCHAR(50),
  vehicle_number VARCHAR(80),
  driver_name VARCHAR(150),
  driver_phone VARCHAR(50),
  stops JSONB NOT NULL DEFAULT '[]'::JSONB,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS lockout_counters (
  id VARCHAR(255) PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restore_test_records (
  id VARCHAR(64) PRIMARY KEY,
  created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  backup_date TIMESTAMPTZ NOT NULL,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL,
  details TEXT
);

CREATE TABLE IF NOT EXISTS promotion_history (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_from VARCHAR(50) NOT NULL,
  academic_year_to VARCHAR(50) NOT NULL,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  yearly_percentage NUMERIC(5,2) NOT NULL,
  yearly_rank INTEGER NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('promoted','repeated')),
  processed_by VARCHAR(64) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE school_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lockout_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_test_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['school_branches','fee_ranges','bus_assignments','notification_templates','staff_members','admission_applications','library_books','transport_routes','promotion_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope_v2 ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_scope_v2 ON public.%I FOR ALL TO authenticated USING (auth_user_role() = ''super_admin'' OR school_id = auth_school_id()) WITH CHECK (auth_user_role() = ''super_admin'' OR school_id = auth_school_id())', t);
    EXECUTE format('DROP POLICY IF EXISTS parent_student_block_insert ON public.%I', t);
    EXECUTE format('CREATE POLICY parent_student_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (auth_user_role() NOT IN (''parent'',''student''))', t);
    EXECUTE format('DROP POLICY IF EXISTS parent_student_block_update ON public.%I', t);
    EXECUTE format('CREATE POLICY parent_student_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (auth_user_role() NOT IN (''parent'',''student'')) WITH CHECK (auth_user_role() NOT IN (''parent'',''student''))', t);
    EXECUTE format('DROP POLICY IF EXISTS parent_student_block_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY parent_student_block_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (auth_user_role() NOT IN (''parent'',''student''))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lockout_counters','restore_test_records'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_admin_v2 ON public.%I', t);
    EXECUTE format('CREATE POLICY platform_admin_v2 ON public.%I FOR ALL TO authenticated USING (auth_user_role() = ''super_admin'') WITH CHECK (auth_user_role() = ''super_admin'')', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS promotion_history_student_scope ON promotion_history;
CREATE POLICY promotion_history_student_scope ON promotion_history AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_role() IN ('super_admin','school_admin','accountant') OR
    (auth_user_role() = 'teacher' AND auth_can_access_class(class_id)) OR
    (auth_user_role() IN ('parent','student') AND auth_can_access_student(student_id)));
DROP POLICY IF EXISTS notification_templates_admin_scope ON notification_templates;
CREATE POLICY notification_templates_admin_scope ON notification_templates AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_role() IN ('super_admin','school_admin'));
DROP POLICY IF EXISTS staff_members_role_scope ON staff_members;
CREATE POLICY staff_members_role_scope ON staff_members AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_role() IN ('super_admin','school_admin','accountant') OR user_id = auth_user_id());
DROP POLICY IF EXISTS bus_assignments_student_scope ON bus_assignments;
CREATE POLICY bus_assignments_student_scope ON bus_assignments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_role() IN ('super_admin','school_admin','accountant') OR auth_can_access_student(student_id));
DROP POLICY IF EXISTS fee_ranges_student_scope ON fee_ranges;
CREATE POLICY fee_ranges_student_scope ON fee_ranges AS RESTRICTIVE FOR SELECT TO authenticated
  USING (auth_user_role() IN ('super_admin','school_admin','accountant') OR EXISTS (
    SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id
    WHERE s.school_id = fee_ranges.school_id AND c.grade_level BETWEEN fee_ranges.min_grade AND fee_ranges.max_grade
      AND auth_can_access_student(s.id)
  ));

NOTIFY pgrst, 'reload schema';
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;

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
  ON CONFLICT (id) DO UPDATE SET linked_student_ids = EXCLUDED.linked_student_ids,
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

