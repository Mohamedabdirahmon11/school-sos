-- Consolidate the legacy tenant and super-admin permissive policies.
-- The combined predicate preserves the same access: super admins can access all
-- schools; all other authenticated users are limited to their own school.
BEGIN;
DROP POLICY IF EXISTS admission_applications_super_admin ON public.admission_applications;
DROP POLICY IF EXISTS admission_applications_tenant_access ON public.admission_applications;
DROP POLICY IF EXISTS admission_applications_tenant ON public.admission_applications;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.admission_applications;
CREATE POLICY tenant_scope_v2 ON public.admission_applications
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS assignment_submissions_super_admin ON public.assignment_submissions;
DROP POLICY IF EXISTS assignment_submissions_tenant_access ON public.assignment_submissions;
DROP POLICY IF EXISTS assignment_submissions_tenant ON public.assignment_submissions;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.assignment_submissions;
CREATE POLICY tenant_scope_v2 ON public.assignment_submissions
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS assignments_super_admin ON public.assignments;
DROP POLICY IF EXISTS assignments_tenant_access ON public.assignments;
DROP POLICY IF EXISTS assignments_tenant ON public.assignments;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.assignments;
CREATE POLICY tenant_scope_v2 ON public.assignments
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS attendance_records_super_admin ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_tenant_access ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_tenant ON public.attendance_records;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.attendance_records;
CREATE POLICY tenant_scope_v2 ON public.attendance_records
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS classes_super_admin ON public.classes;
DROP POLICY IF EXISTS classes_tenant_access ON public.classes;
DROP POLICY IF EXISTS classes_tenant ON public.classes;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.classes;
CREATE POLICY tenant_scope_v2 ON public.classes
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS communication_queue_super_admin ON public.communication_queue;
DROP POLICY IF EXISTS communication_queue_tenant_access ON public.communication_queue;
DROP POLICY IF EXISTS communication_queue_tenant ON public.communication_queue;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.communication_queue;
CREATE POLICY tenant_scope_v2 ON public.communication_queue
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS communication_settings_super_admin ON public.communication_settings;
DROP POLICY IF EXISTS communication_settings_tenant_access ON public.communication_settings;
DROP POLICY IF EXISTS communication_settings_tenant ON public.communication_settings;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.communication_settings;
CREATE POLICY tenant_scope_v2 ON public.communication_settings
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS exam_configs_super_admin ON public.exam_configs;
DROP POLICY IF EXISTS exam_configs_tenant_access ON public.exam_configs;
DROP POLICY IF EXISTS exam_configs_tenant ON public.exam_configs;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.exam_configs;
CREATE POLICY tenant_scope_v2 ON public.exam_configs
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS fee_payments_super_admin ON public.fee_payments;
DROP POLICY IF EXISTS fee_payments_tenant_access ON public.fee_payments;
DROP POLICY IF EXISTS fee_payments_tenant ON public.fee_payments;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.fee_payments;
CREATE POLICY tenant_scope_v2 ON public.fee_payments
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS fee_structures_super_admin ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_tenant_access ON public.fee_structures;
DROP POLICY IF EXISTS fee_structures_tenant ON public.fee_structures;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.fee_structures;
CREATE POLICY tenant_scope_v2 ON public.fee_structures
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS promotions_super_admin ON public.promotions;
DROP POLICY IF EXISTS promotions_tenant_access ON public.promotions;
DROP POLICY IF EXISTS promotions_tenant ON public.promotions;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.promotions;
CREATE POLICY tenant_scope_v2 ON public.promotions
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS report_card_templates_super_admin ON public.report_card_templates;
DROP POLICY IF EXISTS report_card_templates_tenant_access ON public.report_card_templates;
DROP POLICY IF EXISTS report_card_templates_tenant ON public.report_card_templates;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.report_card_templates;
CREATE POLICY tenant_scope_v2 ON public.report_card_templates
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS school_branches_super_admin ON public.school_branches;
DROP POLICY IF EXISTS school_branches_tenant_access ON public.school_branches;
DROP POLICY IF EXISTS school_branches_tenant ON public.school_branches;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.school_branches;
CREATE POLICY tenant_scope_v2 ON public.school_branches
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS school_events_super_admin ON public.school_events;
DROP POLICY IF EXISTS school_events_tenant_access ON public.school_events;
DROP POLICY IF EXISTS school_events_tenant ON public.school_events;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.school_events;
CREATE POLICY tenant_scope_v2 ON public.school_events
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS school_notices_super_admin ON public.school_notices;
DROP POLICY IF EXISTS school_notices_tenant_access ON public.school_notices;
DROP POLICY IF EXISTS school_notices_tenant ON public.school_notices;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.school_notices;
CREATE POLICY tenant_scope_v2 ON public.school_notices
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS student_marks_super_admin ON public.student_marks;
DROP POLICY IF EXISTS student_marks_tenant_access ON public.student_marks;
DROP POLICY IF EXISTS student_marks_tenant ON public.student_marks;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.student_marks;
CREATE POLICY tenant_scope_v2 ON public.student_marks
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS students_super_admin ON public.students;
DROP POLICY IF EXISTS students_tenant_access ON public.students;
DROP POLICY IF EXISTS students_tenant ON public.students;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.students;
CREATE POLICY tenant_scope_v2 ON public.students
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS subjects_super_admin ON public.subjects;
DROP POLICY IF EXISTS subjects_tenant_access ON public.subjects;
DROP POLICY IF EXISTS subjects_tenant ON public.subjects;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.subjects;
CREATE POLICY tenant_scope_v2 ON public.subjects
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS teacher_unavailability_super_admin ON public.teacher_unavailability;
DROP POLICY IF EXISTS teacher_unavailability_tenant_access ON public.teacher_unavailability;
DROP POLICY IF EXISTS teacher_unavailability_tenant ON public.teacher_unavailability;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.teacher_unavailability;
CREATE POLICY tenant_scope_v2 ON public.teacher_unavailability
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS teachers_super_admin ON public.teachers;
DROP POLICY IF EXISTS teachers_tenant_access ON public.teachers;
DROP POLICY IF EXISTS teachers_tenant ON public.teachers;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.teachers;
CREATE POLICY tenant_scope_v2 ON public.teachers
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS timetable_settings_super_admin ON public.timetable_settings;
DROP POLICY IF EXISTS timetable_settings_tenant_access ON public.timetable_settings;
DROP POLICY IF EXISTS timetable_settings_tenant ON public.timetable_settings;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.timetable_settings;
CREATE POLICY tenant_scope_v2 ON public.timetable_settings
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);

DROP POLICY IF EXISTS timetable_slots_super_admin ON public.timetable_slots;
DROP POLICY IF EXISTS timetable_slots_tenant_access ON public.timetable_slots;
DROP POLICY IF EXISTS timetable_slots_tenant ON public.timetable_slots;
DROP POLICY IF EXISTS tenant_scope_v2 ON public.timetable_slots;
CREATE POLICY tenant_scope_v2 ON public.timetable_slots
  FOR ALL TO authenticated
  USING (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text)
  WITH CHECK (public.auth_user_role() = 'super_admin' OR school_id::text = public.auth_school_id()::text);
NOTIFY pgrst, 'reload schema';
COMMIT;
