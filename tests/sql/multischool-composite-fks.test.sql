\set ON_ERROR_STOP on
CREATE TABLE public.schools (id varchar PRIMARY KEY);
INSERT INTO public.schools VALUES ('school-a'),('school-b');
CREATE TABLE public.users (id varchar PRIMARY KEY, school_id varchar, branch_id varchar, UNIQUE(id,school_id));
CREATE TABLE public.school_branches (id varchar PRIMARY KEY, school_id varchar NOT NULL, UNIQUE(id,school_id));
CREATE TABLE public.class_groups (id varchar PRIMARY KEY, school_id varchar NOT NULL, UNIQUE(id,school_id));
CREATE TABLE public.classes (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_teacher_id varchar, branch_id varchar, UNIQUE(id,school_id));
CREATE TABLE public.students (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, branch_id varchar, UNIQUE(id,school_id));
CREATE TABLE public.subjects (id varchar PRIMARY KEY, school_id varchar NOT NULL, UNIQUE(id,school_id));
CREATE TABLE public.teachers (id varchar PRIMARY KEY, school_id varchar NOT NULL, user_id varchar NOT NULL, UNIQUE(id,school_id));
CREATE TABLE public.assignments (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, subject_id varchar NOT NULL, teacher_id varchar NOT NULL);
CREATE TABLE public.admission_applications (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, student_id varchar);
CREATE TABLE public.assignment_submissions (id varchar PRIMARY KEY, school_id varchar, assignment_id varchar NOT NULL, student_id varchar NOT NULL);
CREATE TABLE public.attendance_records (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, student_id varchar NOT NULL, recorded_by varchar NOT NULL);
CREATE TABLE public.class_subjects (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, subject_id varchar NOT NULL, teacher_id varchar);
CREATE UNIQUE INDEX class_subjects_school_id_class_id_subject_id_key ON public.class_subjects (school_id, class_id, subject_id);
CREATE TABLE public.fee_structures (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar);
CREATE TABLE public.student_invoices (id varchar PRIMARY KEY, school_id varchar NOT NULL, student_id varchar NOT NULL, created_by varchar);
CREATE TABLE public.fee_payments (id varchar PRIMARY KEY, school_id varchar NOT NULL, student_id varchar NOT NULL, fee_structure_id varchar, invoice_id varchar, recorded_by varchar NOT NULL, voided_by varchar);
CREATE TABLE public.form_teacher_comments (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, student_id varchar NOT NULL, teacher_user_id varchar NOT NULL);
CREATE TABLE public.student_invoice_items (id varchar PRIMARY KEY, school_id varchar NOT NULL, invoice_id varchar NOT NULL, fee_structure_id varchar);
CREATE TABLE public.student_marks (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, student_id varchar NOT NULL, subject_id varchar NOT NULL, submitted_by varchar, approved_by varchar);
CREATE TABLE public.staff_members (id varchar PRIMARY KEY, school_id varchar NOT NULL, user_id varchar, role_id varchar);
CREATE TABLE public.class_sections (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, legacy_class_id varchar);
CREATE TABLE public.timetable_slots (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, subject_id varchar NOT NULL, teacher_id varchar);
CREATE TABLE public.parent_students (id varchar PRIMARY KEY, school_id varchar NOT NULL, parent_id varchar NOT NULL, student_id varchar NOT NULL);
CREATE TABLE public.communication_queue (id varchar PRIMARY KEY, school_id varchar NOT NULL, student_id varchar);
CREATE TABLE public.teacher_unavailability (id varchar PRIMARY KEY, school_id varchar NOT NULL, teacher_id varchar NOT NULL);
CREATE TABLE public.school_expenses (id varchar PRIMARY KEY, school_id varchar NOT NULL);
CREATE TABLE public.inventory_items (id varchar PRIMARY KEY, school_id varchar NOT NULL, UNIQUE(id,school_id));
CREATE TABLE public.inventory_transactions (id varchar PRIMARY KEY, school_id varchar NOT NULL, item_id varchar NOT NULL);
CREATE TABLE public.bank_statement_entries (id varchar PRIMARY KEY, school_id varchar NOT NULL, matched_payment_id varchar, matched_expense_id varchar);
CREATE TABLE public.bank_statement_allocations (id varchar PRIMARY KEY, school_id varchar NOT NULL, statement_entry_id varchar NOT NULL, payment_id varchar, expense_id varchar);
CREATE TABLE public.promotions (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_from_id varchar NOT NULL, class_to_id varchar NOT NULL, student_id varchar NOT NULL);
CREATE TABLE public.promotion_history (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar NOT NULL, student_id varchar NOT NULL);
CREATE TABLE public.school_document_templates (id uuid PRIMARY KEY, school_id varchar NOT NULL);
CREATE TABLE public.school_documents (id uuid PRIMARY KEY, school_id varchar NOT NULL, class_id varchar, student_id varchar, template_id uuid);
CREATE TABLE public.school_document_audit_events (id varchar PRIMARY KEY, school_id varchar NOT NULL, document_id uuid);
CREATE TABLE public.school_document_permissions (id varchar PRIMARY KEY, school_id varchar NOT NULL, document_id uuid NOT NULL, user_id varchar NOT NULL);
CREATE TABLE public.school_document_versions (id varchar PRIMARY KEY, school_id varchar NOT NULL, document_id uuid NOT NULL);
CREATE TABLE public.student_document_attachments (id varchar PRIMARY KEY, school_id varchar NOT NULL, student_id varchar NOT NULL);
CREATE TABLE public.staff_roles (id varchar PRIMARY KEY, school_id varchar NOT NULL);
CREATE TABLE public.payroll_records (id varchar PRIMARY KEY, school_id varchar NOT NULL, user_id varchar NOT NULL);
CREATE TABLE public.school_notices (id varchar PRIMARY KEY, school_id varchar NOT NULL, class_id varchar);
CREATE TABLE public.notice_reads (id varchar PRIMARY KEY, school_id varchar NOT NULL, notice_id varchar NOT NULL, user_id varchar NOT NULL, parent_id varchar);
CREATE TABLE public.teacher_subjects (id varchar PRIMARY KEY, school_id varchar NOT NULL, teacher_id varchar NOT NULL, subject_id varchar NOT NULL);

INSERT INTO public.teacher_subjects VALUES ('ts-a','school-a','teacher-a','subject-a');
INSERT INTO public.users(id,school_id) VALUES ('admin-a','school-a'),('admin-b','school-b'),('teacher-a-user','school-a'),('teacher-b-user','school-b'),('super-admin',NULL);
INSERT INTO public.users(id,school_id,branch_id) VALUES ('branch-user','school-a','branch-a');
INSERT INTO public.school_branches VALUES ('branch-a','school-a'),('branch-b','school-b');
INSERT INTO public.class_groups VALUES ('group-a','school-a'),('group-b','school-b');
INSERT INTO public.classes VALUES ('class-a','school-a','teacher-a-user','branch-a'),('class-b','school-b','teacher-b-user','branch-b');
INSERT INTO public.students VALUES ('student-a','school-a','class-a','branch-a'),('student-b','school-b','class-b','branch-b');
INSERT INTO public.subjects VALUES ('subject-a','school-a'),('subject-b','school-b');
INSERT INTO public.teachers VALUES ('teacher-a','school-a','teacher-a-user'),('teacher-b','school-b','teacher-b-user');
INSERT INTO public.class_subjects VALUES ('cs-a','school-a','class-a','subject-a','teacher-a');
INSERT INTO public.inventory_items VALUES ('item-a','school-a'),('item-b','school-b');
INSERT INTO public.inventory_transactions VALUES ('invtx-a','school-a','item-a');
INSERT INTO public.class_sections VALUES ('section-a','school-a','group-a','class-a'),('section-b','school-b','group-b','class-b');
INSERT INTO public.assignments VALUES ('assignment-a','school-a','class-a','subject-a','teacher-a-user');
INSERT INTO public.fee_structures VALUES ('fee-a','school-a','class-a'),('fee-b','school-b','class-b');
INSERT INTO public.school_expenses VALUES ('expense-a','school-a'),('expense-b','school-b');
INSERT INTO public.bank_statement_entries VALUES ('statement-a','school-a',NULL,'expense-a'),('statement-b','school-b',NULL,'expense-b');
INSERT INTO public.promotions VALUES ('promotion-a','school-a','class-a','class-a','student-a');
INSERT INTO public.promotion_history VALUES ('history-a','school-a','class-a','student-a');
INSERT INTO public.school_document_templates VALUES ('00000000-0000-0000-0000-000000000001','school-a'),('00000000-0000-0000-0000-000000000002','school-b');
INSERT INTO public.school_documents VALUES ('10000000-0000-0000-0000-000000000001','school-a','class-a','student-a','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','school-b','class-b','student-b','00000000-0000-0000-0000-000000000002');
INSERT INTO public.school_document_audit_events VALUES ('audit-a','school-a','10000000-0000-0000-0000-000000000001');
INSERT INTO public.school_document_permissions VALUES ('permission-a','school-a','10000000-0000-0000-0000-000000000001','admin-a');
INSERT INTO public.school_document_versions VALUES ('version-a','school-a','10000000-0000-0000-0000-000000000001');
INSERT INTO public.student_document_attachments VALUES ('attachment-a','school-a','student-a');
INSERT INTO public.staff_roles VALUES ('role-a','school-a'),('role-b','school-b');
INSERT INTO public.staff_members(id,school_id,user_id,role_id) VALUES ('staff-a','school-a','teacher-a-user','role-a');
INSERT INTO public.payroll_records VALUES ('payroll-a','school-a','teacher-a-user');
INSERT INTO public.school_notices VALUES ('notice-a','school-a','class-a'),('notice-b','school-b','class-b');
INSERT INTO public.notice_reads VALUES ('notice-read-a','school-a','notice-a','teacher-a-user','admin-a');
INSERT INTO public.bank_statement_allocations VALUES ('allocation-a','school-a','statement-a',NULL,'expense-a');
INSERT INTO public.student_invoices VALUES ('invoice-a','school-a','student-a','admin-a'),('invoice-b','school-b','student-b','admin-b');

\i supabase/migrations/20261126110000_multischool_composite_foreign_keys.sql
\i supabase/migrations/20261126110000_multischool_composite_foreign_keys.sql

DO $checks$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='assignment_submissions' AND column_name='school_id') <> 'NO' THEN
    RAISE EXCEPTION 'assignment_submissions.school_id must be NOT NULL';
  END IF;
  IF to_regclass('public.bank_statement_entries_id_school_uidx') IS NULL
     OR to_regclass('public.fee_payments_id_school_uidx') IS NULL
     OR to_regclass('public.school_expenses_id_school_uidx') IS NULL
     OR to_regclass('public.school_document_templates_id_school_uidx') IS NULL
     OR to_regclass('public.school_documents_id_school_uidx') IS NULL
     OR to_regclass('public.staff_roles_id_school_uidx') IS NULL
     OR to_regclass('public.school_notices_id_school_uidx') IS NULL
     OR to_regclass('public.idx_promotion_history_class_school_fk') IS NULL
     OR to_regclass('public.idx_promotion_history_student_school_fk') IS NULL
     OR to_regclass('public.idx_promotions_class_from_school_fk') IS NULL
     OR to_regclass('public.idx_promotions_class_to_school_fk') IS NULL
     OR to_regclass('public.idx_school_documents_class_school_fk') IS NULL
     OR to_regclass('public.idx_school_documents_student_school_fk') IS NULL
     OR to_regclass('public.idx_school_documents_template_school_fk') IS NULL
     OR to_regclass('public.idx_school_notices_class_school_fk') IS NULL
     OR to_regclass('public.idx_users_branch_school_fk') IS NULL THEN
    RAISE EXCEPTION 'finance/document/notice tenant indexes are missing';
  END IF;
  IF to_regclass('public.school_branches_id_school_uidx') IS NULL
     OR to_regclass('public.idx_classes_branch_school_fk') IS NULL
     OR to_regclass('public.idx_class_sections_class_school_fk') IS NULL
     OR to_regclass('public.idx_class_sections_legacy_class_school_fk') IS NULL
     OR to_regclass('public.idx_students_branch_school_fk') IS NULL
     OR to_regclass('public.idx_timetable_slots_class_school_fk') IS NULL
     OR to_regclass('public.idx_timetable_slots_subject_school_fk') IS NULL
     OR to_regclass('public.idx_timetable_slots_teacher_school_fk') IS NULL
     OR to_regclass('public.idx_parent_students_student_school_fk') IS NULL
     OR to_regclass('public.idx_parent_students_parent_school_fk') IS NULL
     OR to_regclass('public.idx_communication_queue_student_school_fk') IS NULL THEN
    RAISE EXCEPTION 'a student/parent/timetable tenant index is missing';
  END IF;
  IF to_regclass('public.idx_inventory_transactions_item_school_fk') IS NULL THEN
    RAISE EXCEPTION 'inventory tenant index is missing';
  END IF;
  IF to_regclass('public.idx_admission_applications_student_school_fk') IS NULL
     OR to_regclass('public.idx_assignment_submissions_assignment_school_fk') IS NULL
     OR to_regclass('public.idx_assignments_subject_school_fk') IS NULL
     OR to_regclass('public.idx_assignments_teacher_school_fk') IS NULL
     OR to_regclass('public.idx_fee_payments_structure_school_fk') IS NULL
     OR to_regclass('public.idx_form_teacher_comments_teacher_school_fk') IS NULL
     OR to_regclass('public.idx_staff_members_user_school_fk') IS NULL
     OR to_regclass('public.idx_student_invoice_items_structure_school_fk') IS NULL
     OR to_regclass('public.idx_student_marks_subject_school_fk') IS NULL
     OR to_regclass('public.idx_student_marks_submitter_school_fk') IS NULL
     OR to_regclass('public.idx_teachers_user_school_fk') IS NULL THEN
    RAISE EXCEPTION 'a composite foreign-key child index is missing';
  END IF;
  BEGIN INSERT INTO public.assignments VALUES ('bad-a','school-a','class-b','subject-a','teacher-a-user'); RAISE EXCEPTION 'cross-school assignment accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.students VALUES ('bad-student','school-a','class-b',NULL); RAISE EXCEPTION 'cross-school student class accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.classes VALUES ('bad-class','school-a','teacher-a-user','branch-b'); RAISE EXCEPTION 'cross-school class branch accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.class_sections VALUES ('bad-section','school-a','group-b',NULL); RAISE EXCEPTION 'cross-school class group accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.class_sections VALUES ('bad-legacy-section','school-a','group-a','class-b'); RAISE EXCEPTION 'cross-school legacy class accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.timetable_slots VALUES ('bad-slot','school-a','class-a','subject-a','teacher-b'); RAISE EXCEPTION 'cross-school timetable teacher accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.parent_students VALUES ('bad-parent-link','school-a','admin-b','student-a'); RAISE EXCEPTION 'cross-school parent link accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.communication_queue VALUES ('bad-queue','school-a','student-b'); RAISE EXCEPTION 'cross-school communication student accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.teacher_unavailability VALUES ('bad-unavailability','school-a','teacher-b'); RAISE EXCEPTION 'cross-school teacher availability accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.class_subjects VALUES ('bad-cs','school-a','class-b','subject-a','teacher-a'); RAISE EXCEPTION 'cross-school class-subject class accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.class_subjects VALUES ('bad-cs-subject','school-a','class-a','subject-b','teacher-a'); RAISE EXCEPTION 'cross-school class-subject subject accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.inventory_transactions VALUES ('bad-invtx','school-a','item-b'); RAISE EXCEPTION 'cross-school inventory transaction accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.bank_statement_allocations VALUES ('bad-allocation','school-a','statement-b',NULL,NULL); RAISE EXCEPTION 'cross-school statement allocation accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.promotions VALUES ('bad-promotion','school-a','class-b','class-a','student-a'); RAISE EXCEPTION 'cross-school promotion class accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.promotion_history VALUES ('bad-history','school-a','class-a','student-b'); RAISE EXCEPTION 'cross-school promotion history student accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.school_documents VALUES ('20000000-0000-0000-0000-000000000003','school-a',NULL,NULL,'00000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'cross-school document template accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.school_document_permissions VALUES ('bad-permission','school-a','10000000-0000-0000-0000-000000000001','admin-b'); RAISE EXCEPTION 'cross-school document permission user accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.student_document_attachments VALUES ('bad-attachment','school-a','student-b'); RAISE EXCEPTION 'cross-school student attachment accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.staff_members(id,school_id,user_id,role_id) VALUES ('bad-staff','school-a','teacher-a-user','role-b'); RAISE EXCEPTION 'cross-school staff role accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.payroll_records VALUES ('bad-payroll','school-a','teacher-b-user'); RAISE EXCEPTION 'cross-school payroll user accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.school_notices VALUES ('bad-notice','school-a','class-b'); RAISE EXCEPTION 'cross-school notice class accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.notice_reads VALUES ('bad-notice-read','school-a','notice-a','teacher-a-user','admin-b'); RAISE EXCEPTION 'cross-school notice parent accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.users(id,school_id,branch_id) VALUES ('bad-branch-user','school-a','branch-b'); RAISE EXCEPTION 'cross-school user branch accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.attendance_records VALUES ('bad-att','school-a','class-a','student-b','admin-a'); RAISE EXCEPTION 'cross-school attendance accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.fee_payments VALUES ('bad-pay','school-a','student-a','fee-a','invoice-b','admin-a',NULL); RAISE EXCEPTION 'cross-school payment accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.student_marks VALUES ('bad-mark','school-a','class-a','student-a','subject-b','admin-a',NULL); RAISE EXCEPTION 'cross-school mark accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.form_teacher_comments VALUES ('bad-comment','school-a','class-a','student-a','teacher-b-user'); RAISE EXCEPTION 'cross-school teacher comment accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.teachers VALUES ('bad-teacher','school-a','teacher-b-user'); RAISE EXCEPTION 'cross-school teacher login accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.teacher_subjects VALUES ('bad-ts','school-c','teacher-a','subject-a'); RAISE EXCEPTION 'orphan teacher subject school accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.assignment_submissions VALUES ('bad-sub','school-a','assignment-a','student-b'); RAISE EXCEPTION 'cross-school submission accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.admission_applications VALUES ('bad-admission','school-a','class-b',NULL); RAISE EXCEPTION 'cross-school admission class accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.student_invoice_items VALUES ('bad-item','school-a','invoice-b',NULL); RAISE EXCEPTION 'cross-school invoice item accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO public.fee_payments VALUES ('pay-a','school-a','student-a','fee-a','invoice-a','admin-a',NULL);
  INSERT INTO public.fee_payments VALUES ('super-admin-pay','school-a','student-a',NULL,'invoice-a','super-admin',NULL);
  INSERT INTO public.student_marks VALUES ('super-admin-mark','school-a','class-a','student-a','subject-a',NULL,'super-admin');
  DELETE FROM public.fee_structures WHERE id='fee-a';
  IF (SELECT fee_structure_id FROM public.fee_payments WHERE id='pay-a') IS NOT NULL THEN RAISE EXCEPTION 'SET NULL behavior changed'; END IF;
END
$checks$;
SELECT 'Multi-school composite FK checks passed' AS result;
