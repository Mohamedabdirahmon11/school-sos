-- ==============================================================================
-- SchoolOS Multi-School SaaS Platform Database Schema
-- Compatible with Supabase PostgreSQL (Postgres 15+)
-- Features: Multi-Tenancy Isolation, Row Level Security (RLS), Role-Based Access,
--           Rate Limiting, Audit Trails, Cash-Only Fees, Small/Big Exam Grading
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM ('super_admin', 'school_admin', 'accountant', 'teacher', 'parent', 'student');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status_enum AS ENUM ('trial', 'active', 'grace', 'read_only', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_cadence_enum AS ENUM ('trial', 'monthly', 'yearly', 'lifetime');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE plan_tier_enum AS ENUM ('basic', 'standard', 'premium');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status_enum AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE mark_status_enum AS ENUM ('draft', 'submitted', 'approved');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE fee_payment_status_enum AS ENUM ('paid', 'partial', 'unpaid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE fee_type_enum AS ENUM ('monthly_tuition', 'annual_registration', 'bus', 'custom');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_channel_enum AS ENUM ('sms', 'whatsapp');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_status_enum AS ENUM ('queued', 'processing', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. PLATFORM CONFIGURATION & SETTINGS
CREATE TABLE IF NOT EXISTS super_admin_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  trial_days INTEGER NOT NULL DEFAULT 7,
  grace_days INTEGER NOT NULL DEFAULT 7,
  platform_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  read_only_after_expiry BOOLEAN NOT NULL DEFAULT true,
  require_super_admin_2fa BOOLEAN NOT NULL DEFAULT false,
  lockout_threshold INTEGER NOT NULL DEFAULT 5,
  lockout_duration_minutes INTEGER NOT NULL DEFAULT 15,
  session_timeout_minutes INTEGER NOT NULL DEFAULT 60,
  log_security_events BOOLEAN NOT NULL DEFAULT true,
  backup_schedule VARCHAR(20) NOT NULL DEFAULT 'daily',
  last_backup_date TIMESTAMPTZ,
  last_backup_status VARCHAR(20) DEFAULT 'success',
  enabled_languages TEXT[] NOT NULL DEFAULT ARRAY['en', 'so'],
  academic_year_name VARCHAR(50) NOT NULL DEFAULT '2026-2027',
  semester1_start DATE NOT NULL DEFAULT '2026-09-01',
  semester1_end DATE NOT NULL DEFAULT '2027-01-20',
  semester2_start DATE NOT NULL DEFAULT '2027-02-01',
  semester2_end DATE NOT NULL DEFAULT '2027-06-30',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  yearly_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  lifetime_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  max_students INTEGER NOT NULL DEFAULT 500,
  max_teachers INTEGER NOT NULL DEFAULT 30,
  support_level VARCHAR(50) NOT NULL DEFAULT 'standard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SCHOOL TENANTS
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(150) NOT NULL,
  logo_url TEXT,
  brand_color VARCHAR(20) NOT NULL DEFAULT '#0F766E',
  currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
  language VARCHAR(5) NOT NULL DEFAULT 'en',
  timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Addis_Ababa',
  academic_year VARCHAR(50) NOT NULL DEFAULT '2026-2027',
  current_semester VARCHAR(50) NOT NULL DEFAULT 'Semester 1',
  terms JSONB NOT NULL DEFAULT '{"semester1Start": "", "semester1End": "", "semester2Start": "", "semester2End": ""}'::JSONB,
  grading_scale JSONB NOT NULL DEFAULT '[{"minPercentage": 90, "label": "A", "remark": "Excellent"}, {"minPercentage": 80, "label": "B", "remark": "Very good"}, {"minPercentage": 70, "label": "C", "remark": "Good"}, {"minPercentage": 60, "label": "D", "remark": "Satisfactory"}, {"minPercentage": 0, "label": "F", "remark": "Below pass mark"}]'::JSONB,
  attendance_rules JSONB NOT NULL DEFAULT '{"lateAfterMinutes": 15, "absentAfterMinutes": 0, "requireExcusedReason": true, "allowParentExcuses": false}'::JSONB,
  class_levels JSONB NOT NULL DEFAULT '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]'::JSONB,
  report_card_header TEXT NOT NULL DEFAULT '',
  report_card_footer TEXT NOT NULL DEFAULT '',
  receipt_header TEXT NOT NULL DEFAULT '',
  receipt_footer TEXT NOT NULL DEFAULT '',
  notification_preferences JSONB NOT NULL DEFAULT '{"email": true, "sms": true, "inApp": true, "attendanceAlerts": true, "feeReminders": true, "examResults": true}'::JSONB,
  default_class_capacity INTEGER NOT NULL DEFAULT 40,
  student_access_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_code ON schools(UPPER(code));

-- 6. SCHOOL BRANCHES
CREATE TABLE IF NOT EXISTS school_branches (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(150),
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_branches_school ON school_branches(school_id);

-- 7. SCHOOL SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS school_subscriptions (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL REFERENCES plans(id),
  cadence subscription_cadence_enum NOT NULL DEFAULT 'monthly',
  status subscription_status_enum NOT NULL DEFAULT 'trial',
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,
  grace_days INTEGER NOT NULL DEFAULT 7,
  price_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  last_billed_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_school ON school_subscriptions(school_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON school_subscriptions(status);

-- 8. USERS (SUPER ADMIN, SCHOOL ADMIN, TEACHERS, ACCOUNTANTS, PARENTS, STUDENTS)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) REFERENCES schools(id) ON DELETE CASCADE,
  role user_role_enum NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(50),
  staff_id VARCHAR(40),
  student_id VARCHAR(50),
  parent_phone VARCHAR(50),
  password_hash TEXT,
  pin_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  two_factor_secret TEXT,
  pending_two_factor_secret TEXT,
  must_setup_2fa BOOLEAN NOT NULL DEFAULT false,
  recovery_codes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  assigned_class_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  assigned_subject_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  linked_student_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_parent_phone ON users(parent_phone);
CREATE INDEX IF NOT EXISTS idx_users_school_phone ON users(school_id, phone);
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id VARCHAR(40);
UPDATE users SET staff_id = 'STF-' || upper(substr(md5(school_id || ':' || id), 1, 10))
  WHERE staff_id IS NULL AND school_id IS NOT NULL AND role IN ('school_admin','teacher','accountant');
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_school_staff_id ON users(school_id, lower(staff_id)) WHERE staff_id IS NOT NULL;

-- 9. USER SESSIONS
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_role user_role_enum NOT NULL,
  school_id VARCHAR(64) REFERENCES schools(id) ON DELETE CASCADE,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- 10. CLASSES
CREATE TABLE IF NOT EXISTS classes (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL,
  name VARCHAR(100) NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 0 AND 12),
  section VARCHAR(20) NOT NULL DEFAULT 'A',
  room_number VARCHAR(50),
  capacity INTEGER NOT NULL DEFAULT 40,
  class_teacher_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  monthly_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade ON classes(school_id, grade_level);
CREATE INDEX IF NOT EXISTS idx_classes_active ON classes(school_id, is_archived);

-- 11. SUBJECTS
CREATE TABLE IF NOT EXISTS subjects (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL,
  credit_units INTEGER NOT NULL DEFAULT 3,
  department VARCHAR(100),
  assigned_teacher_ids TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

-- 12. STUDENTS
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL,
  student_id VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  date_of_birth DATE,
  student_phone VARCHAR(50),
  father_phone VARCHAR(50) NOT NULL,
  mother_phone VARCHAR(50),
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  section VARCHAR(20) NOT NULL DEFAULT 'A',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated', 'transferred')),
  pin_hash TEXT,
  bus_route_id VARCHAR(64),
  documents JSONB DEFAULT '[]'::JSONB,
  notes JSONB DEFAULT '[]'::JSONB,
  blood_group VARCHAR(10),
  allergies TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_sid ON students(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_students_school_class ON students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_students_father_phone ON students(school_id, father_phone);
CREATE INDEX IF NOT EXISTS idx_students_mother_phone ON students(school_id, mother_phone);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(school_id, student_phone);

-- 13. TEACHERS
CREATE TABLE IF NOT EXISTS teachers (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  staff_id VARCHAR(40),
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
  qualification VARCHAR(150),
  department VARCHAR(100),
  assigned_classes TEXT[] DEFAULT ARRAY[]::TEXT[],
  assigned_subjects TEXT[] DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  joined_date DATE NOT NULL DEFAULT CURRENT_DATE,
  monthly_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS staff_id VARCHAR(40);
UPDATE teachers t SET staff_id = u.staff_id FROM users u WHERE t.user_id = u.id AND t.staff_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_staff_id ON teachers(school_id, lower(staff_id)) WHERE staff_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS class_subjects (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id VARCHAR(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id VARCHAR(64) REFERENCES teachers(id) ON DELETE SET NULL,
  periods_per_week INTEGER NOT NULL DEFAULT 3 CHECK (periods_per_week BETWEEN 1 AND 30),
  small_exam_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  big_exam_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, subject_id)
);
ALTER TABLE class_subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_class_subjects_school_class ON class_subjects(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON class_subjects(school_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(school_id, teacher_id);

CREATE OR REPLACE FUNCTION schoolos_save_subject_assignments(p_school_id VARCHAR, p_subject_id VARCHAR, p_assignments JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE class_subjects SET is_active = FALSE WHERE school_id = p_school_id AND subject_id = p_subject_id;
  INSERT INTO class_subjects (id, school_id, class_id, subject_id, teacher_id, periods_per_week, small_exam_enabled, big_exam_enabled, is_active)
  SELECT id, p_school_id, class_id, p_subject_id, teacher_id, periods_per_week, small_exam_enabled, big_exam_enabled, TRUE
  FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS a(
    id VARCHAR, class_id VARCHAR, teacher_id VARCHAR, periods_per_week INTEGER,
    small_exam_enabled BOOLEAN, big_exam_enabled BOOLEAN
  ) ON CONFLICT (school_id, class_id, subject_id) DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id, periods_per_week = EXCLUDED.periods_per_week,
    small_exam_enabled = EXCLUDED.small_exam_enabled, big_exam_enabled = EXCLUDED.big_exam_enabled, is_active = TRUE;
END;
$$;
REVOKE ALL ON FUNCTION schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) TO service_role;

-- 14. TIMETABLE SLOTS
CREATE TABLE IF NOT EXISTS timetable_slots (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL,
  period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 8),
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  subject_id VARCHAR(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id VARCHAR(64) NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  room_number VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE timetable_slots ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_timetable_school_class ON timetable_slots(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON timetable_slots(school_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_timetable_active ON timetable_slots(school_id, class_id, is_active);

CREATE TABLE IF NOT EXISTS timetable_settings (
  school_id VARCHAR(64) PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  first_period_start VARCHAR(5) NOT NULL DEFAULT '08:00',
  period_minutes INTEGER NOT NULL DEFAULT 40 CHECK (period_minutes BETWEEN 20 AND 120),
  break_after_period INTEGER NOT NULL DEFAULT 3 CHECK (break_after_period BETWEEN 1 AND 5),
  break_minutes INTEGER NOT NULL DEFAULT 20 CHECK (break_minutes BETWEEN 0 AND 120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teacher_unavailability (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id VARCHAR(64) NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, teacher_id, day_of_week, period_number)
);
CREATE INDEX IF NOT EXISTS idx_teacher_unavailability_scope ON teacher_unavailability(school_id, teacher_id, day_of_week);
ALTER TABLE timetable_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_unavailability ENABLE ROW LEVEL SECURITY;

-- Helpers use trusted JWT claims when supplied by the caller; the Express service
-- uses the service role and must enforce the same access rules in application code.
-- Defined before the first policy because PostgreSQL resolves function references
-- when each policy is created.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.auth_user_id()
RETURNS VARCHAR LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(pg_catalog.current_setting('request.jwt.claim.sub', true), auth.uid()::text); $$;
CREATE OR REPLACE FUNCTION private.auth_school_id()
RETURNS VARCHAR LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(pg_catalog.current_setting('request.jwt.claim.school_id', true),
 (SELECT u.school_id FROM public.users AS u WHERE u.id = private.auth_user_id())); $$;
CREATE OR REPLACE FUNCTION private.auth_user_role()
RETURNS VARCHAR LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT u.role::text FROM public.users AS u WHERE u.id = private.auth_user_id(); $$;
CREATE OR REPLACE FUNCTION private.auth_can_access_student(target_student_id VARCHAR)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
SELECT EXISTS (
 SELECT 1 FROM public.students AS s JOIN public.users AS u ON u.id=private.auth_user_id()
 WHERE s.id=target_student_id AND (
  u.role='super_admin'
  OR (u.school_id=s.school_id AND u.role IN ('school_admin','accountant'))
  OR (u.school_id=s.school_id AND u.role='teacher' AND EXISTS (
   SELECT 1 FROM public.teachers AS t JOIN public.class_subjects AS cs
    ON cs.teacher_id=t.id AND cs.school_id=t.school_id AND cs.class_id=s.class_id AND cs.is_active=TRUE
   WHERE t.user_id=u.id AND t.school_id=s.school_id))
  OR (u.school_id=s.school_id AND u.role='parent' AND
   (s.id=ANY(u.linked_student_ids) OR s.father_phone=u.phone OR s.mother_phone=u.phone OR s.father_phone=u.parent_phone OR s.mother_phone=u.parent_phone))
  OR (u.school_id=s.school_id AND u.role='student' AND (u.student_id=s.student_id OR u.id='usr-student-'||s.id))
 )
); $$;
CREATE OR REPLACE FUNCTION private.auth_can_access_class(target_class_id VARCHAR)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = ''
AS $$
SELECT EXISTS (
 SELECT 1 FROM public.classes AS c JOIN public.users AS u ON u.id=private.auth_user_id()
 WHERE c.id=target_class_id AND (
  u.role='super_admin'
  OR (u.school_id=c.school_id AND u.role IN ('school_admin','accountant'))
  OR (u.school_id=c.school_id AND u.role='teacher' AND EXISTS (
   SELECT 1 FROM public.teachers AS t JOIN public.class_subjects AS cs
    ON cs.teacher_id=t.id AND cs.school_id=t.school_id AND cs.class_id=c.id AND cs.is_active=TRUE
   WHERE t.user_id=u.id AND t.school_id=c.school_id))
  OR (u.school_id=c.school_id AND u.role IN ('parent','student') AND EXISTS (
   SELECT 1 FROM public.students AS s WHERE s.class_id=c.id AND private.auth_can_access_student(s.id)))
 )
); $$;
REVOKE ALL ON FUNCTION private.auth_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_school_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_can_access_student(VARCHAR) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.auth_can_access_class(VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.auth_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_school_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_can_access_student(VARCHAR) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.auth_can_access_class(VARCHAR) TO authenticated, service_role;

DROP POLICY IF EXISTS timetable_settings_tenant ON timetable_settings;
CREATE POLICY timetable_settings_tenant ON timetable_settings FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id())
  WITH CHECK (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS teacher_unavailability_tenant ON teacher_unavailability;
CREATE POLICY teacher_unavailability_tenant ON teacher_unavailability FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id())
  WITH CHECK (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS timetable_settings_admin_insert ON timetable_settings;
CREATE POLICY timetable_settings_admin_insert ON timetable_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS timetable_settings_admin_update ON timetable_settings;
CREATE POLICY timetable_settings_admin_update ON timetable_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() IN ('school_admin','super_admin')) WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS timetable_settings_admin_delete ON timetable_settings;
CREATE POLICY timetable_settings_admin_delete ON timetable_settings AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS teacher_unavailability_admin_insert ON teacher_unavailability;
CREATE POLICY teacher_unavailability_admin_insert ON teacher_unavailability AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS teacher_unavailability_admin_update ON teacher_unavailability;
CREATE POLICY teacher_unavailability_admin_update ON teacher_unavailability AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() IN ('school_admin','super_admin')) WITH CHECK (private.auth_user_role() IN ('school_admin','super_admin'));
DROP POLICY IF EXISTS teacher_unavailability_admin_delete ON teacher_unavailability;
CREATE POLICY teacher_unavailability_admin_delete ON teacher_unavailability AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() IN ('school_admin','super_admin'));

-- 15. DAILY ATTENDANCE (EXACTLY ONCE PER DAY PER STUDENT PER CLASS)
CREATE TABLE IF NOT EXISTS attendance_records (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status attendance_status_enum NOT NULL DEFAULT 'present',
  note TEXT,
  recorded_by VARCHAR(64) NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Strict unique constraint: one attendance entry per student per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique_day ON attendance_records(school_id, class_id, student_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(school_id, class_id, date);

-- 16. EXAM CONFIGURATION (SMALL & BIG EXAM RULES)
CREATE TABLE IF NOT EXISTS exam_configs (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year VARCHAR(50) NOT NULL DEFAULT '2026-2027',
  small_exam_name VARCHAR(100) NOT NULL DEFAULT 'Small Exam',
  small_exam_max NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  big_exam_name VARCHAR(100) NOT NULL DEFAULT 'Big Exam',
  big_exam_max NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  pass_mark_percentage NUMERIC(5, 2) NOT NULL DEFAULT 50.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, academic_year)
);

-- 17. STUDENT MARKS (PERCENTAGE BASED, SMALL + BIG EXAM)
CREATE TABLE IF NOT EXISTS student_marks (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id VARCHAR(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year VARCHAR(50) NOT NULL,
  semester VARCHAR(50) NOT NULL CHECK (semester IN ('Semester 1', 'Semester 2')),
  small_exam_marks NUMERIC(5, 2) NOT NULL DEFAULT 0,
  big_exam_marks NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_marks NUMERIC(5, 2) NOT NULL DEFAULT 0,
  percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  status mark_status_enum NOT NULL DEFAULT 'draft',
  teacher_remarks TEXT,
  submitted_by VARCHAR(64) REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  approved_by VARCHAR(64) REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, class_id, subject_id, student_id, academic_year, semester)
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON student_marks(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_marks_class_subject ON student_marks(school_id, class_id, subject_id, semester);

-- 18. YEAR-END PROMOTIONS
CREATE TABLE IF NOT EXISTS promotions (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_from VARCHAR(50) NOT NULL,
  academic_year_to VARCHAR(50) NOT NULL,
  class_from_id VARCHAR(64) NOT NULL REFERENCES classes(id),
  class_to_id VARCHAR(64) REFERENCES classes(id),
  student_id VARCHAR(64) NOT NULL REFERENCES students(id),
  yearly_percentage NUMERIC(5, 2) NOT NULL,
  yearly_rank INTEGER NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('promoted', 'repeated')),
  notes TEXT,
  processed_by VARCHAR(64) NOT NULL REFERENCES users(id),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_school ON promotions(school_id, academic_year_from);

-- 19. FEE STRUCTURES (CLASS-RANGE, BUS, REGISTRATION, CUSTOM)
CREATE TABLE IF NOT EXISTS fee_structures (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  fee_type fee_type_enum NOT NULL,
  name VARCHAR(150) NOT NULL,
  min_grade INTEGER CHECK (min_grade BETWEEN 1 AND 12),
  max_grade INTEGER CHECK (max_grade BETWEEN 1 AND 12),
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  cadence VARCHAR(20) NOT NULL DEFAULT 'monthly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feestruct_school ON fee_structures(school_id);

-- 20. FEE PAYMENTS (STUDENTS PAY IN CASH ONLY)
CREATE TABLE IF NOT EXISTS fee_payments (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(100) NOT NULL,
  reference_number VARCHAR(100),
  academic_year VARCHAR(50) NOT NULL,
  month VARCHAR(50) NOT NULL,
  fee_type fee_type_enum NOT NULL DEFAULT 'monthly_tuition',
  fee_structure_id VARCHAR(64) REFERENCES fee_structures(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(200),
  amount_due NUMERIC(10, 2) NOT NULL,
  amount_paid NUMERIC(10, 2) NOT NULL,
  remaining_amount NUMERIC(10, 2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'Cash' CHECK (payment_method = 'Cash'),
  status fee_payment_status_enum NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by VARCHAR(64) NOT NULL REFERENCES users(id),
  notes TEXT,
  voided_at TIMESTAMPTZ,
  voided_by VARCHAR(64) REFERENCES users(id),
  void_reason TEXT,
  idempotency_keys JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS voided_by VARCHAR(64) REFERENCES users(id);
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS idempotency_keys JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS fee_structure_id VARCHAR(64) REFERENCES fee_structures(id) ON DELETE SET NULL;
ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(200);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt ON fee_payments(school_id, receipt_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payment_school_idempotency ON fee_payments(school_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_student ON fee_payments(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON fee_payments(school_id, date);

-- 21. REPORT CARD DESIGNER SETTINGS PER SCHOOL
CREATE TABLE IF NOT EXISTS report_card_templates (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  template_id VARCHAR(50) NOT NULL DEFAULT 'modern',
  primary_color VARCHAR(20) NOT NULL DEFAULT '#0F766E',
  secondary_color VARCHAR(20) NOT NULL DEFAULT '#0B2B2A',
  logo_position VARCHAR(20) NOT NULL DEFAULT 'center' CHECK (logo_position IN ('left', 'center', 'right')),
  title_text VARCHAR(150) NOT NULL DEFAULT 'Official Academic Achievement Record',
  visible_blocks JSONB NOT NULL DEFAULT '{"rank": true, "teacherRemarks": true, "adminRemarks": true, "percentage": true, "signatures": true, "stamp": true}'::JSONB,
  signature_title_left VARCHAR(100) NOT NULL DEFAULT 'Class Teacher',
  signature_title_right VARCHAR(100) NOT NULL DEFAULT 'Principal / Headmaster',
  stamp_image_url TEXT,
  signature_image_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. DIRECT MESSAGES
CREATE TABLE IF NOT EXISTS direct_messages (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_name VARCHAR(255) NOT NULL,
  sender_role VARCHAR(50) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name VARCHAR(255) NOT NULL,
  recipient_role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_messages_pair ON direct_messages(school_id, sender_id, recipient_id);

-- 23. COMMUNICATION SETTINGS (SMS / WHATSAPP PROVIDER)
CREATE TABLE IF NOT EXISTS communication_settings (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'none',
  api_key TEXT,
  api_secret TEXT,
  sender_id VARCHAR(50),
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. COMMUNICATION QUEUE (SMS / WHATSAPP READY NOTIFICATIONS)
CREATE TABLE IF NOT EXISTS communication_queue (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_phone VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(150) NOT NULL,
  student_id VARCHAR(64) REFERENCES students(id) ON DELETE SET NULL,
  message_type VARCHAR(50) NOT NULL,
  channel comm_channel_enum NOT NULL DEFAULT 'sms',
  content TEXT NOT NULL,
  status comm_status_enum NOT NULL DEFAULT 'queued',
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  provider_message_id VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commqueue_school ON communication_queue(school_id, status);

-- 25. NOTICES & EVENTS
CREATE TABLE IF NOT EXISTS school_notices (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  audience VARCHAR(50) NOT NULL DEFAULT 'all',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  publish_date DATE NOT NULL DEFAULT CURRENT_DATE,
  author_name VARCHAR(150) NOT NULL,
  author_role VARCHAR(50) NOT NULL,
  class_id VARCHAR(64),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS class_id VARCHAR(64);
ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_notices_school ON school_notices(school_id);
CREATE INDEX IF NOT EXISTS idx_notices_active_audience ON school_notices(school_id, is_active, audience, publish_date DESC);

CREATE TABLE IF NOT EXISTS notice_reads (
  id VARCHAR(160) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  notice_id VARCHAR(64) NOT NULL REFERENCES school_notices(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, notice_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notice_reads_user ON notice_reads(school_id, user_id);

CREATE TABLE IF NOT EXISTS school_events (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'event',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. PLATFORM BROADCASTS (SUPER ADMIN)
CREATE TABLE IF NOT EXISTS platform_broadcasts (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  audience VARCHAR(50) NOT NULL DEFAULT 'all_schools',
  target_school_id VARCHAR(64) REFERENCES schools(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS support_tickets (
  id VARCHAR(64) PRIMARY KEY,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  school_id VARCHAR(64) REFERENCES schools(id) ON DELETE CASCADE,
  school_name VARCHAR(255),
  created_by_user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_name VARCHAR(255) NOT NULL,
  created_by_role VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  messages JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_school ON support_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);

-- 28. PLATFORM SUBSCRIPTION INVOICES (FOR SCHOOLS PAYING OWNER)
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id VARCHAR(64) PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_name VARCHAR(255) NOT NULL,
  plan plan_tier_enum NOT NULL,
  cadence subscription_cadence_enum NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  receipt_number VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_school ON subscription_invoices(school_id);

-- 29. AUDIT LOGS (EXPORTABLE AS CSV)
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  school_id VARCHAR(64) REFERENCES schools(id) ON DELETE SET NULL,
  school_name VARCHAR(255),
  user_id VARCHAR(64) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_role user_role_enum NOT NULL,
  details TEXT NOT NULL,
  ip_address VARCHAR(50),
  severity VARCHAR(20) NOT NULL DEFAULT 'info'
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_school ON audit_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- School imports insert classes, students, linked users and audit data atomically.
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

-- 30. ASSIGNMENTS & HOMEWORK
CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id VARCHAR(64) NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id VARCHAR(64) NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id VARCHAR(64) NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  due_date DATE NOT NULL,
  max_points INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id VARCHAR(64) PRIMARY KEY,
  assignment_id VARCHAR(64) NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  grade NUMERIC(5, 2),
  feedback TEXT
);

-- Additional application tables and fields added after the initial schema release.
ALTER TABLE students ADD COLUMN IF NOT EXISTS branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS branch_id VARCHAR(64) REFERENCES school_branches(id) ON DELETE SET NULL;
ALTER TABLE fee_structures ADD COLUMN IF NOT EXISTS class_id VARCHAR(64) REFERENCES classes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fee_structures_class ON fee_structures(school_id, class_id);
ALTER TABLE report_card_templates ADD COLUMN IF NOT EXISTS own_design_image_url TEXT;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS school_id VARCHAR(64) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS content TEXT NOT NULL DEFAULT '';
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
  student_id VARCHAR(64) NOT NULL,
  route_id VARCHAR(64) NOT NULL,
  fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (school_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_bus_assignments_route_school ON bus_assignments(route_id, school_id);
CREATE INDEX IF NOT EXISTS idx_bus_assignments_student_school ON bus_assignments(student_id, school_id);

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
  staff_id VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  staff_id VARCHAR(64) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  payroll_month VARCHAR(7) NOT NULL CHECK (payroll_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  base_salary NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0),
  allowances JSONB NOT NULL DEFAULT '[]'::JSONB,
  allowance_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (allowance_total >= 0),
  deductions JSONB NOT NULL DEFAULT '[]'::JSONB,
  deduction_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deduction_total >= 0),
  net_salary NUMERIC(12,2) NOT NULL CHECK (net_salary >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  created_by VARCHAR(64) NOT NULL REFERENCES users(id),
  approved_by VARCHAR(64) REFERENCES users(id),
  paid_by VARCHAR(64) REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  UNIQUE (school_id,user_id,payroll_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_school_month ON payroll_records(school_id,payroll_month);
CREATE INDEX IF NOT EXISTS idx_payroll_user_history ON payroll_records(school_id,user_id,payroll_month DESC);

ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS staff_id VARCHAR(40);
UPDATE staff_members s SET staff_id = COALESCE(u.staff_id, 'STF-' || upper(substr(md5(s.school_id || ':' || s.id), 1, 10)))
  FROM users u WHERE s.user_id = u.id AND s.staff_id IS NULL;
UPDATE staff_members SET staff_id = 'STF-' || upper(substr(md5(school_id || ':' || id), 1, 10)) WHERE staff_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_members_school_staff_id ON staff_members(school_id, lower(staff_id));

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_school_unique ON students(id, school_id);

CREATE TABLE IF NOT EXISTS discipline_incidents (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL,
  incident_date DATE NOT NULL,
  infraction_type VARCHAR(160) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  action_taken TEXT NOT NULL DEFAULT '',
  notes TEXT,
  parent_contacted BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discipline_incidents_student_school_fk
    FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_discipline_school_date ON discipline_incidents(school_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_student ON discipline_incidents(student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_recorded_by ON discipline_incidents(recorded_by);

CREATE TABLE IF NOT EXISTS library_books (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  isbn VARCHAR(50),
  quantity INTEGER NOT NULL DEFAULT 1 CONSTRAINT library_books_quantity_nonnegative CHECK (quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_school_isbn_unique
  ON library_books(school_id, lower(btrim(isbn)))
  WHERE isbn IS NOT NULL AND btrim(isbn) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_id_school_unique ON library_books(id, school_id);

CREATE TABLE IF NOT EXISTS library_loans (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id VARCHAR(64) NOT NULL,
  student_id VARCHAR(64) NOT NULL,
  due_date DATE NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'returned')),
  returned_at TIMESTAMPTZ,
  returned_by VARCHAR(64) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_book_school_fk FOREIGN KEY (book_id, school_id)
    REFERENCES library_books(id, school_id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_student_school_fk FOREIGN KEY (student_id, school_id)
    REFERENCES students(id, school_id) ON DELETE RESTRICT,
  CONSTRAINT library_loans_return_state_check CHECK (
    (status = 'issued' AND returned_at IS NULL AND returned_by IS NULL) OR
    (status = 'returned' AND returned_at IS NOT NULL AND returned_by IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_library_loans_school_status_due ON library_loans(school_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_library_loans_book_status ON library_loans(book_id, school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_loans_student ON library_loans(student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_library_loans_issued_by ON library_loans(issued_by);
CREATE INDEX IF NOT EXISTS idx_library_loans_returned_by ON library_loans(returned_by);

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
ALTER TABLE transport_routes ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 40;
ALTER TABLE transport_routes DROP CONSTRAINT IF EXISTS transport_routes_capacity_check;
ALTER TABLE transport_routes ADD CONSTRAINT transport_routes_capacity_check CHECK (capacity BETWEEN 1 AND 1000);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_school_unique ON students(id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_routes_id_school_unique ON transport_routes(id, school_id);
ALTER TABLE bus_assignments DROP CONSTRAINT IF EXISTS bus_assignments_student_id_fkey;
ALTER TABLE bus_assignments DROP CONSTRAINT IF EXISTS bus_assignments_student_school_fkey;
ALTER TABLE bus_assignments ADD CONSTRAINT bus_assignments_student_school_fkey
  FOREIGN KEY (student_id, school_id) REFERENCES students(id, school_id) ON DELETE CASCADE;
ALTER TABLE bus_assignments DROP CONSTRAINT IF EXISTS bus_assignments_route_school_fkey;
ALTER TABLE bus_assignments ADD CONSTRAINT bus_assignments_route_school_fkey
  FOREIGN KEY (route_id, school_id) REFERENCES transport_routes(id, school_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION private.enforce_bus_assignment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  route_capacity integer;
  active_assignments integer;
BEGIN
  IF NOT NEW.active THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO route_capacity
  FROM public.transport_routes
  WHERE id = NEW.route_id AND school_id = NEW.school_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active bus route from this school.' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id = NEW.student_id AND school_id = NEW.school_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Choose an active student from this school.' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO active_assignments
  FROM public.bus_assignments
  WHERE school_id = NEW.school_id AND route_id = NEW.route_id
    AND active = true AND id <> NEW.id;
  IF active_assignments >= route_capacity THEN
    RAISE EXCEPTION 'This bus route is full. Increase its capacity or choose another route.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bus_assignment_capacity_guard ON public.bus_assignments;
CREATE TRIGGER bus_assignment_capacity_guard
BEFORE INSERT OR UPDATE OF school_id, student_id, route_id, active ON public.bus_assignments
FOR EACH ROW EXECUTE FUNCTION private.enforce_bus_assignment_capacity();

CREATE OR REPLACE FUNCTION private.prevent_bus_capacity_below_assignments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  active_assignments integer;
BEGIN
  SELECT count(*) INTO active_assignments
  FROM public.bus_assignments
  WHERE school_id = NEW.school_id AND route_id = NEW.id AND active = true;
  IF NEW.capacity < active_assignments THEN
    RAISE EXCEPTION 'Bus capacity cannot be lower than the number of active student assignments.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS transport_route_capacity_guard ON public.transport_routes;
CREATE TRIGGER transport_route_capacity_guard
BEFORE UPDATE OF capacity ON public.transport_routes
FOR EACH ROW EXECUTE FUNCTION private.prevent_bus_capacity_below_assignments();

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

CREATE INDEX IF NOT EXISTS idx_broadcasts_schedule ON platform_broadcasts(status,scheduled_for);

-- Additional indexes for foreign-key joins and common school-scoped filters.
-- Kept after every table creation so each referenced table exists.
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_sessions_school ON user_sessions(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch ON classes(branch_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(class_teacher_id);
CREATE INDEX IF NOT EXISTS idx_students_branch ON students(school_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_timetable_subject ON timetable_slots(school_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(school_id, student_id, date);
CREATE INDEX IF NOT EXISTS idx_promotions_student ON promotions(school_id, student_id, academic_year_from);
CREATE INDEX IF NOT EXISTS idx_promotions_classes ON promotions(class_from_id, class_to_id);
CREATE INDEX IF NOT EXISTS idx_payments_recorder ON fee_payments(school_id, recorded_by);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON direct_messages(school_id, recipient_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_school ON school_events(school_id, start_date);
CREATE INDEX IF NOT EXISTS idx_tickets_creator ON support_tickets(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student ON assignment_submissions(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_staff_user ON staff_members(user_id);
CREATE INDEX IF NOT EXISTS idx_admissions_class ON admission_applications(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_library_school ON library_books(school_id);
CREATE INDEX IF NOT EXISTS idx_transport_school ON transport_routes(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON subscription_invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_date ON subscription_invoices(status, paid_date);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE discipline_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discipline_incidents_read ON discipline_incidents;
CREATE POLICY discipline_incidents_read ON discipline_incidents FOR SELECT TO authenticated
USING (private.auth_user_role() = 'super_admin' OR (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));
DROP POLICY IF EXISTS discipline_incidents_insert ON discipline_incidents;
CREATE POLICY discipline_incidents_insert ON discipline_incidents FOR INSERT TO authenticated
WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin' AND recorded_by = private.auth_user_id());
DROP POLICY IF EXISTS discipline_incidents_update ON discipline_incidents;
CREATE POLICY discipline_incidents_update ON discipline_incidents FOR UPDATE TO authenticated
USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin' AND recorded_by = private.auth_user_id());
DROP POLICY IF EXISTS discipline_incidents_delete ON discipline_incidents;
CREATE POLICY discipline_incidents_delete ON discipline_incidents FOR DELETE TO authenticated
USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

-- Enable RLS on all tenant-specific tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_applications ENABLE ROW LEVEL SECURITY;

-- Auth helper functions are defined above, before the first policy that uses them.

-- 1. Schools Policy: Super Admin sees all; School users see only their school
DROP POLICY IF EXISTS schools_super_admin_all ON schools;
CREATE POLICY schools_super_admin_all ON schools
  FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin');

DROP POLICY IF EXISTS schools_tenant_select ON schools;
CREATE POLICY schools_tenant_select ON schools
  FOR SELECT TO authenticated
  USING (id = private.auth_school_id());

-- 2. General Tenant Isolation Policy macro for school-scoped tables
-- (Applies to classes, subjects, students, teachers, timetable, attendance, marks, fees, etc.)
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'school_branches', 'classes', 'subjects', 'students', 'teachers',
    'timetable_slots', 'timetable_settings', 'teacher_unavailability', 'attendance_records', 'exam_configs', 'student_marks',
    'promotions', 'fee_structures', 'fee_payments', 'report_card_templates',
    'communication_queue', 'school_notices',
    'school_events', 'assignments', 'assignment_submissions', 'admission_applications'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS %I_super_admin ON %I;
      CREATE POLICY %I_super_admin ON %I
        FOR ALL TO authenticated
        USING (private.auth_user_role() = ''super_admin'');

      DROP POLICY IF EXISTS %I_tenant_access ON %I;
      CREATE POLICY %I_tenant_access ON %I
        FOR ALL TO authenticated
        USING (school_id = private.auth_school_id());
    ', t, t, t, t, t, t, t, t);
  END LOOP;
END $$;

-- 3. Users Table Policy
DROP POLICY IF EXISTS users_super_admin ON users;
CREATE POLICY users_super_admin ON users
  FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin');

DROP POLICY IF EXISTS users_same_school ON users;
CREATE POLICY users_same_school ON users
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() OR id = auth.uid()::text);

DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text);

-- 4. Audit Logs Policy
DROP POLICY IF EXISTS audit_logs_super_admin ON audit_logs;
CREATE POLICY audit_logs_super_admin ON audit_logs
  FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin');

DROP POLICY IF EXISTS audit_logs_school_admin ON audit_logs;
CREATE POLICY audit_logs_school_admin ON audit_logs
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');

-- Cover every public table, including newly added tables, with tenant or platform policies.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT table_name,
      EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=pt.table_name AND c.column_name='school_id') AS has_school_id
    FROM information_schema.tables pt
    WHERE table_schema='public' AND table_type='BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_scope_v2 ON public.%I', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS platform_admin_v2 ON public.%I', t.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.table_name) THEN
      IF t.has_school_id THEN
        EXECUTE format('CREATE POLICY tenant_scope_v2 ON public.%I FOR ALL TO authenticated USING (private.auth_user_role() = ''super_admin'' OR school_id = private.auth_school_id()) WITH CHECK (private.auth_user_role() = ''super_admin'' OR school_id = private.auth_school_id())', t.table_name);
      ELSE
        EXECUTE format('CREATE POLICY platform_admin_v2 ON public.%I FOR ALL TO authenticated USING (private.auth_user_role() = ''super_admin'') WITH CHECK (private.auth_user_role() = ''super_admin'')', t.table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Restrictive role policies prevent the permissive tenant policies above from
-- granting students or parents write access through the public API.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='school_id' LOOP
    IF t.table_name = 'direct_messages' THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS parent_student_block_insert ON public.%I', t.table_name);
    EXECUTE format('CREATE POLICY parent_student_block_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() NOT IN (''parent'',''student''))', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS parent_student_block_update ON public.%I', t.table_name);
    EXECUTE format('CREATE POLICY parent_student_block_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() NOT IN (''parent'',''student'')) WITH CHECK (private.auth_user_role() NOT IN (''parent'',''student''))', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS parent_student_block_delete ON public.%I', t.table_name);
    EXECUTE format('CREATE POLICY parent_student_block_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() NOT IN (''parent'',''student''))', t.table_name);
  END LOOP;
END $$;

-- Only school administrators may create, edit, or delete school calendar events.
-- Tenant scope remains enforced by tenant_scope_v2; SELECT access is unchanged.
DROP POLICY IF EXISTS school_events_admin_insert ON public.school_events;
CREATE POLICY school_events_admin_insert ON public.school_events AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS school_events_admin_update ON public.school_events;
CREATE POLICY school_events_admin_update ON public.school_events AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS school_events_admin_delete ON public.school_events;
CREATE POLICY school_events_admin_delete ON public.school_events AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

-- Communication settings, notification templates, and queued messages contain
-- operational or recipient data; only school admins may mutate them.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['communication_settings', 'notification_templates', 'communication_queue'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_insert', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_insert', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_update', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() IN (''school_admin'', ''super_admin'')) WITH CHECK (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_update', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_delete', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_delete', table_name
    );
  END LOOP;
END $$;

-- Only school administrators may mutate library, transport, or bus assignment records.
-- These are RESTRICTIVE write policies so the broad tenant read policy cannot grant writes.
-- Keep lending copies consistent even when two issue requests race.
CREATE OR REPLACE FUNCTION private.enforce_library_loan_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  available_total integer;
  active_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'issued' OR NEW.returned_at IS NOT NULL OR NEW.returned_by IS NOT NULL THEN
      RAISE EXCEPTION 'New library loans must start as issued.';
    END IF;
    SELECT quantity INTO available_total
      FROM public.library_books
      WHERE id = NEW.book_id AND school_id = NEW.school_id
      FOR UPDATE;
    IF available_total IS NULL THEN
      RAISE EXCEPTION 'Library book does not belong to this school.';
    END IF;
    SELECT count(*) INTO active_count
      FROM public.library_loans
      WHERE book_id = NEW.book_id AND school_id = NEW.school_id AND status = 'issued';
    IF active_count >= available_total THEN
      RAISE EXCEPTION 'No available copies of this book.';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'issued' OR NEW.status <> 'returned' OR
     NEW.school_id <> OLD.school_id OR NEW.book_id <> OLD.book_id OR
     NEW.student_id <> OLD.student_id OR NEW.due_date <> OLD.due_date OR
     NEW.issued_at <> OLD.issued_at OR NEW.issued_by <> OLD.issued_by OR
     NEW.returned_at IS NULL OR NEW.returned_by IS NULL THEN
    RAISE EXCEPTION 'A library loan can only transition once from issued to returned.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_loans_integrity_trigger ON library_loans;
CREATE TRIGGER library_loans_integrity_trigger
BEFORE INSERT OR UPDATE ON library_loans
FOR EACH ROW EXECUTE FUNCTION private.enforce_library_loan_integrity();

CREATE OR REPLACE FUNCTION private.prevent_library_quantity_below_loans()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.quantity < OLD.quantity THEN
    SELECT count(*) INTO active_count
      FROM public.library_loans
      WHERE book_id = OLD.id AND school_id = OLD.school_id AND status = 'issued';
    IF NEW.quantity < active_count THEN
      RAISE EXCEPTION 'Book quantity cannot be lower than the number of active loans.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS library_books_quantity_guard ON library_books;
CREATE TRIGGER library_books_quantity_guard
BEFORE UPDATE OF quantity ON library_books
FOR EACH ROW EXECUTE FUNCTION private.prevent_library_quantity_below_loans();

-- Library loans contain student borrowing history; only school admins and platform admins can read/write.
DROP POLICY IF EXISTS library_loans_tenant_scope ON library_loans;
CREATE POLICY library_loans_tenant_scope ON library_loans FOR ALL TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id())
  WITH CHECK (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id());
DROP POLICY IF EXISTS library_loans_admin_select ON library_loans;
CREATE POLICY library_loans_admin_select ON library_loans AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS library_loans_admin_insert ON library_loans;
CREATE POLICY library_loans_admin_insert ON library_loans AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin') AND issued_by = private.auth_user_id());
DROP POLICY IF EXISTS library_loans_admin_update ON library_loans;
CREATE POLICY library_loans_admin_update ON library_loans AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin') AND returned_by = private.auth_user_id());
DROP POLICY IF EXISTS library_loans_no_delete ON library_loans;
CREATE POLICY library_loans_no_delete ON library_loans AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_loans TO authenticated, service_role;

DROP POLICY IF EXISTS library_books_admin_insert ON library_books;
CREATE POLICY library_books_admin_insert ON library_books AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS library_books_admin_update ON library_books;
CREATE POLICY library_books_admin_update ON library_books AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS library_books_admin_delete ON library_books;
CREATE POLICY library_books_admin_delete ON library_books AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS transport_routes_admin_insert ON transport_routes;
CREATE POLICY transport_routes_admin_insert ON transport_routes AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS transport_routes_admin_update ON transport_routes;
CREATE POLICY transport_routes_admin_update ON transport_routes AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS transport_routes_admin_delete ON transport_routes;
CREATE POLICY transport_routes_admin_delete ON transport_routes AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS bus_assignments_admin_insert ON bus_assignments;
CREATE POLICY bus_assignments_admin_insert ON bus_assignments AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS bus_assignments_admin_update ON bus_assignments;
CREATE POLICY bus_assignments_admin_update ON bus_assignments AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'))
  WITH CHECK (private.auth_user_role() IN ('school_admin', 'super_admin'));
DROP POLICY IF EXISTS bus_assignments_admin_delete ON bus_assignments;
CREATE POLICY bus_assignments_admin_delete ON bus_assignments AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (private.auth_user_role() IN ('school_admin', 'super_admin'));

DROP POLICY IF EXISTS users_role_read ON users;
CREATE POLICY users_role_read ON users AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR id = private.auth_user_id() OR
    (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin'));

DROP POLICY IF EXISTS classes_role_read ON classes;
CREATE POLICY classes_role_read ON classes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_class(id));
DROP POLICY IF EXISTS students_role_read ON students;
CREATE POLICY students_role_read ON students AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_student(id));

DROP POLICY IF EXISTS attendance_role_read ON attendance_records;
CREATE POLICY attendance_role_read ON attendance_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_class(class_id) AND private.auth_can_access_student(student_id));
DROP POLICY IF EXISTS marks_role_read ON student_marks;
CREATE POLICY marks_role_read ON student_marks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_class(class_id) AND private.auth_can_access_student(student_id));
DROP POLICY IF EXISTS fees_role_read ON fee_payments;
CREATE POLICY fees_role_read ON fee_payments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_student(student_id));
DROP POLICY IF EXISTS payroll_records_role_read ON payroll_records;
CREATE POLICY payroll_records_role_read ON payroll_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id() AND (private.auth_user_role() = 'accountant' OR user_id = private.auth_user_id()));
DROP POLICY IF EXISTS payroll_records_accountant_insert ON payroll_records;
CREATE POLICY payroll_records_accountant_insert ON payroll_records AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() IN ('accountant','super_admin'));
DROP POLICY IF EXISTS payroll_records_accountant_update ON payroll_records;
CREATE POLICY payroll_records_accountant_update ON payroll_records AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.auth_user_role() IN ('accountant','super_admin')) WITH CHECK (private.auth_user_role() IN ('accountant','super_admin'));
DROP POLICY IF EXISTS timetable_role_read ON timetable_slots;
CREATE POLICY timetable_role_read ON timetable_slots AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_class(class_id));
DROP POLICY IF EXISTS assignments_role_read ON assignments;
CREATE POLICY assignments_role_read ON assignments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_class(class_id));
DROP POLICY IF EXISTS submissions_role_read ON assignment_submissions;
CREATE POLICY submissions_role_read ON assignment_submissions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_can_access_student(student_id));

DROP POLICY IF EXISTS sessions_self_read ON user_sessions;
CREATE POLICY sessions_self_read ON user_sessions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR user_id = private.auth_user_id());

DROP POLICY IF EXISTS direct_messages_participants_read ON direct_messages;
CREATE POLICY direct_messages_participants_read ON direct_messages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR
    (school_id = private.auth_school_id() AND (private.auth_user_role() = 'school_admin' OR sender_id = private.auth_user_id() OR recipient_id = private.auth_user_id())));
DROP POLICY IF EXISTS direct_messages_sender_insert ON direct_messages;
CREATE POLICY direct_messages_sender_insert ON direct_messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.auth_user_role() = 'super_admin' OR
    (school_id = private.auth_school_id() AND sender_id = private.auth_user_id() AND sender_role = private.auth_user_role() AND
      private.auth_user_role() IN ('school_admin','teacher','parent')));
DROP POLICY IF EXISTS direct_messages_recipient_update ON direct_messages;
CREATE POLICY direct_messages_recipient_update ON direct_messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR
    (school_id = private.auth_school_id() AND recipient_id = private.auth_user_id()))
  WITH CHECK (private.auth_user_role() = 'super_admin' OR
    (school_id = private.auth_school_id() AND recipient_id = private.auth_user_id()));
DROP POLICY IF EXISTS direct_messages_admin_delete ON direct_messages;
CREATE POLICY direct_messages_admin_delete ON direct_messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.auth_user_role() = 'super_admin');

DROP POLICY IF EXISTS notice_reads_self_scope ON notice_reads;
CREATE POLICY notice_reads_self_scope ON notice_reads AS RESTRICTIVE FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND user_id = private.auth_user_id());
DROP POLICY IF EXISTS notice_reads_self_insert ON notice_reads;
CREATE POLICY notice_reads_self_insert ON notice_reads AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (school_id = private.auth_school_id() AND user_id = private.auth_user_id());

DROP POLICY IF EXISTS promotions_student_scope ON promotions;
CREATE POLICY promotions_student_scope ON promotions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant') OR
    (private.auth_user_role() = 'teacher' AND private.auth_can_access_class(class_from_id)) OR
    (private.auth_user_role() IN ('parent','student') AND private.auth_can_access_student(student_id)));
DROP POLICY IF EXISTS promotion_history_student_scope ON promotion_history;
CREATE POLICY promotion_history_student_scope ON promotion_history AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant') OR
    (private.auth_user_role() = 'teacher' AND private.auth_can_access_class(class_id)) OR
    (private.auth_user_role() IN ('parent','student') AND private.auth_can_access_student(student_id)));

DROP POLICY IF EXISTS support_tickets_owner_scope ON support_tickets;
CREATE POLICY support_tickets_owner_scope ON support_tickets AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR
    (school_id = private.auth_school_id() AND (private.auth_user_role() = 'school_admin' OR created_by_user_id = private.auth_user_id())));

DROP POLICY IF EXISTS communication_settings_admin_scope ON communication_settings;
CREATE POLICY communication_settings_admin_scope ON communication_settings AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin'));
DROP POLICY IF EXISTS communication_queue_admin_scope ON communication_queue;
CREATE POLICY communication_queue_admin_scope ON communication_queue AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant'));
DROP POLICY IF EXISTS notification_templates_admin_scope ON notification_templates;
CREATE POLICY notification_templates_admin_scope ON notification_templates AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin'));

-- Restrict writes to notification configuration and queue tables on fresh installs.
ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_queue ENABLE ROW LEVEL SECURITY;
DO $schoolos$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['communication_settings', 'notification_templates', 'communication_queue'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_insert', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_insert', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_update', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.auth_user_role() IN (''school_admin'', ''super_admin'')) WITH CHECK (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_update', table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_delete', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.auth_user_role() IN (''school_admin'', ''super_admin''))',
      table_name || '_admin_delete', table_name
    );
  END LOOP;
END $schoolos$;
DROP POLICY IF EXISTS staff_members_role_scope ON staff_members;
CREATE POLICY staff_members_role_scope ON staff_members AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant') OR user_id = private.auth_user_id());

DROP POLICY IF EXISTS bus_assignments_student_scope ON bus_assignments;
CREATE POLICY bus_assignments_student_scope ON bus_assignments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant') OR private.auth_can_access_student(student_id));
DROP POLICY IF EXISTS fee_ranges_student_scope ON fee_ranges;
CREATE POLICY fee_ranges_student_scope ON fee_ranges AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant') OR EXISTS (
    SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id
    WHERE s.school_id = fee_ranges.school_id AND c.grade_level BETWEEN fee_ranges.min_grade AND fee_ranges.max_grade
      AND private.auth_can_access_student(s.id)
  ));

DROP POLICY IF EXISTS teachers_role_scope ON teachers;
CREATE POLICY teachers_role_scope ON teachers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.auth_user_role() IN ('super_admin','school_admin','accountant') OR
    (private.auth_user_role() = 'teacher' AND user_id = private.auth_user_id()) OR
    (private.auth_user_role() IN ('parent','student') AND EXISTS (
      SELECT 1 FROM timetable_slots tt JOIN students s ON s.class_id = tt.class_id
      WHERE tt.teacher_id = teachers.id AND private.auth_can_access_student(s.id)
    )));

DROP POLICY IF EXISTS subscription_invoices_scope ON subscription_invoices;
CREATE POLICY subscription_invoices_scope ON subscription_invoices
  FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR school_id = private.auth_school_id());

DROP POLICY IF EXISTS broadcasts_target_scope ON platform_broadcasts;
CREATE POLICY broadcasts_target_scope ON platform_broadcasts
  FOR SELECT TO authenticated
  USING (private.auth_user_role() = 'super_admin' OR target_school_id = private.auth_school_id());

-- ==============================================================================
-- INITIAL SEED SCRIPT (STRICTLY ONE SUPER ADMIN & DEFAULT SETTINGS AS SPECIFIED)
-- ==============================================================================

-- Default Super Admin Settings
INSERT INTO super_admin_settings (
  id, trial_days, grace_days, platform_currency, read_only_after_expiry,
  require_super_admin_2fa, lockout_threshold, lockout_duration_minutes,
  session_timeout_minutes, log_security_events, backup_schedule, enabled_languages,
  academic_year_name, semester1_start, semester1_end, semester2_start, semester2_end
) VALUES (
  'default', 7, 7, 'USD', true,
  false, 5, 15,
  60, true, 'daily', ARRAY['en', 'so'],
  '2026-2027', '2026-09-01', '2027-01-20', '2027-02-01', '2027-06-30'
) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_school_branches_school_id_id
  ON school_branches (school_id, id);
CREATE INDEX IF NOT EXISTS idx_classes_branch_archive_order
  ON classes (school_id, branch_id, is_archived, id);
CREATE INDEX IF NOT EXISTS idx_subjects_school_id_id
  ON subjects (school_id, id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id_id
  ON teachers (school_id, id);
CREATE INDEX IF NOT EXISTS idx_school_notices_active_order
  ON school_notices (school_id, is_active, id);

CREATE OR REPLACE FUNCTION schoolos_notice_unread_count(
  p_school_id VARCHAR,
  p_user_id VARCHAR,
  p_role TEXT,
  p_class_ids TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.school_notices n
  WHERE n.school_id = p_school_id
    AND n.is_active = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = p_user_id
        AND u.role::TEXT = p_role
        AND (p_role = 'super_admin' OR u.school_id = p_school_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.notice_reads nr
      WHERE nr.school_id = n.school_id
        AND nr.notice_id = n.id
        AND nr.user_id = p_user_id
    )
    AND (
      p_role IN ('school_admin', 'super_admin', 'accountant')
      OR n.audience IN (
        'all',
        'school',
        CASE p_role
          WHEN 'teacher' THEN 'teachers'
          WHEN 'parent' THEN 'parents'
          ELSE 'students'
        END
      )
      OR n.audience = 'class'
        AND (
          n.class_id = ANY(COALESCE(p_class_ids, ARRAY[]::TEXT[]))
          OR p_role = 'parent' AND EXISTS (
            SELECT 1
            FROM public.students s
            JOIN public.users u ON u.id = p_user_id AND u.school_id = s.school_id
            WHERE s.school_id = p_school_id
              AND s.class_id = n.class_id
              AND (
                s.id = ANY(COALESCE(u.linked_student_ids, ARRAY[]::TEXT[]))
                OR s.father_phone IN (u.phone, u.parent_phone)
                OR s.mother_phone IN (u.phone, u.parent_phone)
              )
          )
          OR p_role = 'student' AND EXISTS (
            SELECT 1
            FROM public.students s
            JOIN public.users u ON u.id = p_user_id AND u.school_id = s.school_id
            WHERE s.school_id = p_school_id
              AND s.class_id = n.class_id
              AND (
                u.student_id = s.student_id
                OR REGEXP_REPLACE(u.id, '^usr-student-', 'std-') = s.id
              )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Default Subscription Plans
INSERT INTO plans (id, name, monthly_price, yearly_price, lifetime_price, modules, max_students, max_teachers, support_level)
VALUES
  ('basic', 'Basic', 39, 390, 1200, ARRAY['students', 'teachers', 'classes', 'attendance', 'fees', 'notices', 'reports'], 300, 20, 'community'),
  ('standard', 'Standard', 89, 890, 2400, ARRAY['students', 'teachers', 'classes', 'subjects', 'timetable', 'attendance', 'exams', 'fees', 'notices', 'messages', 'admissions', 'report_cards'], 1000, 60, 'standard'),
  ('premium', 'Premium Enterprise', 179, 1790, 4800, ARRAY['students', 'teachers', 'parents', 'classes', 'subjects', 'timetable', 'attendance', 'exams', 'assignments', 'fees', 'events', 'notices', 'messages', 'admissions', 'staff', 'reports', 'report_cards', 'settings', 'promotion', 'sms_templates'], 5000, 200, 'dedicated_24_7')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION school_dashboard_summary(p_school_id VARCHAR)
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', (SELECT COUNT(*) FROM students WHERE school_id = p_school_id),
      'totalTeachers', (SELECT COUNT(*) FROM teachers WHERE school_id = p_school_id),
      'attendanceRate', CASE WHEN (SELECT COUNT(*) FROM students WHERE school_id = p_school_id) = 0 THEN 0
        ELSE ROUND((SELECT COUNT(*) FROM attendance_records WHERE school_id = p_school_id AND date = CURRENT_DATE AND status = 'present')::NUMERIC * 100
          / (SELECT COUNT(*) FROM students WHERE school_id = p_school_id)) END,
      'todayCollection', COALESCE((SELECT SUM(amount_paid) FROM fee_payments WHERE school_id = p_school_id AND date = CURRENT_DATE), 0),
      'totalOutstanding', COALESCE((SELECT SUM(remaining_amount) FROM fee_payments WHERE school_id = p_school_id), 0)
    ),
    'totalClasses', (SELECT COUNT(*) FROM classes WHERE school_id = p_school_id),
    'todayAttendance', (SELECT COUNT(*) FROM attendance_records WHERE school_id = p_school_id AND date = CURRENT_DATE AND status = 'present'),
    'recentStudents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'studentId', s.student_id, 'firstName', s.first_name,
      'middleName', s.middle_name, 'lastName', s.last_name, 'classId', s.class_id, 'admissionDate', s.admission_date)
      ORDER BY s.created_at DESC) FROM (SELECT * FROM students WHERE school_id = p_school_id ORDER BY created_at DESC LIMIT 5) s), '[]'::JSONB),
    'recentPayments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'studentId', p.student_id, 'receiptNumber', p.receipt_number,
      'academicYear', p.academic_year, 'month', p.month, 'feeType', p.fee_type, 'amountDue', p.amount_due, 'amountPaid', p.amount_paid,
      'remainingAmount', p.remaining_amount, 'paymentMethod', p.payment_method, 'status', p.status, 'date', p.date)
      ORDER BY p.date DESC, p.created_at DESC) FROM (SELECT * FROM fee_payments WHERE school_id = p_school_id ORDER BY date DESC, created_at DESC LIMIT 5) p), '[]'::JSONB),
    'notices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'content', n.content, 'audience', n.audience,
      'isPinned', n.is_pinned, 'publishDate', n.publish_date, 'authorName', n.author_name, 'authorRole', n.author_role)
      ORDER BY n.is_pinned DESC, n.publish_date DESC) FROM (SELECT * FROM school_notices WHERE school_id = p_school_id ORDER BY is_pinned DESC, publish_date DESC LIMIT 3) n), '[]'::JSONB)
  );
$$;
REVOKE ALL ON FUNCTION school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION school_dashboard_summary(VARCHAR) TO service_role;

CREATE OR REPLACE FUNCTION super_admin_dashboard_summary()
RETURNS JSONB LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalSchools', (SELECT COUNT(*) FROM schools),
      'totalStudents', (SELECT COUNT(*) FROM students),
      'currentMonthRevenue', COALESCE((SELECT SUM(amount) FROM subscription_invoices WHERE status = 'paid' AND paid_date >= date_trunc('month', CURRENT_DATE)), 0),
      'openTickets', (SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('resolved', 'closed'))
    ),
    'subscriptionCounts', jsonb_build_object(
      'active', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'active'),
      'trial', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'trial'),
      'grace', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'grace'),
      'read_only', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'read_only'),
      'suspended', (SELECT COUNT(*) FROM school_subscriptions WHERE status = 'suspended')
    ),
    'revenueTrend', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(month_start, 'YYYY-MM'), 'revenue', revenue) ORDER BY month_start)
      FROM (SELECT months.month_start, COALESCE(SUM(invoice.amount) FILTER (WHERE invoice.status = 'paid'), 0) AS revenue
        FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS months(month_start)
        LEFT JOIN subscription_invoices invoice ON date_trunc('month', invoice.paid_date) = months.month_start
        GROUP BY months.month_start) revenue_by_month), '[]'::JSONB),
    'needsAttention', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code,
      'plan', sub.plan, 'status', sub.status, 'validUntil', sub.valid_until)
      ORDER BY s.name) FROM schools s JOIN school_subscriptions sub ON sub.school_id = s.id
      WHERE sub.status IN ('grace', 'read_only', 'suspended')), '[]'::JSONB)
  );
$$;
REVOKE ALL ON FUNCTION super_admin_dashboard_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION super_admin_dashboard_summary() TO service_role;

CREATE OR REPLACE FUNCTION schoolos_replace_class_timetable(p_school_id VARCHAR, p_class_id VARCHAR, p_slots JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS n(day_of_week VARCHAR, period_number INTEGER, teacher_id VARCHAR)
    JOIN public.timetable_slots old ON old.school_id = p_school_id AND old.day_of_week = n.day_of_week
      AND old.period_number = n.period_number AND old.teacher_id = n.teacher_id AND old.class_id <> p_class_id AND old.is_active = TRUE
  ) THEN RAISE EXCEPTION 'A teacher is already assigned to another class in that period.'; END IF;
  UPDATE public.timetable_slots SET is_active = FALSE WHERE school_id = p_school_id AND class_id = p_class_id AND is_active = TRUE;
  INSERT INTO public.timetable_slots (id, school_id, class_id, day_of_week, period_number, start_time, end_time, subject_id, teacher_id, room_number, is_active)
  SELECT id, p_school_id, p_class_id, day_of_week, period_number, start_time, end_time, subject_id, teacher_id, room_number, TRUE
  FROM jsonb_to_recordset(COALESCE(p_slots, '[]'::jsonb)) AS n(
    id VARCHAR, day_of_week VARCHAR, period_number INTEGER, start_time VARCHAR, end_time VARCHAR,
    subject_id VARCHAR, teacher_id VARCHAR, room_number VARCHAR
  ) ON CONFLICT (id) DO UPDATE SET day_of_week = EXCLUDED.day_of_week, period_number = EXCLUDED.period_number,
    start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, subject_id = EXCLUDED.subject_id,
    teacher_id = EXCLUDED.teacher_id, room_number = EXCLUDED.room_number, is_active = TRUE;
END;
$$;
REVOKE ALL ON FUNCTION schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION schoolos_swap_timetable_slots(p_school_id VARCHAR, p_first_id VARCHAR, p_second_id VARCHAR) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE first_slot public.timetable_slots%ROWTYPE; second_slot public.timetable_slots%ROWTYPE;
BEGIN
  SELECT * INTO first_slot FROM public.timetable_slots WHERE id = p_first_id AND school_id = p_school_id AND is_active = TRUE FOR UPDATE;
  SELECT * INTO second_slot FROM public.timetable_slots WHERE id = p_second_id AND school_id = p_school_id AND is_active = TRUE FOR UPDATE;
  IF first_slot.id IS NULL OR second_slot.id IS NULL OR first_slot.id = second_slot.id THEN RAISE EXCEPTION 'Choose two different active timetable slots in this school.'; END IF;
  IF EXISTS (SELECT 1 FROM public.timetable_slots other WHERE other.school_id = p_school_id AND other.is_active = TRUE AND other.id NOT IN (p_first_id, p_second_id)
    AND ((other.teacher_id = first_slot.teacher_id AND other.day_of_week = second_slot.day_of_week AND other.period_number = second_slot.period_number)
      OR (other.teacher_id = second_slot.teacher_id AND other.day_of_week = first_slot.day_of_week AND other.period_number = first_slot.period_number)))
    THEN RAISE EXCEPTION 'The swap would create a teacher schedule conflict.'; END IF;
  UPDATE public.timetable_slots SET day_of_week = second_slot.day_of_week, period_number = second_slot.period_number,
    start_time = second_slot.start_time, end_time = second_slot.end_time WHERE id = p_first_id;
  UPDATE public.timetable_slots SET day_of_week = first_slot.day_of_week, period_number = first_slot.period_number,
    start_time = first_slot.start_time, end_time = first_slot.end_time WHERE id = p_second_id;
END;
$$;
REVOKE ALL ON FUNCTION schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Note: The Super Administrator is securely initialized at application startup
-- from environment variables SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (scrypt hashed),
-- with must_change_password = true, adhering to strict zero-hardcoded-credential policies.

-- Log System Initialization
INSERT INTO audit_logs (
  id, action, category, user_id, user_name, user_role, details, severity
) VALUES (
  'log-sys-init-01', 'SYSTEM_INITIALIZATION', 'security', 'system', 'SchoolOS Platform Engine', 'super_admin',
  'SchoolOS Database initialized successfully with default plans and system settings.', 'info'
) ON CONFLICT (id) DO NOTHING;


-- Applied production migrations 025-027 and 030-039.
-- Harden every application SECURITY DEFINER function against search_path shadowing.
-- All application tables and enum types are schema-qualified below.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_bulk_import(p_payload JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.classes (id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee)
  SELECT id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee
  FROM jsonb_to_recordset(COALESCE(p_payload->'classes', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, name VARCHAR, grade_level INTEGER,
    section VARCHAR, room_number VARCHAR, capacity INTEGER, monthly_fee NUMERIC
  );

  INSERT INTO public.students (id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    admission_date, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, status, pin_hash)
  SELECT id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    CURRENT_DATE, date_of_birth, student_phone, parent_phone, NULL, class_id, section, 'active', pin_hash
  FROM jsonb_to_recordset(COALESCE(p_payload->'students', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, student_id VARCHAR, first_name VARCHAR,
    middle_name VARCHAR, last_name VARCHAR, gender VARCHAR, date_of_birth DATE, student_phone VARCHAR,
    parent_phone VARCHAR, class_id VARCHAR, section VARCHAR, pin_hash TEXT
  );

  INSERT INTO public.users AS existing_user (id, school_id, branch_id, role, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, password_hash, is_blocked, failed_login_attempts)
  SELECT id, school_id, branch_id, role::public.user_role_enum, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, '', false, 0
  FROM jsonb_to_recordset(COALESCE(p_payload->'users', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, role VARCHAR, full_name VARCHAR, phone VARCHAR,
    parent_phone VARCHAR, student_id VARCHAR, linked_student_ids TEXT[], pin_hash TEXT
  )
  ON CONFLICT (id) DO UPDATE SET
    linked_student_ids = EXCLUDED.linked_student_ids,
    pin_hash = EXCLUDED.pin_hash,
    full_name = CASE WHEN existing_user.role = 'parent' AND existing_user.full_name = '' THEN EXCLUDED.full_name ELSE existing_user.full_name END;

  INSERT INTO public.audit_logs (id, action, category, school_id, school_name, user_id, user_name, user_role, details, severity)
  SELECT id, action, category, school_id, school_name, user_id, user_name, user_role::public.user_role_enum, details, 'info'
  FROM jsonb_to_recordset(COALESCE(p_payload->'audit_logs', '[]'::jsonb)) AS x(
    id VARCHAR, action VARCHAR, category VARCHAR, school_id VARCHAR, school_name VARCHAR,
    user_id VARCHAR, user_name VARCHAR, user_role VARCHAR, details TEXT
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.schoolos_save_subject_assignments(
  p_school_id VARCHAR, p_subject_id VARCHAR, p_assignments JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.class_subjects
  SET is_active = FALSE
  WHERE school_id = p_school_id AND subject_id = p_subject_id;

  INSERT INTO public.class_subjects (
    id, school_id, class_id, subject_id, teacher_id, periods_per_week,
    small_exam_enabled, big_exam_enabled, is_active
  )
  SELECT id, p_school_id, class_id, p_subject_id, teacher_id, periods_per_week,
    small_exam_enabled, big_exam_enabled, TRUE
  FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS a(
    id VARCHAR, class_id VARCHAR, teacher_id VARCHAR, periods_per_week INTEGER,
    small_exam_enabled BOOLEAN, big_exam_enabled BOOLEAN
  )
  ON CONFLICT (school_id, class_id, subject_id) DO UPDATE SET
    teacher_id = EXCLUDED.teacher_id,
    periods_per_week = EXCLUDED.periods_per_week,
    small_exam_enabled = EXCLUDED.small_exam_enabled,
    big_exam_enabled = EXCLUDED.big_exam_enabled,
    is_active = TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.super_admin_dashboard_summary()
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'metrics', jsonb_build_object(
      'totalSchools', (SELECT COUNT(*) FROM public.schools),
      'totalStudents', (SELECT COUNT(*) FROM public.students),
      'currentMonthRevenue', COALESCE((
        SELECT SUM(amount) FROM public.subscription_invoices
        WHERE status = 'paid' AND paid_date >= date_trunc('month', CURRENT_DATE)
      ), 0),
      'openTickets', (SELECT COUNT(*) FROM public.support_tickets WHERE status NOT IN ('resolved', 'closed'))
    ),
    'subscriptionCounts', jsonb_build_object(
      'active', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'active'),
      'trial', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'trial'),
      'grace', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'grace'),
      'read_only', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'read_only'),
      'suspended', (SELECT COUNT(*) FROM public.school_subscriptions WHERE status = 'suspended')
    ),
    'revenueTrend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(month_start, 'YYYY-MM'), 'revenue', revenue) ORDER BY month_start)
      FROM (
        SELECT months.month_start, COALESCE(SUM(invoice.amount) FILTER (WHERE invoice.status = 'paid'), 0) AS revenue
        FROM generate_series(
          date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
          date_trunc('month', CURRENT_DATE),
          INTERVAL '1 month'
        ) AS months(month_start)
        LEFT JOIN public.subscription_invoices invoice
          ON date_trunc('month', invoice.paid_date) = months.month_start
        GROUP BY months.month_start
      ) revenue_by_month
    ), '[]'::JSONB),
    'needsAttention', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'code', s.code,
        'plan', sub.plan, 'status', sub.status, 'validUntil', sub.valid_until
      ) ORDER BY s.name)
      FROM public.schools s
      JOIN public.school_subscriptions sub ON sub.school_id = s.id
      WHERE sub.status IN ('grace', 'read_only', 'suspended')
    ), '[]'::JSONB)
  );
$$;

-- These bodies already schema-qualify every application table.
ALTER FUNCTION public.school_dashboard_summary(VARCHAR) SET search_path = '';
ALTER FUNCTION public.schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) SET search_path = '';
ALTER FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) SET search_path = '';
ALTER FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) SET search_path = '';

REVOKE ALL ON FUNCTION public.schoolos_bulk_import(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.super_admin_dashboard_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.schoolos_bulk_import(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_save_subject_assignments(VARCHAR, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_dashboard_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_notice_unread_count(VARCHAR, VARCHAR, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_replace_class_timetable(VARCHAR, VARCHAR, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_swap_timetable_slots(VARCHAR, VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;


-- Allocate fee receipt numbers atomically across concurrent requests and server instances.
BEGIN;

CREATE TABLE IF NOT EXISTS public.fee_receipt_sequences (
  id VARCHAR(160) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year VARCHAR(50) NOT NULL,
  next_value BIGINT NOT NULL CHECK (next_value >= 1),
  UNIQUE (school_id, academic_year)
);

ALTER TABLE public.fee_receipt_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_receipt_sequences_deny_client ON public.fee_receipt_sequences;
CREATE POLICY fee_receipt_sequences_deny_client ON public.fee_receipt_sequences
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON TABLE public.fee_receipt_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fee_receipt_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_next_fee_receipt(
  p_school_id VARCHAR,
  p_academic_year VARCHAR
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  allocated_value BIGINT;
BEGIN
  IF p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_academic_year IS NULL OR btrim(p_academic_year) = '' THEN
    RAISE EXCEPTION 'School and academic year are required for receipt allocation.';
  END IF;

  INSERT INTO public.fee_receipt_sequences AS current_sequence (
    id, school_id, academic_year, next_value
  )
  SELECT
    p_school_id || ':' || p_academic_year,
    p_school_id,
    p_academic_year,
    COALESCE(MAX(substring(payment.receipt_number FROM '([0-9]+)$')::BIGINT), 0) + 1
  FROM public.fee_payments payment
  WHERE payment.school_id = p_school_id
    AND payment.academic_year = p_academic_year
  ON CONFLICT (school_id, academic_year)
  DO UPDATE SET next_value = GREATEST(current_sequence.next_value + 1, EXCLUDED.next_value)
  RETURNING next_value INTO allocated_value;

  RETURN allocated_value;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_next_fee_receipt(VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_next_fee_receipt(VARCHAR, VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;


-- Keep bulk student imports aligned with the two-guardian student model.
-- Preserve parent PIN hashes when new siblings are imported, and retain the
-- hardened empty search_path established by migration 025.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_bulk_import(p_payload JSONB) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.classes (id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee)
  SELECT id, school_id, branch_id, name, grade_level, section, room_number, capacity, monthly_fee
  FROM jsonb_to_recordset(COALESCE(p_payload->'classes', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, name VARCHAR, grade_level INTEGER,
    section VARCHAR, room_number VARCHAR, capacity INTEGER, monthly_fee NUMERIC
  );

  INSERT INTO public.students (id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    admission_date, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, status, pin_hash)
  SELECT id, school_id, branch_id, student_id, first_name, middle_name, last_name, gender,
    CURRENT_DATE, date_of_birth, student_phone, father_phone, mother_phone, class_id, section, 'active', pin_hash
  FROM jsonb_to_recordset(COALESCE(p_payload->'students', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, student_id VARCHAR, first_name VARCHAR,
    middle_name VARCHAR, last_name VARCHAR, gender VARCHAR, date_of_birth DATE, student_phone VARCHAR,
    father_phone VARCHAR, mother_phone VARCHAR, class_id VARCHAR, section VARCHAR, pin_hash TEXT
  );

  INSERT INTO public.users (id, school_id, branch_id, role, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, password_hash, is_blocked, failed_login_attempts)
  SELECT id, school_id, branch_id, role::public.user_role_enum, full_name, phone, parent_phone, student_id,
    linked_student_ids, pin_hash, '', false, 0
  FROM jsonb_to_recordset(COALESCE(p_payload->'users', '[]'::jsonb)) AS x(
    id VARCHAR, school_id VARCHAR, branch_id VARCHAR, role VARCHAR, full_name VARCHAR, phone VARCHAR,
    parent_phone VARCHAR, student_id VARCHAR, linked_student_ids TEXT[], pin_hash TEXT
  )
  ON CONFLICT (id) DO UPDATE SET
    linked_student_ids = EXCLUDED.linked_student_ids,
    pin_hash = CASE
      WHEN public.users.pin_hash IS NULL OR public.users.pin_hash = '' THEN EXCLUDED.pin_hash
      ELSE public.users.pin_hash
    END,
    full_name = CASE
      WHEN public.users.role = 'parent' AND public.users.full_name = '' THEN EXCLUDED.full_name
      ELSE public.users.full_name
    END,
    phone = CASE WHEN public.users.phone IS NULL OR public.users.phone = '' THEN EXCLUDED.phone ELSE public.users.phone END,
    parent_phone = CASE WHEN public.users.parent_phone IS NULL OR public.users.parent_phone = '' THEN EXCLUDED.parent_phone ELSE public.users.parent_phone END;

  INSERT INTO public.audit_logs (id, action, category, school_id, school_name, user_id, user_name, user_role, details, severity)
  SELECT id, action, category, school_id, school_name, user_id, user_name, user_role::public.user_role_enum, details, 'info'
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


-- Settle platform subscription invoices atomically and idempotently.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_mark_subscription_invoice_paid(p_invoice_id VARCHAR)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invoice_row public.subscription_invoices%ROWTYPE;
  receipt_code VARCHAR(80);
BEGIN
  SELECT * INTO invoice_row
  FROM public.subscription_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF invoice_row.status = 'paid' THEN
    RETURN invoice_row;
  END IF;

  receipt_code := 'SUB-REC-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  UPDATE public.subscription_invoices
  SET status = 'paid',
      paid_date = CURRENT_DATE,
      receipt_number = receipt_code
  WHERE id = p_invoice_id
  RETURNING * INTO invoice_row;

  UPDATE public.school_subscriptions
  SET status = 'active',
      valid_until = CASE
        WHEN invoice_row.cadence = 'lifetime' THEN NULL
        WHEN invoice_row.cadence = 'yearly' THEN
          GREATEST(COALESCE(valid_until, now()), now()) + interval '1 year'
        WHEN invoice_row.cadence = 'monthly' THEN
          GREATEST(COALESCE(valid_until, now()), now()) + interval '1 month'
        ELSE valid_until
      END,
      price_paid = COALESCE(price_paid, 0) + invoice_row.amount,
      last_billed_date = now(),
      updated_at = now()
  WHERE school_id = invoice_row.school_id;

  RETURN invoice_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_mark_subscription_invoice_paid(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_mark_subscription_invoice_paid(VARCHAR) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;


-- Prevent concurrent invoice generation from creating multiple unpaid invoices
-- for the same school. A new invoice can be generated after the prior one is paid.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_one_unpaid_per_school
  ON public.subscription_invoices (school_id)
  WHERE status = 'unpaid';
COMMIT;

-- Lifetime subscriptions remain active without changing their required valid_until
-- value; the schema intentionally keeps that column NOT NULL.
BEGIN;
CREATE OR REPLACE FUNCTION public.schoolos_mark_subscription_invoice_paid(p_invoice_id VARCHAR)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invoice_row public.subscription_invoices%ROWTYPE;
  receipt_code VARCHAR(80);
BEGIN
  SELECT * INTO invoice_row
  FROM public.subscription_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF invoice_row.status = 'paid' THEN RETURN invoice_row; END IF;

  receipt_code := 'SUB-REC-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  UPDATE public.subscription_invoices
  SET status = 'paid', paid_date = CURRENT_DATE, receipt_number = receipt_code
  WHERE id = p_invoice_id
  RETURNING * INTO invoice_row;

  UPDATE public.school_subscriptions
  SET status = 'active',
      valid_until = CASE
        WHEN invoice_row.cadence = 'lifetime' THEN valid_until
        WHEN invoice_row.cadence = 'yearly' THEN GREATEST(valid_until, now()) + interval '1 year'
        WHEN invoice_row.cadence = 'monthly' THEN GREATEST(valid_until, now()) + interval '1 month'
        ELSE valid_until
      END,
      price_paid = COALESCE(price_paid, 0) + invoice_row.amount,
      last_billed_date = now(),
      updated_at = now()
  WHERE school_id = invoice_row.school_id;
  RETURN invoice_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_mark_subscription_invoice_paid(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_mark_subscription_invoice_paid(VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- P2: introduce tenant-scoped inventory with atomic stock movement history.
BEGIN;
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id varchar(80) PRIMARY KEY,
  school_id varchar(80) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  sku varchar(80),
  category varchar(100) NOT NULL DEFAULT 'General',
  unit varchar(40) NOT NULL DEFAULT 'unit',
  quantity_on_hand numeric(14,2) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level numeric(14,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  location varchar(160),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar(80) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_school_sku_unique UNIQUE (school_id, sku),
  CONSTRAINT inventory_items_id_school_unique UNIQUE (id, school_id)
);
CREATE INDEX IF NOT EXISTS inventory_items_school_active_idx
  ON public.inventory_items (school_id, is_active, name);
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id varchar(80) PRIMARY KEY,
  school_id varchar(80) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id varchar(80) NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  transaction_type varchar(20) NOT NULL CHECK (transaction_type IN ('stock_in','stock_out','adjustment')),
  quantity_delta numeric(14,2) NOT NULL CHECK (quantity_delta <> 0),
  quantity_before numeric(14,2) NOT NULL CHECK (quantity_before >= 0),
  quantity_after numeric(14,2) NOT NULL CHECK (quantity_after >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference varchar(160),
  note text,
  performed_by varchar(80) REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transaction_item_school_fk
    FOREIGN KEY (item_id, school_id) REFERENCES public.inventory_items(id, school_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS inventory_transactions_school_created_idx
  ON public.inventory_transactions (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_transactions_item_created_idx
  ON public.inventory_transactions (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_items_created_by_idx
  ON public.inventory_items (created_by);
CREATE INDEX IF NOT EXISTS inventory_transactions_item_school_idx
  ON public.inventory_transactions (item_id, school_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_performed_by_idx
  ON public.inventory_transactions (performed_by);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_items_school_read ON public.inventory_items;
CREATE POLICY inventory_items_school_read ON public.inventory_items
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
DROP POLICY IF EXISTS inventory_items_school_write ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_school_insert ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_school_update ON public.inventory_items;
DROP POLICY IF EXISTS inventory_items_school_delete ON public.inventory_items;
CREATE POLICY inventory_items_school_insert ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');
CREATE POLICY inventory_items_school_update ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin')
  WITH CHECK (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');
CREATE POLICY inventory_items_school_delete ON public.inventory_items
  FOR DELETE TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() = 'school_admin');
DROP POLICY IF EXISTS inventory_transactions_school_read ON public.inventory_transactions;
CREATE POLICY inventory_transactions_school_read ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (school_id = private.auth_school_id() AND private.auth_user_role() IN ('school_admin','accountant'));
CREATE OR REPLACE FUNCTION public.schoolos_adjust_inventory(
  p_school_id varchar,
  p_item_id varchar,
  p_transaction_type varchar,
  p_quantity numeric,
  p_unit_cost numeric DEFAULT 0,
  p_reference varchar DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_performed_by varchar DEFAULT NULL
) RETURNS public.inventory_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  item_row public.inventory_items%ROWTYPE;
  delta numeric(14,2);
  result_row public.inventory_transactions%ROWTYPE;
BEGIN
  IF p_transaction_type NOT IN ('stock_in','stock_out','adjustment') OR p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Invalid inventory movement.';
  END IF;
  IF p_transaction_type IN ('stock_in','stock_out') AND p_quantity < 0 THEN
    RAISE EXCEPTION 'Stock-in and stock-out quantities must be positive.';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN RAISE EXCEPTION 'Unit cost cannot be negative.'; END IF;
  SELECT * INTO item_row FROM public.inventory_items
    WHERE id = p_item_id AND school_id = p_school_id AND is_active = true
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found.'; END IF;
  delta := CASE WHEN p_transaction_type = 'stock_out' THEN -p_quantity ELSE p_quantity END;
  IF item_row.quantity_on_hand + delta < 0 THEN RAISE EXCEPTION 'Insufficient stock.'; END IF;
  UPDATE public.inventory_items
    SET quantity_on_hand = quantity_on_hand + delta,
        unit_cost = CASE WHEN p_unit_cost > 0 THEN p_unit_cost ELSE unit_cost END,
        updated_at = now()
    WHERE id = p_item_id AND school_id = p_school_id;
  INSERT INTO public.inventory_transactions (
    id, school_id, item_id, transaction_type, quantity_delta,
    quantity_before, quantity_after, unit_cost, reference, note, performed_by
  ) VALUES (
    'itx-' || replace(gen_random_uuid()::text, '-', ''), p_school_id, p_item_id,
    p_transaction_type, delta, item_row.quantity_on_hand,
    item_row.quantity_on_hand + delta, COALESCE(NULLIF(p_unit_cost, 0), item_row.unit_cost),
    NULLIF(p_reference, ''), NULLIF(p_note, ''), p_performed_by
  ) RETURNING * INTO result_row;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_adjust_inventory(varchar,varchar,varchar,numeric,numeric,varchar,text,varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_adjust_inventory(varchar,varchar,varchar,numeric,numeric,varchar,text,varchar) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- P2: durable notification attempts, delayed retries, and safe worker claims.
BEGIN;
ALTER TABLE public.communication_queue
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id varchar(200);
CREATE INDEX IF NOT EXISTS communication_queue_due_idx
  ON public.communication_queue (next_attempt_at, created_at)
  WHERE status = 'queued';
CREATE OR REPLACE FUNCTION public.schoolos_claim_communication_queue()
RETURNS SETOF public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.communication_queue
    WHERE status = 'queued' AND attempt_count < max_attempts AND next_attempt_at <= now()
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.communication_queue AS q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      last_attempt_at = now(), error_message = NULL
  WHERE q.id = (SELECT id FROM candidate)
  RETURNING q.*;
END;
$$;
CREATE OR REPLACE FUNCTION public.schoolos_complete_communication_queue(
  p_id varchar, p_success boolean, p_error_message text DEFAULT NULL,
  p_provider_message_id varchar DEFAULT NULL
) RETURNS public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result_row public.communication_queue%ROWTYPE;
BEGIN
  UPDATE public.communication_queue AS q
  SET status = CASE WHEN p_success THEN 'sent'
                    WHEN q.attempt_count >= q.max_attempts THEN 'failed'
                    ELSE 'queued' END,
      sent_at = CASE WHEN p_success THEN now() ELSE q.sent_at END,
      provider_message_id = CASE WHEN p_success THEN p_provider_message_id ELSE q.provider_message_id END,
      error_message = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error_message, 'Provider delivery failed.'), 1000) END,
      next_attempt_at = CASE WHEN p_success OR q.attempt_count >= q.max_attempts THEN q.next_attempt_at
        ELSE now() + CASE q.attempt_count
          WHEN 1 THEN interval '1 minute'
          WHEN 2 THEN interval '5 minutes'
          WHEN 3 THEN interval '15 minutes'
          ELSE interval '1 hour' END END
  WHERE q.id = p_id AND q.status = 'processing'
  RETURNING q.* INTO result_row;
  RETURN result_row;
END;
$$;
CREATE OR REPLACE FUNCTION public.schoolos_retry_communication_queue(p_id varchar, p_school_id varchar)
RETURNS public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result_row public.communication_queue%ROWTYPE;
BEGIN
  UPDATE public.communication_queue
  SET status = 'queued', attempt_count = 0, next_attempt_at = now(),
      last_attempt_at = NULL, error_message = NULL
  WHERE id = p_id AND school_id = p_school_id AND status = 'failed'
  RETURNING * INTO result_row;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_claim_communication_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolos_retry_communication_queue(varchar,varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_claim_communication_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) TO service_role;
GRANT EXECUTE ON FUNCTION public.schoolos_retry_communication_queue(varchar,varchar) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Count late arrivals as attending and exclude formally excused students from the attendance denominator.
BEGIN;
CREATE OR REPLACE FUNCTION public.school_dashboard_summary(p_school_id character varying)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', (
        SELECT COUNT(*) FROM public.students
        WHERE school_id = p_school_id AND status = 'active'
      ),
      'totalTeachers', (
        SELECT COUNT(*) FROM public.teachers
        WHERE school_id = p_school_id AND status = 'active'
      ),
      'attendanceRate', CASE
        WHEN (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active') = 0 THEN 0
        ELSE ROUND(
          (
            SELECT COUNT(*)
            FROM public.attendance_records
            WHERE school_id = p_school_id
              AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
              AND status = 'present'
          )::NUMERIC * 100
          / (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active')
        )
      END,
      'todayCollection', COALESCE((
        SELECT SUM(amount_paid)
        FROM public.fee_payments
        WHERE school_id = p_school_id
          AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
          AND voided_at IS NULL
      ), 0),
      'totalOutstanding', COALESCE((
        SELECT SUM(CASE WHEN voided_at IS NOT NULL THEN amount_due ELSE remaining_amount END)
        FROM public.fee_payments
        WHERE school_id = p_school_id
      ), 0)
    ),
    'totalClasses', (
      SELECT COUNT(*) FROM public.classes
      WHERE school_id = p_school_id AND is_archived = FALSE
    ),
    'todayAttendance', (
      SELECT COUNT(*)
      FROM public.attendance_records
      WHERE school_id = p_school_id
        AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        AND status IN ('present', 'late')
    ),
    'recentStudents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'studentId', s.student_id, 'firstName', s.first_name,
        'middleName', s.middle_name, 'lastName', s.last_name, 'classId', s.class_id,
        'admissionDate', s.admission_date
      ) ORDER BY s.created_at DESC)
      FROM (
        SELECT * FROM public.students
        WHERE school_id = p_school_id
        ORDER BY created_at DESC
        LIMIT 5
      ) s
    ), '[]'::JSONB),
    'recentPayments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'studentId', p.student_id, 'receiptNumber', p.receipt_number,
        'academicYear', p.academic_year, 'month', p.month, 'feeType', p.fee_type,
        'amountDue', p.amount_due, 'amountPaid', p.amount_paid,
        'remainingAmount', p.remaining_amount, 'paymentMethod', p.payment_method,
        'status', p.status, 'date', p.date
      ) ORDER BY p.date DESC, p.created_at DESC)
      FROM (
        SELECT * FROM public.fee_payments
        WHERE school_id = p_school_id AND voided_at IS NULL
        ORDER BY date DESC, created_at DESC
        LIMIT 5
      ) p
    ), '[]'::JSONB),
    'notices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'content', n.content, 'audience', n.audience,
        'isPinned', n.is_pinned, 'publishDate', n.publish_date,
        'authorName', n.author_name, 'authorRole', n.author_role
      ) ORDER BY n.is_pinned DESC, n.publish_date DESC)
      FROM (
        SELECT * FROM public.school_notices
        WHERE school_id = p_school_id
          AND is_active = TRUE
          AND publish_date <= (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        ORDER BY is_pinned DESC, publish_date DESC
        LIMIT 3
      ) n
    ), '[]'::JSONB)
  );
$function$
;
REVOKE ALL ON FUNCTION public.school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Recover notification rows left in processing if a worker process dies mid-request.
BEGIN;
CREATE OR REPLACE FUNCTION public.schoolos_claim_communication_queue()
RETURNS SETOF public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.communication_queue
  SET status = 'failed',
      error_message = 'Delivery worker lease expired after the final attempt.'
  WHERE status = 'processing'
    AND attempt_count >= max_attempts
    AND last_attempt_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.communication_queue
    WHERE (
      (status = 'queued' AND next_attempt_at <= now())
      OR (status = 'processing' AND last_attempt_at < now() - interval '5 minutes' AND attempt_count < max_attempts)
    )
    ORDER BY next_attempt_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.communication_queue AS q
  SET status = 'processing', attempt_count = q.attempt_count + 1,
      last_attempt_at = now(), error_message = NULL
  WHERE q.id = (SELECT id FROM candidate)
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_claim_communication_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_claim_communication_queue() TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Exclude inactive students from attendance aggregates and voided payments from outstanding balances.
BEGIN;
CREATE OR REPLACE FUNCTION public.school_dashboard_summary(p_school_id character varying)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'stats', jsonb_build_object(
      'totalStudents', (
        SELECT COUNT(*) FROM public.students
        WHERE school_id = p_school_id AND status = 'active'
      ),
      'totalTeachers', (
        SELECT COUNT(*) FROM public.teachers
        WHERE school_id = p_school_id AND status = 'active'
      ),
      'attendanceRate', CASE
        WHEN (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active') = 0 THEN 0
        ELSE ROUND(
          (
            SELECT COUNT(*)
            FROM public.attendance_records
            WHERE school_id = p_school_id
              AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
              AND status IN ('present', 'late')
              AND EXISTS (
                SELECT 1 FROM public.students AS active_student
                WHERE active_student.id = public.attendance_records.student_id
                  AND active_student.school_id = p_school_id
                  AND active_student.status = 'active'
              )
          )::NUMERIC * 100
          / GREATEST(1,
            (SELECT COUNT(*) FROM public.students WHERE school_id = p_school_id AND status = 'active')
            - (SELECT COUNT(*) FROM public.attendance_records
               WHERE school_id = p_school_id
                 AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
                 AND status = 'excused'
                 AND EXISTS (
                   SELECT 1 FROM public.students AS active_student
                   WHERE active_student.id = public.attendance_records.student_id
                     AND active_student.school_id = p_school_id
                     AND active_student.status = 'active'
                 )))
        )
      END,
      'todayCollection', COALESCE((
        SELECT SUM(amount_paid)
        FROM public.fee_payments
        WHERE school_id = p_school_id
          AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
          AND voided_at IS NULL
      ), 0),
      'totalOutstanding', COALESCE((
        SELECT SUM(remaining_amount)
        FROM public.fee_payments
        WHERE school_id = p_school_id AND voided_at IS NULL
      ), 0)
    ),
    'totalClasses', (
      SELECT COUNT(*) FROM public.classes
      WHERE school_id = p_school_id AND is_archived = FALSE
    ),
    'todayAttendance', (
      SELECT COUNT(*)
      FROM public.attendance_records
      WHERE school_id = p_school_id
        AND date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        AND status IN ('present', 'late')
              AND EXISTS (
                SELECT 1 FROM public.students AS active_student
                WHERE active_student.id = public.attendance_records.student_id
                  AND active_student.school_id = p_school_id
                  AND active_student.status = 'active'
              )
    ),
    'recentStudents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'studentId', s.student_id, 'firstName', s.first_name,
        'middleName', s.middle_name, 'lastName', s.last_name, 'classId', s.class_id,
        'admissionDate', s.admission_date
      ) ORDER BY s.created_at DESC)
      FROM (
        SELECT * FROM public.students
        WHERE school_id = p_school_id
        ORDER BY created_at DESC
        LIMIT 5
      ) s
    ), '[]'::JSONB),
    'recentPayments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'studentId', p.student_id, 'receiptNumber', p.receipt_number,
        'academicYear', p.academic_year, 'month', p.month, 'feeType', p.fee_type,
        'amountDue', p.amount_due, 'amountPaid', p.amount_paid,
        'remainingAmount', p.remaining_amount, 'paymentMethod', p.payment_method,
        'status', p.status, 'date', p.date
      ) ORDER BY p.date DESC, p.created_at DESC)
      FROM (
        SELECT * FROM public.fee_payments
        WHERE school_id = p_school_id AND voided_at IS NULL
        ORDER BY date DESC, created_at DESC
        LIMIT 5
      ) p
    ), '[]'::JSONB),
    'notices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'title', n.title, 'content', n.content, 'audience', n.audience,
        'isPinned', n.is_pinned, 'publishDate', n.publish_date,
        'authorName', n.author_name, 'authorRole', n.author_role
      ) ORDER BY n.is_pinned DESC, n.publish_date DESC)
      FROM (
        SELECT * FROM public.school_notices
        WHERE school_id = p_school_id
          AND is_active = TRUE
          AND publish_date <= (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date
        ORDER BY is_pinned DESC, publish_date DESC
        LIMIT 3
      ) n
    ), '[]'::JSONB)
  );
$function$
;
REVOKE ALL ON FUNCTION public.school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.school_dashboard_summary(VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- The delivery worker needs an explicit processing lease state while it sends.
ALTER TYPE public.comm_status_enum ADD VALUE IF NOT EXISTS 'processing';

-- CASE expressions resolve to text unless explicitly cast back to the queue enum.
BEGIN;
CREATE OR REPLACE FUNCTION public.schoolos_complete_communication_queue(
  p_id varchar, p_success boolean, p_error_message text DEFAULT NULL,
  p_provider_message_id varchar DEFAULT NULL
) RETURNS public.communication_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  result_row public.communication_queue%ROWTYPE;
BEGIN
  UPDATE public.communication_queue AS q
  SET status = (CASE WHEN p_success THEN 'sent'
                     WHEN q.attempt_count >= q.max_attempts THEN 'failed'
                     ELSE 'queued' END)::public.comm_status_enum,
      sent_at = CASE WHEN p_success THEN now() ELSE q.sent_at END,
      provider_message_id = CASE WHEN p_success THEN p_provider_message_id ELSE q.provider_message_id END,
      error_message = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error_message, 'Provider delivery failed.'), 1000) END,
      next_attempt_at = CASE WHEN p_success OR q.attempt_count >= q.max_attempts THEN q.next_attempt_at
        ELSE now() + CASE q.attempt_count
          WHEN 1 THEN interval '1 minute'
          WHEN 2 THEN interval '5 minutes'
          WHEN 3 THEN interval '15 minutes'
          ELSE interval '1 hour' END END
  WHERE q.id = p_id AND q.status = 'processing'
  RETURNING q.* INTO result_row;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_complete_communication_queue(varchar,boolean,text,varchar) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
-- Database-level class-capacity enforcement. Class row locks serialize admissions,
-- imports, and student transfers against one another and against capacity edits.
CREATE OR REPLACE FUNCTION private.enforce_student_class_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capacity integer;
  v_archived boolean;
  v_enrolled integer;
BEGIN
  SELECT capacity, is_archived INTO v_capacity, v_archived
    FROM public.classes
   WHERE id = NEW.class_id AND school_id = NEW.school_id
   FOR UPDATE;
  IF NOT FOUND OR v_archived THEN
    RAISE EXCEPTION 'Student class is unavailable for this school.' USING ERRCODE = '23503';
  END IF;
  SELECT count(*)::integer INTO v_enrolled
    FROM public.students
   WHERE school_id = NEW.school_id AND class_id = NEW.class_id
     AND id IS DISTINCT FROM NEW.id;
  IF v_enrolled >= v_capacity THEN
    RAISE EXCEPTION 'The selected class has reached capacity.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_class_capacity_below_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enrolled integer;
BEGIN
  IF NEW.capacity IS NOT DISTINCT FROM OLD.capacity THEN RETURN NEW; END IF;
  SELECT count(*)::integer INTO v_enrolled
    FROM public.students WHERE school_id = NEW.school_id AND class_id = NEW.id;
  IF NEW.capacity < v_enrolled THEN
    RAISE EXCEPTION 'Class capacity cannot be lower than its current enrollment (%).', v_enrolled
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_enforce_class_capacity ON public.students;
CREATE TRIGGER students_enforce_class_capacity
BEFORE INSERT OR UPDATE OF school_id, class_id ON public.students
FOR EACH ROW EXECUTE FUNCTION private.enforce_student_class_capacity();

DROP TRIGGER IF EXISTS classes_prevent_capacity_below_enrollment ON public.classes;
CREATE TRIGGER classes_prevent_capacity_below_enrollment
BEFORE UPDATE OF capacity ON public.classes
FOR EACH ROW EXECUTE FUNCTION private.prevent_class_capacity_below_enrollment();

REVOKE ALL ON FUNCTION private.enforce_student_class_capacity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_class_capacity_below_enrollment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_student_class_capacity() TO service_role;
GRANT EXECUTE ON FUNCTION private.prevent_class_capacity_below_enrollment() TO service_role;
NOTIFY pgrst, 'reload schema';

-- Atomic school-scoped fee receipt voiding.
CREATE OR REPLACE FUNCTION public.schoolos_void_fee_payment(
  p_payment_id VARCHAR,
  p_school_id VARCHAR,
  p_user_id VARCHAR,
  p_reason TEXT
) RETURNS public.fee_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  payment_row public.fee_payments%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = ''
    OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_reason IS NULL OR length(btrim(p_reason)) < 5 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'A valid payment, school, user, and void reason are required.';
  END IF;
  SELECT * INTO payment_row FROM public.fee_payments
   WHERE id = p_payment_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND OR payment_row.voided_at IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE public.fee_payments
     SET voided_at = now(), voided_by = p_user_id, void_reason = btrim(p_reason)
   WHERE id = p_payment_id AND school_id = p_school_id
   RETURNING * INTO payment_row;
  RETURN payment_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_void_fee_payment(VARCHAR, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_void_fee_payment(VARCHAR, VARCHAR, VARCHAR, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Apply partial fee payments under a row lock so concurrent cashiers cannot lose installments.
CREATE OR REPLACE FUNCTION public.schoolos_apply_fee_installment(
  p_payment_id VARCHAR, p_school_id VARCHAR, p_amount_paid NUMERIC,
  p_recorded_by VARCHAR, p_notes TEXT DEFAULT NULL, p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS public.fee_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE payment_row public.fee_payments%ROWTYPE; next_paid NUMERIC(10,2);
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' OR p_school_id IS NULL OR btrim(p_school_id) = ''
    OR p_recorded_by IS NULL OR btrim(p_recorded_by) = '' OR p_amount_paid IS NULL OR p_amount_paid < 0
    OR (p_notes IS NOT NULL AND length(p_notes) > 1000)
    OR (p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 128) THEN
    RAISE EXCEPTION 'Invalid fee installment details.';
  END IF;
  SELECT * INTO payment_row FROM public.fee_payments
   WHERE id = p_payment_id AND school_id = p_school_id FOR UPDATE;
  IF NOT FOUND OR payment_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'The fee installment was not found or has been voided.';
  END IF;
  IF p_idempotency_key IS NOT NULL AND (
    payment_row.idempotency_key = p_idempotency_key
    OR COALESCE(payment_row.idempotency_keys, '[]'::JSONB) @> jsonb_build_array(p_idempotency_key)
  ) THEN RETURN payment_row; END IF;
  IF payment_row.status = 'paid' THEN
    RAISE EXCEPTION 'This fee is already fully paid for the selected billing period.';
  END IF;
  next_paid := payment_row.amount_paid + p_amount_paid;
  IF next_paid > payment_row.amount_due THEN
    RAISE EXCEPTION 'Cash paid cannot exceed the remaining fee balance.';
  END IF;
  UPDATE public.fee_payments
     SET amount_paid = next_paid, remaining_amount = amount_due - next_paid,
         status = CASE WHEN amount_due - next_paid = 0 THEN 'paid'::public.fee_payment_status_enum
                       WHEN next_paid > 0 THEN 'partial'::public.fee_payment_status_enum
                       ELSE 'unpaid'::public.fee_payment_status_enum END,
         date = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.schools WHERE id = p_school_id), 'Africa/Addis_Ababa'))::date,
         recorded_by = p_recorded_by,
         idempotency_keys = CASE WHEN p_idempotency_key IS NULL THEN COALESCE(idempotency_keys, '[]'::JSONB)
                                 ELSE COALESCE(idempotency_keys, '[]'::JSONB) || jsonb_build_array(p_idempotency_key) END,
         notes = CASE WHEN p_notes IS NULL OR btrim(p_notes) = '' THEN notes
                      ELSE concat_ws(' · ', NULLIF(notes, ''), btrim(p_notes)) END
   WHERE id = p_payment_id AND school_id = p_school_id RETURNING * INTO payment_row;
  RETURN payment_row;
END;
$$;
REVOKE ALL ON FUNCTION public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_apply_fee_installment(VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, VARCHAR) TO service_role;
NOTIFY pgrst, 'reload schema';


-- Atomic admission approval (also maintained as migration 052).
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

  FOR v_parent_phone IN
    SELECT phone_value
      FROM (
        SELECT DISTINCT phone_value
          FROM (VALUES
            (NULLIF(btrim(v_application.father_phone), '')),
            (NULLIF(btrim(v_application.mother_phone), ''))
          ) AS parent_phones(phone_value)
         WHERE phone_value IS NOT NULL
      ) AS unique_parent_phones
     ORDER BY regexp_replace(phone_value, '[[:space:]()-]', '', 'g')
  LOOP
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

-- Safe, school-scoped merge restore. It never deletes live rows or restores credentials/billing.
BEGIN;

CREATE OR REPLACE FUNCTION public.schoolos_backup_json_snake(p_row JSONB)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_object_agg(lower(regexp_replace(key, '([A-Z])', E'_\\1', 'g')), value),
    '{}'::jsonb
  ) - ARRAY[
    'pin_hash', 'password_hash', 'two_factor_secret', 'pending_two_factor_secret',
    'recovery_codes', 'failed_login_attempts', 'locked_until',
    'api_key', 'api_secret', 'webhook_url'
  ]
  FROM jsonb_each(COALESCE(p_row, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.schoolos_backup_json_snake(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_backup_json_snake(JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.schoolos_restore_school_backup(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_backup JSONB;
  v_tables JSONB;
  v_rows JSONB;
  v_snake_rows JSONB;
  v_row JSONB;
  v_table TEXT;
  v_school_id VARCHAR(64);
  v_user_id VARCHAR(64);
  v_user_name TEXT;
  v_user_role public.user_role_enum;
  v_primary_keys TEXT[];
  v_pk_columns TEXT;
  v_pk_join TEXT;
  v_update_set TEXT;
  v_conflict BOOLEAN;
  v_counts JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR COALESCE((p_payload->>'confirm')::BOOLEAN, FALSE) IS NOT TRUE
     OR NULLIF(p_payload->>'school_id', '') IS NULL
     OR jsonb_typeof(p_payload->'backup') <> 'object' THEN
    RAISE EXCEPTION 'A confirmed school backup restore payload is required.';
  END IF;

  v_school_id := p_payload->>'school_id';
  v_backup := p_payload->'backup';
  v_tables := v_backup->'tables';
  IF v_backup->'school'->>'id' IS DISTINCT FROM v_school_id THEN
    RAISE EXCEPTION 'The backup belongs to a different school.';
  END IF;
  IF jsonb_typeof(v_tables) <> 'object' THEN
    RAISE EXCEPTION 'The backup does not contain a valid tables object.';
  END IF;

  v_user_id := p_payload->>'approved_by';
  v_user_name := COALESCE(NULLIF(p_payload->>'approved_by_name', ''), 'School Administrator');
  v_user_role := COALESCE(NULLIF(p_payload->>'approved_by_role', ''), 'school_admin')::public.user_role_enum;

  FOREACH v_table IN ARRAY ARRAY['school_branches', 'classes', 'subjects', 'teachers', 'students', 'staff_members', 'admission_applications', 'assignments', 'fee_structures', 'fee_ranges', 'fee_receipt_sequences', 'inventory_items', 'library_books', 'transport_routes', 'school_notices', 'exam_configs', 'report_card_templates', 'communication_settings', 'school_events', 'subscription_invoices', 'support_tickets', 'timetable_settings', 'teacher_unavailability', 'timetable_slots', 'class_subjects', 'fee_payments', 'attendance_records', 'student_marks', 'assignment_submissions', 'promotions', 'promotion_history', 'inventory_transactions', 'library_loans', 'bus_assignments', 'notice_reads', 'communication_queue', 'direct_messages', 'discipline_incidents', 'payroll_records', 'notification_templates'] LOOP
    v_rows := v_tables->v_table;
    IF v_rows IS NULL OR v_rows = 'null'::jsonb THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_rows) <> 'array' THEN
      RAISE EXCEPTION 'Backup table % must be an array.', v_table;
    END IF;
    v_count := jsonb_array_length(v_rows);
    IF v_count = 0 THEN
      CONTINUE;
    END IF;

    FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
      IF COALESCE(v_row->>'schoolId', v_row->>'school_id') IS DISTINCT FROM v_school_id THEN
        RAISE EXCEPTION 'Backup table % contains a row outside the selected school.', v_table;
      END IF;
    END LOOP;

    SELECT jsonb_agg(public.schoolos_backup_json_snake(value))
      INTO v_snake_rows
      FROM jsonb_array_elements(v_rows);

    SELECT array_agg(kcu.column_name ORDER BY kcu.ordinal_position)
      INTO v_primary_keys
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = v_table
       AND tc.constraint_type = 'PRIMARY KEY';

    IF COALESCE(array_length(v_primary_keys, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Backup table % has no primary key.', v_table;
    END IF;

    SELECT string_agg(format('%I', key_name), ', '),
           string_agg(format('current_row.%I = incoming.%I', key_name, key_name), ' AND ')
      INTO v_pk_columns, v_pk_join
      FROM unnest(v_primary_keys) AS pk(key_name);

    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM public.%I current_row JOIN jsonb_populate_recordset(NULL::public.%I, $1) incoming ON %s WHERE current_row.school_id IS DISTINCT FROM $2)',
      v_table, v_table, v_pk_join
    ) INTO v_conflict USING v_snake_rows, v_school_id;

    IF v_conflict THEN
      RAISE EXCEPTION 'Backup table % conflicts with a record owned by another school.', v_table;
    END IF;

    SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ' ORDER BY ordinal_position)
      INTO v_update_set
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = v_table
       AND column_name <> ALL(v_primary_keys)
       AND column_name <> 'school_id'
       AND column_name NOT IN ('pin_hash', 'password_hash', 'two_factor_secret', 'pending_two_factor_secret', 'recovery_codes', 'api_key', 'api_secret', 'webhook_url')
       AND is_generated = 'NEVER';

    IF v_update_set IS NULL THEN
      EXECUTE format(
        'INSERT INTO public.%I SELECT (jsonb_populate_recordset(NULL::public.%I, $1)).* ON CONFLICT (%s) DO NOTHING',
        v_table, v_table, v_pk_columns
      ) USING v_snake_rows;
    ELSE
      EXECUTE format(
        'INSERT INTO public.%I SELECT (jsonb_populate_recordset(NULL::public.%I, $1)).* ON CONFLICT (%s) DO UPDATE SET %s',
        v_table, v_table, v_pk_columns, v_update_set
      ) USING v_snake_rows;
    END IF;

    v_counts := v_counts || jsonb_build_object(v_table, v_count);
  END LOOP;

  INSERT INTO public.audit_logs (
    id, action, category, school_id, school_name, user_id, user_name,
    user_role, details, severity
  )
  SELECT 'audit-' || gen_random_uuid()::text, 'SCHOOL_BACKUP_RESTORED',
    'security', v_school_id, s.name, v_user_id, v_user_name, v_user_role,
    'School backup merge restore completed. Existing rows not present in the backup were preserved.',
    'warning'
  FROM public.schools s WHERE s.id = v_school_id;

  RETURN jsonb_build_object('school_id', v_school_id, 'mode', 'merge', 'restored', v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.schoolos_restore_school_backup(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolos_restore_school_backup(JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
