\set ON_ERROR_STOP on

DO $$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE public.schools (
  id varchar(64) PRIMARY KEY,
  timezone text
);

CREATE TABLE public.exam_configs (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  academic_year varchar(50) NOT NULL,
  pass_mark_percentage numeric(5,2) NOT NULL DEFAULT 50
);
CREATE TABLE public.students (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  student_id text,
  first_name text,
  middle_name text,
  last_name text,
  class_id varchar(64),
  admission_date date,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.teachers (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.classes (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  name text,
  grade_level text,
  is_archived boolean NOT NULL DEFAULT false
);
CREATE TABLE public.attendance_records (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  class_id varchar(64),
  student_id varchar(64) NOT NULL,
  date date NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.fee_payments (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  student_id varchar(64),
  receipt_number text,
  reference_number text,
  academic_year text,
  month text,
  fee_type text,
  fee_structure_id varchar(64),
  idempotency_key text,
  amount_due numeric(12,2),
  amount_paid numeric(12,2),
  remaining_amount numeric(12,2),
  payment_method text,
  status text,
  date date NOT NULL,
  recorded_by varchar(64),
  notes text,
  voided_at timestamptz,
  voided_by varchar(64),
  void_reason text,
  idempotency_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.school_notices (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  title text,
  content text,
  audience text,
  is_active boolean NOT NULL DEFAULT true,
  is_pinned boolean NOT NULL DEFAULT false,
  publish_date date NOT NULL,
  author_name text,
  author_role text
);

INSERT INTO public.schools (id, timezone)
VALUES ('school-a', 'Africa/Addis_Ababa'), ('school-b', 'Africa/Addis_Ababa');

INSERT INTO public.exam_configs (id, school_id, academic_year, pass_mark_percentage)
VALUES ('config-a', 'school-a', '2026-2027', 50);

INSERT INTO public.classes (id, school_id, name, grade_level, is_archived)
VALUES
  ('class-a', 'school-a', 'Class A', 'Grade 1', false),
  ('class-a-old', 'school-a', 'Archived Class', 'Grade 0', true),
  ('class-b', 'school-b', 'Class B', 'Grade 2', false);

INSERT INTO public.students (id, school_id, student_id, first_name, middle_name, last_name, class_id, admission_date, status, created_at)
VALUES
  ('a1', 'school-a', 'A001', 'Asha', '', 'Ali', 'class-a', CURRENT_DATE, 'active', now()),
  ('a2', 'school-a', 'A002', 'Bilan', '', 'Omar', 'class-a', CURRENT_DATE, 'active', now() - interval '1 day'),
  ('a3', 'school-a', 'A003', 'Cali', '', 'Nur', 'class-a', CURRENT_DATE, 'active', now() - interval '2 days'),
  ('a4', 'school-a', 'A004', 'Inactive', '', 'Student', 'class-a', CURRENT_DATE, 'inactive', now() - interval '3 days'),
  ('b1', 'school-b', 'B001', 'Other', '', 'School', 'class-b', CURRENT_DATE, 'active', now());

INSERT INTO public.teachers (id, school_id, status)
VALUES ('teacher-a', 'school-a', 'active'), ('teacher-b', 'school-b', 'active');

INSERT INTO public.attendance_records (id, school_id, class_id, student_id, date, status)
VALUES
  ('att-a1', 'school-a', 'class-a', 'a1', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'present'),
  ('att-a2', 'school-a', 'class-a', 'a2', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'absent'),
  ('att-a3', 'school-a', 'class-a', 'a3', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'excused'),
  ('att-a4', 'school-a', 'class-a', 'a4', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'absent'),
  ('att-b1', 'school-b', 'class-b', 'b1', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'present');

INSERT INTO public.fee_payments (id, school_id, student_id, receipt_number, academic_year, month, fee_type, amount_due, amount_paid, remaining_amount, payment_method, status, date, voided_at)
VALUES
  ('pay-a1', 'school-a', 'a1', 'RA1', '2026-2027', 'November', 'Tuition', 50, 50, 0, 'cash', 'paid', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, NULL),
  ('pay-a2', 'school-a', 'a2', 'RA2', '2026-2027', 'November', 'Tuition', 50, 20, 30, 'cash', 'partial', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, NULL),
  ('pay-a3', 'school-a', 'a3', 'RA3', '2026-2027', 'November', 'Tuition', 100, 100, 0, 'cash', 'paid', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, now()),
  ('pay-b1', 'school-b', 'b1', 'RB1', '2026-2027', 'November', 'Tuition', 200, 200, 0, 'cash', 'paid', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, NULL);

INSERT INTO public.school_notices (id, school_id, title, content, audience, is_active, is_pinned, publish_date, author_name, author_role)
VALUES
  ('notice-a1', 'school-a', 'A notice', 'School A', 'all', true, true, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'Admin A', 'school_admin'),
  ('notice-a2', 'school-a', 'Future notice', 'Not yet published', 'all', true, false, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 2, 'Admin A', 'school_admin'),
  ('notice-a3', 'school-a', 'Inactive notice', 'Archived', 'all', false, false, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'Admin A', 'school_admin'),
  ('notice-b1', 'school-b', 'Other school', 'Private', 'all', true, false, (now() AT TIME ZONE 'Africa/Addis_Ababa')::date, 'Admin B', 'school_admin');

-- Teacher dashboard fixture schema is present before applying its function migration.
ALTER TABLE public.teachers ADD COLUMN user_id varchar(64);
ALTER TABLE public.teachers ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.classes ADD COLUMN class_teacher_id varchar(64);
ALTER TABLE public.school_notices ADD COLUMN class_id varchar(64);
CREATE TABLE public.class_subjects (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  class_id varchar(64) NOT NULL,
  teacher_id varchar(64) NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.timetable_slots (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  teacher_id varchar(64) NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.assignments (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  teacher_id varchar(64) NOT NULL,
  due_date date NOT NULL
);

\ir ../../supabase/migrations/20261123120000_school_dashboard_summary_scan_reduction.sql
\ir ../../supabase/migrations/20261123120000_school_dashboard_summary_scan_reduction.sql

DO $$
DECLARE
  summary jsonb;
BEGIN
  summary := public.school_dashboard_summary('school-a');
  ASSERT to_regclass('public.idx_fee_payments_school_voided_date') IS NOT NULL, 'dashboard payment aggregate index must be installed';

  ASSERT summary->'stats'->>'totalStudents' = '3', 'active student count must be school scoped';
  ASSERT summary->'stats'->>'totalTeachers' = '1', 'active teacher count must be school scoped';
  ASSERT summary->>'totalClasses' = '1', 'archived and cross-school classes must be excluded';
  ASSERT summary->>'attendanceRecordedToday' = '3', 'only active school students count as recorded';
  ASSERT summary->>'todayAttendance' = '1', 'present/late attendance count is preserved';
  ASSERT summary->'stats'->>'attendanceRate' = '50', 'excused attendance must be removed from the denominator';
  ASSERT jsonb_array_length(summary->'absentStudents') = 1, 'inactive students must not appear in absent list';
  ASSERT summary->'absentStudents'->0->>'id' = 'a2', 'absent list must stay within the selected school';
  ASSERT (summary->'stats'->>'todayCollection')::numeric = 70, 'today collection must exclude voided and other-school payments';
  ASSERT (summary->'stats'->>'totalOutstanding')::numeric = 30, 'outstanding must exclude voided and other-school payments';
  ASSERT jsonb_array_length(summary->'recentPayments') = 2, 'recent payments must be school scoped and exclude voided rows';
  ASSERT jsonb_array_length(summary->'notices') = 1, 'future, inactive and cross-school notices must be excluded';
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(summary->'recentStudents') AS item
    WHERE item->>'id' = 'b1'
  ), 'recent students must not leak another school';
  ASSERT has_function_privilege('service_role', 'public.school_dashboard_summary(character varying)', 'EXECUTE'),
    'service_role must retain execute permission';
  ASSERT NOT has_function_privilege('anon', 'public.school_dashboard_summary(character varying)', 'EXECUTE'),
    'anon must not receive execute permission';
  ASSERT NOT has_function_privilege('authenticated', 'public.school_dashboard_summary(character varying)', 'EXECUTE'),
    'authenticated must not receive execute permission';
END $$;

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.school_dashboard_summary('school-a');


-- Teacher dashboard regression: verify the planning-reduced RPC preserves its
-- tenant scope, role scope, attendance math, and existing JSON response keys.
UPDATE public.teachers SET user_id = 'user-a' WHERE id = 'teacher-a';
UPDATE public.teachers SET user_id = 'user-b' WHERE id = 'teacher-b';
UPDATE public.classes SET class_teacher_id = 'user-a' WHERE id = 'class-a';
UPDATE public.classes SET class_teacher_id = 'user-b' WHERE id = 'class-b';

INSERT INTO public.class_subjects (id, school_id, class_id, teacher_id, is_active)
VALUES
  ('cs-a1', 'school-a', 'class-a', 'teacher-a', true),
  ('cs-b1', 'school-b', 'class-b', 'teacher-b', true);
INSERT INTO public.timetable_slots (id, school_id, teacher_id, is_active)
VALUES
  ('slot-a1', 'school-a', 'teacher-a', true),
  ('slot-b1', 'school-b', 'teacher-b', true);
INSERT INTO public.assignments (id, school_id, teacher_id, due_date)
VALUES
  ('assignment-a1', 'school-a', 'user-a', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 1),
  ('assignment-b1', 'school-b', 'user-b', (now() AT TIME ZONE 'Africa/Addis_Ababa')::date + 1);

\ir ../../supabase/migrations/20261123120000_school_dashboard_summary_scan_reduction.sql

DO $$
DECLARE
  summary jsonb;
BEGIN
  summary := public.teacher_dashboard_summary('school-a', 'teacher-a');
  ASSERT summary->'stats'->>'totalStudents' = '3', 'teacher dashboard must include only active students in assigned classes';
  ASSERT summary->'stats'->>'totalTeachers' = '1', 'teacher dashboard teacher count must remain one';
  ASSERT summary->'stats'->>'attendanceRate' = '50', 'teacher attendance rate must exclude excused students from denominator';
  ASSERT summary->>'totalClasses' = '1', 'teacher dashboard must deduplicate form-teacher and subject class assignments';
  ASSERT summary->>'totalPeriodsPerWeek' = '1', 'teacher timetable count must be scoped to the teacher';
  ASSERT summary->>'openHomeworkCount' = '1', 'teacher homework count must use the school-scoped teacher profile';
  ASSERT summary->>'attendanceRecordedToday' = '3', 'teacher attendance records must include active assigned students only';
  ASSERT summary->>'todayAttendance' = '1', 'teacher attendance present/late count must be preserved';
  ASSERT jsonb_array_length(summary->'recentStudents') = 3, 'recent student list must be limited to assigned active students';
  ASSERT jsonb_array_length(summary->'notices') = 1, 'teacher notices must remain school scoped and published';
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(summary->'recentStudents') AS item
    WHERE item->>'id' = 'b1'
  ), 'teacher dashboard must not expose another school students';
  ASSERT has_function_privilege('service_role', 'public.teacher_dashboard_summary(character varying, character varying)', 'EXECUTE'),
    'service_role must retain teacher dashboard execute permission';
  ASSERT NOT has_function_privilege('anon', 'public.teacher_dashboard_summary(character varying, character varying)', 'EXECUTE'),
    'anon must not execute teacher dashboard function';
  ASSERT NOT has_function_privilege('authenticated', 'public.teacher_dashboard_summary(character varying, character varying)', 'EXECUTE'),
    'authenticated must not execute teacher dashboard function directly';
END $$;

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.teacher_dashboard_summary('school-a', 'teacher-a');


-- Large synthetic tenant fixture for the CI performance regression budget.
-- This is an isolated PostgreSQL service database; it never connects to live Supabase.
INSERT INTO public.schools (id, timezone)
VALUES ('school-load', 'Africa/Addis_Ababa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.classes (id, school_id, name, grade_level, is_archived, class_teacher_id)
SELECT
  'load-class-' || lpad(g::text, 2, '0'),
  'school-load',
  'Grade ' || g,
  g::text,
  false,
  'load-user-' || lpad(g::text, 2, '0')
FROM generate_series(1, 40) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teachers (id, school_id, status, user_id)
SELECT
  'load-teacher-' || lpad(g::text, 2, '0'),
  'school-load',
  'active',
  'load-user-' || lpad(g::text, 2, '0')
FROM generate_series(1, 80) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.students (id, school_id, student_id, first_name, middle_name, last_name, class_id, admission_date, status, created_at)
SELECT
  'load-student-' || lpad(g::text, 4, '0'),
  'school-load',
  'L' || lpad(g::text, 4, '0'),
  'Student',
  '',
  g::text,
  'load-class-' || lpad((((g - 1) % 40) + 1)::text, 2, '0'),
  CURRENT_DATE,
  'active',
  now() - (g || ' seconds')::interval
FROM generate_series(1, 1500) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.attendance_records (id, school_id, class_id, student_id, date, status)
SELECT
  'load-attendance-' || lpad(g::text, 6, '0'),
  'school-load',
  'load-class-' || lpad(((((g - 1) % 1500) % 40) + 1)::text, 2, '0'),
  'load-student-' || lpad(((((g - 1) % 1500) + 1))::text, 4, '0'),
  CURRENT_DATE - (g % 30),
  CASE WHEN g % 10 = 0 THEN 'absent' WHEN g % 7 = 0 THEN 'late' ELSE 'present' END
FROM generate_series(1, 100000) AS g
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.student_marks (
  id varchar(64) PRIMARY KEY,
  school_id varchar(64) NOT NULL,
  class_id varchar(64) NOT NULL,
  subject_id varchar(64) NOT NULL,
  student_id varchar(64) NOT NULL,
  academic_year varchar(50) NOT NULL,
  semester varchar(50) NOT NULL CHECK (semester IN ('Semester 1', 'Semester 2')),
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL
);

INSERT INTO public.student_marks (id, school_id, class_id, subject_id, student_id, academic_year, semester, percentage, status)
SELECT
  'load-mark-' || lpad(g::text, 6, '0'),
  'school-load',
  'load-class-' || lpad(((((g - 1) % 1500) % 40) + 1)::text, 2, '0'),
  'load-subject-' || ((g - 1) % 12 + 1),
  'load-student-' || lpad(((((g - 1) % 1500) + 1))::text, 4, '0'),
  '2026-2027',
  CASE WHEN g % 2 = 0 THEN 'Semester 1' ELSE 'Semester 2' END,
  (g % 101)::numeric(5,2),
  CASE WHEN g % 5 = 0 THEN 'draft' ELSE 'approved' END
FROM generate_series(1, 20000) AS g
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_marks
  (id, school_id, class_id, subject_id, student_id, academic_year, semester, percentage, status)
VALUES
  ('report-mark-a1', 'school-a', 'class-a', 'subject-a1', 'a1', '2026-2027', 'Semester 1', 75, 'approved'),
  ('report-mark-a2', 'school-a', 'class-a', 'subject-a2', 'a2', '2026-2027', 'Semester 1', 40, 'approved');

\ir ../../supabase/migrations/20261124100000_school_reports_summary_rpc.sql
\ir ../../supabase/migrations/20261124100000_school_reports_summary_rpc.sql

DO $
DECLARE
  report jsonb;
  school_admin_report jsonb;
BEGIN
  report := public.schoolos_school_reports_summary('school-a', '2026-2027', true);
  ASSERT report->>'studentCount' = '3', 'report student count must include active students only';
  ASSERT report->>'teacherCount' = '1', 'report teacher count must be school scoped';
  ASSERT report->>'studentTeacherRatio' = '3.0', 'student-teacher ratio must preserve one-decimal precision';
  ASSERT jsonb_array_length(report->'classEnrollment') = 1, 'archived and cross-school classes must be excluded';
  ASSERT report->'classEnrollment'->0->>'classId' = 'class-a', 'class enrollment must remain school scoped';
  ASSERT (report->>'attendanceRate')::numeric = 50, 'attendance rate must preserve dashboard summary semantics';
  ASSERT (report->>'passRate')::numeric = 50, 'pass rate must use approved marks and school pass mark';
  ASSERT (report->>'totalDue')::numeric = 100, 'finance total due must exclude voided and other-school payments';
  ASSERT (report->>'totalCollected')::numeric = 70, 'finance collected total must exclude voided and other-school payments';
  ASSERT (report->>'totalArrears')::numeric = 30, 'finance arrears must exclude voided and other-school payments';
  ASSERT (report->>'paymentCount')::integer = 2, 'finance payment count must exclude voided payments';
  ASSERT jsonb_array_length(report->'recentPayments') = 2, 'recent payments must be bounded and school scoped';

  school_admin_report := public.schoolos_school_reports_summary('school-a', '2026-2027', false);
  ASSERT NOT (school_admin_report ? 'totalDue'), 'school-admin report must not contain finance totals';
  ASSERT NOT (school_admin_report ? 'recentPayments'), 'school-admin report must not contain payment rows';
  ASSERT has_function_privilege('service_role',
    'public.schoolos_school_reports_summary(character varying, character varying, boolean)', 'EXECUTE'),
    'service_role must execute the report summary RPC';
  ASSERT NOT has_function_privilege('anon',
    'public.schoolos_school_reports_summary(character varying, character varying, boolean)', 'EXECUTE'),
    'anon must not execute the report summary RPC';
  ASSERT NOT has_function_privilege('authenticated',
    'public.schoolos_school_reports_summary(character varying, character varying, boolean)', 'EXECUTE'),
    'authenticated must not execute the report summary RPC directly';
END $;

-- Match baseline production attendance index, then apply the additive
-- performance migration twice to prove idempotency on the actual schema.
CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON public.attendance_records (school_id, class_id, date);

\ir ../../supabase/migrations/20261124090000_schoolos_read_path_indexes.sql
\ir ../../supabase/migrations/20261124090000_schoolos_read_path_indexes.sql

DO $$
BEGIN
  ASSERT to_regclass('public.idx_student_marks_school_class_year_student_term') IS NOT NULL,
    'class/year/semester marks lookup index must be installed';
  ASSERT to_regclass('public.idx_attendance_school_student_date') IS NOT NULL,
    'school/student/date attendance lookup index must be installed';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_student_marks_school_exam_student'
  ), 'the production marks schema must not assume a nonexistent exam_id column';
END $$;

ANALYZE public.students;
ANALYZE public.teachers;
ANALYZE public.classes;
ANALYZE public.attendance_records;
ANALYZE public.student_marks;

DO $$
DECLARE
  summary jsonb;
BEGIN
  ASSERT (SELECT count(*) FROM public.classes WHERE school_id = 'school-load') = 40,
    'large fixture must contain 40 classes';
  ASSERT (SELECT count(*) FROM public.students WHERE school_id = 'school-load') = 1500,
    'large fixture must contain 1500 students';
  ASSERT (SELECT count(*) FROM public.teachers WHERE school_id = 'school-load') = 80,
    'large fixture must contain 80 teachers';
  ASSERT (SELECT count(*) FROM public.attendance_records WHERE school_id = 'school-load') = 100000,
    'large fixture must contain 100000 attendance rows';
  ASSERT (SELECT count(*) FROM public.student_marks WHERE school_id = 'school-load') = 20000,
    'large fixture must contain 20000 student marks rows';
  summary := public.school_dashboard_summary('school-load');
  ASSERT summary->'stats'->>'totalStudents' = '1500',
    'large tenant dashboard must return the seeded student count';
  ASSERT summary->'stats'->>'totalTeachers' = '80',
    'large tenant dashboard must return the seeded teacher count';
  ASSERT summary->>'totalClasses' = '40',
    'large tenant dashboard must return the seeded class count';
END $$;

EXPLAIN (ANALYZE, BUFFERS)
SELECT public.school_dashboard_summary('school-load');

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM public.attendance_records
WHERE school_id = 'school-load'
  AND class_id = 'load-class-01'
  AND date >= CURRENT_DATE - 30;

EXPLAIN (ANALYZE, BUFFERS)
SELECT class_id, student_id, sum(percentage)
FROM public.student_marks
WHERE school_id = 'school-load'
  AND class_id = 'load-class-01'
  AND academic_year = '2026-2027'
  AND status = 'approved'
GROUP BY class_id, student_id;

