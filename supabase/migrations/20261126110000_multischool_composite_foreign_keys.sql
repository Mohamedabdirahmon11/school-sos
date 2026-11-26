-- Enforce same-school relationships at the database boundary.
-- Existing rows were audited for cross-school mismatches before this migration was authored.
-- NOT VALID avoids a long initial table scan during ADD; VALIDATE below verifies all existing rows.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS assignments_id_school_uidx
  ON public.assignments (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS fee_structures_id_school_uidx
  ON public.fee_structures (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS student_invoices_id_school_uidx
  ON public.student_invoices (id, school_id);

CREATE UNIQUE INDEX IF NOT EXISTS school_branches_id_school_uidx
  ON public.school_branches (id, school_id);

-- Parent keys and child-side indexes for finance reconciliation, documents and notices.
CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_entries_id_school_uidx ON public.bank_statement_entries (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_id_school_uidx ON public.fee_payments (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_expenses_id_school_uidx ON public.school_expenses (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_document_templates_id_school_uidx ON public.school_document_templates (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_documents_id_school_uidx ON public.school_documents (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS staff_roles_id_school_uidx ON public.staff_roles (id, school_id);
CREATE UNIQUE INDEX IF NOT EXISTS school_notices_id_school_uidx ON public.school_notices (id, school_id);
CREATE INDEX IF NOT EXISTS idx_promotion_history_class_school_fk ON public.promotion_history (class_id, school_id);
CREATE INDEX IF NOT EXISTS idx_promotion_history_student_school_fk ON public.promotion_history (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_promotions_class_from_school_fk ON public.promotions (class_from_id, school_id);
CREATE INDEX IF NOT EXISTS idx_promotions_class_to_school_fk ON public.promotions (class_to_id, school_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_class_school_fk ON public.school_documents (class_id, school_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_student_school_fk ON public.school_documents (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_school_documents_template_school_fk ON public.school_documents (template_id, school_id);
CREATE INDEX IF NOT EXISTS idx_school_notices_class_school_fk ON public.school_notices (class_id, school_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_school_fk ON public.users (branch_id, school_id);

-- Child-side indexes for academic, timetable, parent and school-branch links.
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_school_fk ON public.inventory_transactions (item_id, school_id);
CREATE INDEX IF NOT EXISTS idx_classes_branch_school_fk ON public.classes (branch_id, school_id);
CREATE INDEX IF NOT EXISTS idx_class_sections_class_school_fk ON public.class_sections (class_id, school_id);
CREATE INDEX IF NOT EXISTS idx_class_sections_legacy_class_school_fk ON public.class_sections (legacy_class_id, school_id);
CREATE INDEX IF NOT EXISTS idx_students_branch_school_fk ON public.students (branch_id, school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_class_school_fk ON public.timetable_slots (class_id, school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_subject_school_fk ON public.timetable_slots (subject_id, school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_teacher_school_fk ON public.timetable_slots (teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student_school_fk ON public.parent_students (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_parent_school_fk ON public.parent_students (parent_id, school_id);
CREATE INDEX IF NOT EXISTS idx_communication_queue_student_school_fk ON public.communication_queue (student_id, school_id);

-- Cover the child-side columns of the new composite foreign keys.
CREATE INDEX IF NOT EXISTS idx_admission_applications_student_school_fk ON public.admission_applications (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_school_fk ON public.assignment_submissions (assignment_id, school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_subject_school_fk ON public.assignments (subject_id, school_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_school_fk ON public.assignments (teacher_id, school_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_structure_school_fk ON public.fee_payments (fee_structure_id, school_id);
CREATE INDEX IF NOT EXISTS idx_form_teacher_comments_teacher_school_fk ON public.form_teacher_comments (teacher_user_id, school_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_user_school_fk ON public.staff_members (user_id, school_id);
CREATE INDEX IF NOT EXISTS idx_student_invoice_items_structure_school_fk ON public.student_invoice_items (fee_structure_id, school_id);
CREATE INDEX IF NOT EXISTS idx_student_marks_subject_school_fk ON public.student_marks (subject_id, school_id);
CREATE INDEX IF NOT EXISTS idx_student_marks_submitter_school_fk ON public.student_marks (submitted_by, school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user_school_fk ON public.teachers (user_id, school_id);

-- A submission without a tenant key cannot be safely isolated.
ALTER TABLE public.assignment_submissions
  ALTER COLUMN school_id SET NOT NULL;

DO $constraints$
BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_allocations'::regclass AND conname='bank_statement_allocations_entry_school_fk') THEN
    ALTER TABLE public.bank_statement_allocations ADD CONSTRAINT bank_statement_allocations_entry_school_fk
      FOREIGN KEY (statement_entry_id, school_id) REFERENCES public.bank_statement_entries(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_allocations'::regclass AND conname='bank_statement_allocations_payment_school_fk') THEN
    ALTER TABLE public.bank_statement_allocations ADD CONSTRAINT bank_statement_allocations_payment_school_fk
      FOREIGN KEY (payment_id, school_id) REFERENCES public.fee_payments(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_allocations'::regclass AND conname='bank_statement_allocations_expense_school_fk') THEN
    ALTER TABLE public.bank_statement_allocations ADD CONSTRAINT bank_statement_allocations_expense_school_fk
      FOREIGN KEY (expense_id, school_id) REFERENCES public.school_expenses(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_entries'::regclass AND conname='bank_statement_entries_payment_school_fk') THEN
    ALTER TABLE public.bank_statement_entries ADD CONSTRAINT bank_statement_entries_payment_school_fk
      FOREIGN KEY (matched_payment_id, school_id) REFERENCES public.fee_payments(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.bank_statement_entries'::regclass AND conname='bank_statement_entries_expense_school_fk') THEN
    ALTER TABLE public.bank_statement_entries ADD CONSTRAINT bank_statement_entries_expense_school_fk
      FOREIGN KEY (matched_expense_id, school_id) REFERENCES public.school_expenses(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotions'::regclass AND conname='promotions_class_from_school_fk') THEN
    ALTER TABLE public.promotions ADD CONSTRAINT promotions_class_from_school_fk
      FOREIGN KEY (class_from_id, school_id) REFERENCES public.classes(id, school_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotions'::regclass AND conname='promotions_class_to_school_fk') THEN
    ALTER TABLE public.promotions ADD CONSTRAINT promotions_class_to_school_fk
      FOREIGN KEY (class_to_id, school_id) REFERENCES public.classes(id, school_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotions'::regclass AND conname='promotions_student_school_fk') THEN
    ALTER TABLE public.promotions ADD CONSTRAINT promotions_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_history'::regclass AND conname='promotion_history_class_school_fk') THEN
    ALTER TABLE public.promotion_history ADD CONSTRAINT promotion_history_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.promotion_history'::regclass AND conname='promotion_history_student_school_fk') THEN
    ALTER TABLE public.promotion_history ADD CONSTRAINT promotion_history_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_documents'::regclass AND conname='school_documents_class_school_fk') THEN
    ALTER TABLE public.school_documents ADD CONSTRAINT school_documents_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE SET NULL (class_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_documents'::regclass AND conname='school_documents_student_school_fk') THEN
    ALTER TABLE public.school_documents ADD CONSTRAINT school_documents_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE SET NULL (student_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_documents'::regclass AND conname='school_documents_template_school_fk') THEN
    ALTER TABLE public.school_documents ADD CONSTRAINT school_documents_template_school_fk
      FOREIGN KEY (template_id, school_id) REFERENCES public.school_document_templates(id, school_id) ON DELETE SET NULL (template_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_document_audit_events'::regclass AND conname='school_document_audit_events_document_school_fk') THEN
    ALTER TABLE public.school_document_audit_events ADD CONSTRAINT school_document_audit_events_document_school_fk
      FOREIGN KEY (document_id, school_id) REFERENCES public.school_documents(id, school_id) ON DELETE SET NULL (document_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_document_permissions'::regclass AND conname='school_document_permissions_document_school_fk') THEN
    ALTER TABLE public.school_document_permissions ADD CONSTRAINT school_document_permissions_document_school_fk
      FOREIGN KEY (document_id, school_id) REFERENCES public.school_documents(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_document_permissions'::regclass AND conname='school_document_permissions_user_school_fk') THEN
    ALTER TABLE public.school_document_permissions ADD CONSTRAINT school_document_permissions_user_school_fk
      FOREIGN KEY (user_id, school_id) REFERENCES public.users(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_document_versions'::regclass AND conname='school_document_versions_document_school_fk') THEN
    ALTER TABLE public.school_document_versions ADD CONSTRAINT school_document_versions_document_school_fk
      FOREIGN KEY (document_id, school_id) REFERENCES public.school_documents(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_document_attachments'::regclass AND conname='student_document_attachments_student_school_fk') THEN
    ALTER TABLE public.student_document_attachments ADD CONSTRAINT student_document_attachments_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.staff_members'::regclass AND conname='staff_members_role_school_fk') THEN
    ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_role_school_fk
      FOREIGN KEY (role_id, school_id) REFERENCES public.staff_roles(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_records'::regclass AND conname='payroll_records_user_school_fk') THEN
    ALTER TABLE public.payroll_records ADD CONSTRAINT payroll_records_user_school_fk
      FOREIGN KEY (user_id, school_id) REFERENCES public.users(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.school_notices'::regclass AND conname='school_notices_class_school_fk') THEN
    ALTER TABLE public.school_notices ADD CONSTRAINT school_notices_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE SET NULL (class_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notice_reads'::regclass AND conname='notice_reads_notice_school_fk') THEN
    ALTER TABLE public.notice_reads ADD CONSTRAINT notice_reads_notice_school_fk
      FOREIGN KEY (notice_id, school_id) REFERENCES public.school_notices(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notice_reads'::regclass AND conname='notice_reads_user_school_fk') THEN
    ALTER TABLE public.notice_reads ADD CONSTRAINT notice_reads_user_school_fk
      FOREIGN KEY (user_id, school_id) REFERENCES public.users(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.notice_reads'::regclass AND conname='notice_reads_parent_school_fk') THEN
    ALTER TABLE public.notice_reads ADD CONSTRAINT notice_reads_parent_school_fk
      FOREIGN KEY (parent_id, school_id) REFERENCES public.users(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND conname='users_branch_school_fk') THEN
    ALTER TABLE public.users ADD CONSTRAINT users_branch_school_fk
      FOREIGN KEY (branch_id, school_id) REFERENCES public.school_branches(id, school_id) ON DELETE SET NULL (branch_id) NOT VALID;
  END IF;


  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.students'::regclass AND conname='students_class_school_fk') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.students'::regclass AND conname='students_branch_school_fk') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_branch_school_fk
      FOREIGN KEY (branch_id, school_id) REFERENCES public.school_branches(id, school_id) ON DELETE SET NULL (branch_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.class_subjects'::regclass AND conname='class_subjects_class_school_fk') THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.class_subjects'::regclass AND conname='class_subjects_subject_school_fk') THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_subject_school_fk
      FOREIGN KEY (subject_id, school_id) REFERENCES public.subjects(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transactions'::regclass AND conname='inventory_transactions_item_school_fk') THEN
    ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_item_school_fk
      FOREIGN KEY (item_id, school_id) REFERENCES public.inventory_items(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.classes'::regclass AND conname='classes_branch_school_fk') THEN
    ALTER TABLE public.classes ADD CONSTRAINT classes_branch_school_fk
      FOREIGN KEY (branch_id, school_id) REFERENCES public.school_branches(id, school_id) ON DELETE SET NULL (branch_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.class_sections'::regclass AND conname='class_sections_class_group_school_fk') THEN
    ALTER TABLE public.class_sections ADD CONSTRAINT class_sections_class_group_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.class_groups(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.class_sections'::regclass AND conname='class_sections_legacy_class_school_fk') THEN
    ALTER TABLE public.class_sections ADD CONSTRAINT class_sections_legacy_class_school_fk
      FOREIGN KEY (legacy_class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE SET NULL (legacy_class_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.timetable_slots'::regclass AND conname='timetable_slots_class_school_fk') THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.timetable_slots'::regclass AND conname='timetable_slots_subject_school_fk') THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_subject_school_fk
      FOREIGN KEY (subject_id, school_id) REFERENCES public.subjects(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.timetable_slots'::regclass AND conname='timetable_slots_teacher_school_fk') THEN
    ALTER TABLE public.timetable_slots ADD CONSTRAINT timetable_slots_teacher_school_fk
      FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.parent_students'::regclass AND conname='parent_students_student_school_fk') THEN
    ALTER TABLE public.parent_students ADD CONSTRAINT parent_students_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.parent_students'::regclass AND conname='parent_students_parent_school_fk') THEN
    ALTER TABLE public.parent_students ADD CONSTRAINT parent_students_parent_school_fk
      FOREIGN KEY (parent_id, school_id) REFERENCES public.users(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.communication_queue'::regclass AND conname='communication_queue_student_school_fk') THEN
    ALTER TABLE public.communication_queue ADD CONSTRAINT communication_queue_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE SET NULL (student_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.teacher_subjects'::regclass AND conname='teacher_subjects_school_id_fkey') THEN
    ALTER TABLE public.teacher_subjects ADD CONSTRAINT teacher_subjects_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.admission_applications'::regclass AND conname='admission_applications_class_school_fk') THEN
    ALTER TABLE public.admission_applications ADD CONSTRAINT admission_applications_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.admission_applications'::regclass AND conname='admission_applications_student_school_fk') THEN
    ALTER TABLE public.admission_applications ADD CONSTRAINT admission_applications_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE SET NULL (student_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignment_submissions'::regclass AND conname='assignment_submissions_assignment_school_fk') THEN
    ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_assignment_school_fk
      FOREIGN KEY (assignment_id, school_id) REFERENCES public.assignments(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignment_submissions'::regclass AND conname='assignment_submissions_student_school_fk') THEN
    ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_submissions_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignments'::regclass AND conname='assignments_class_school_fk') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignments'::regclass AND conname='assignments_subject_school_fk') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_subject_school_fk
      FOREIGN KEY (subject_id, school_id) REFERENCES public.subjects(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.assignments'::regclass AND conname='assignments_teacher_school_fk') THEN
    ALTER TABLE public.assignments ADD CONSTRAINT assignments_teacher_school_fk
      FOREIGN KEY (teacher_id, school_id) REFERENCES public.users(id, school_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.attendance_records'::regclass AND conname='attendance_records_class_school_fk') THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.attendance_records'::regclass AND conname='attendance_records_student_school_fk') THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.class_subjects'::regclass AND conname='class_subjects_teacher_school_fk') THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_teacher_school_fk
      FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE SET NULL (teacher_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.inventory_transactions'::regclass AND conname='inventory_transactions_item_school_fk') THEN
    ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_item_school_fk
      FOREIGN KEY (item_id, school_id) REFERENCES public.inventory_items(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.classes'::regclass AND conname='classes_form_teacher_school_fk') THEN
    ALTER TABLE public.classes ADD CONSTRAINT classes_form_teacher_school_fk
      FOREIGN KEY (class_teacher_id, school_id) REFERENCES public.users(id, school_id) ON DELETE SET NULL (class_teacher_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fee_payments'::regclass AND conname='fee_payments_student_school_fk') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fee_payments'::regclass AND conname='fee_payments_structure_school_fk') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_structure_school_fk
      FOREIGN KEY (fee_structure_id, school_id) REFERENCES public.fee_structures(id, school_id) ON DELETE SET NULL (fee_structure_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fee_payments'::regclass AND conname='fee_payments_invoice_school_fk') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_invoice_school_fk
      FOREIGN KEY (invoice_id, school_id) REFERENCES public.student_invoices(id, school_id) ON DELETE SET NULL (invoice_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fee_structures'::regclass AND conname='fee_structures_class_school_fk') THEN
    ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.form_teacher_comments'::regclass AND conname='form_teacher_comments_class_school_fk') THEN
    ALTER TABLE public.form_teacher_comments ADD CONSTRAINT form_teacher_comments_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.form_teacher_comments'::regclass AND conname='form_teacher_comments_student_school_fk') THEN
    ALTER TABLE public.form_teacher_comments ADD CONSTRAINT form_teacher_comments_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.form_teacher_comments'::regclass AND conname='form_teacher_comments_teacher_school_fk') THEN
    ALTER TABLE public.form_teacher_comments ADD CONSTRAINT form_teacher_comments_teacher_school_fk
      FOREIGN KEY (teacher_user_id, school_id) REFERENCES public.users(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_invoice_items'::regclass AND conname='student_invoice_items_invoice_school_fk') THEN
    ALTER TABLE public.student_invoice_items ADD CONSTRAINT student_invoice_items_invoice_school_fk
      FOREIGN KEY (invoice_id, school_id) REFERENCES public.student_invoices(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_invoice_items'::regclass AND conname='student_invoice_items_structure_school_fk') THEN
    ALTER TABLE public.student_invoice_items ADD CONSTRAINT student_invoice_items_structure_school_fk
      FOREIGN KEY (fee_structure_id, school_id) REFERENCES public.fee_structures(id, school_id) ON DELETE SET NULL (fee_structure_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_invoices'::regclass AND conname='student_invoices_student_school_fk') THEN
    ALTER TABLE public.student_invoices ADD CONSTRAINT student_invoices_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_marks'::regclass AND conname='student_marks_class_school_fk') THEN
    ALTER TABLE public.student_marks ADD CONSTRAINT student_marks_class_school_fk
      FOREIGN KEY (class_id, school_id) REFERENCES public.classes(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_marks'::regclass AND conname='student_marks_student_school_fk') THEN
    ALTER TABLE public.student_marks ADD CONSTRAINT student_marks_student_school_fk
      FOREIGN KEY (student_id, school_id) REFERENCES public.students(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_marks'::regclass AND conname='student_marks_subject_school_fk') THEN
    ALTER TABLE public.student_marks ADD CONSTRAINT student_marks_subject_school_fk
      FOREIGN KEY (subject_id, school_id) REFERENCES public.subjects(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_marks'::regclass AND conname='student_marks_submitter_school_fk') THEN
    ALTER TABLE public.student_marks ADD CONSTRAINT student_marks_submitter_school_fk
      FOREIGN KEY (submitted_by, school_id) REFERENCES public.users(id, school_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.teacher_unavailability'::regclass AND conname='teacher_unavailability_teacher_school_fk') THEN
    ALTER TABLE public.teacher_unavailability ADD CONSTRAINT teacher_unavailability_teacher_school_fk
      FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.teachers'::regclass AND conname='teachers_user_school_fk') THEN
    ALTER TABLE public.teachers ADD CONSTRAINT teachers_user_school_fk
      FOREIGN KEY (user_id, school_id) REFERENCES public.users(id, school_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.staff_members'::regclass AND conname='staff_members_user_school_fk') THEN
    ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_user_school_fk
      FOREIGN KEY (user_id, school_id) REFERENCES public.users(id, school_id) ON DELETE SET NULL (user_id) NOT VALID;
  END IF;
END
$constraints$;

ALTER TABLE public.teacher_subjects VALIDATE CONSTRAINT teacher_subjects_school_id_fkey;

ALTER TABLE public.students VALIDATE CONSTRAINT students_class_school_fk;
ALTER TABLE public.students VALIDATE CONSTRAINT students_branch_school_fk;
ALTER TABLE public.inventory_transactions VALIDATE CONSTRAINT inventory_transactions_item_school_fk;
ALTER TABLE public.class_subjects VALIDATE CONSTRAINT class_subjects_class_school_fk;
ALTER TABLE public.class_subjects VALIDATE CONSTRAINT class_subjects_subject_school_fk;
ALTER TABLE public.inventory_transactions VALIDATE CONSTRAINT inventory_transactions_item_school_fk;
ALTER TABLE public.classes VALIDATE CONSTRAINT classes_branch_school_fk;
ALTER TABLE public.class_sections VALIDATE CONSTRAINT class_sections_class_group_school_fk;
ALTER TABLE public.class_sections VALIDATE CONSTRAINT class_sections_legacy_class_school_fk;
ALTER TABLE public.timetable_slots VALIDATE CONSTRAINT timetable_slots_class_school_fk;
ALTER TABLE public.timetable_slots VALIDATE CONSTRAINT timetable_slots_subject_school_fk;
ALTER TABLE public.timetable_slots VALIDATE CONSTRAINT timetable_slots_teacher_school_fk;
ALTER TABLE public.parent_students VALIDATE CONSTRAINT parent_students_student_school_fk;
ALTER TABLE public.parent_students VALIDATE CONSTRAINT parent_students_parent_school_fk;
ALTER TABLE public.communication_queue VALIDATE CONSTRAINT communication_queue_student_school_fk;

ALTER TABLE public.admission_applications VALIDATE CONSTRAINT admission_applications_class_school_fk;
ALTER TABLE public.admission_applications VALIDATE CONSTRAINT admission_applications_student_school_fk;
ALTER TABLE public.assignment_submissions VALIDATE CONSTRAINT assignment_submissions_assignment_school_fk;
ALTER TABLE public.assignment_submissions VALIDATE CONSTRAINT assignment_submissions_student_school_fk;
ALTER TABLE public.assignments VALIDATE CONSTRAINT assignments_class_school_fk;
ALTER TABLE public.assignments VALIDATE CONSTRAINT assignments_subject_school_fk;
ALTER TABLE public.assignments VALIDATE CONSTRAINT assignments_teacher_school_fk;
ALTER TABLE public.attendance_records VALIDATE CONSTRAINT attendance_records_class_school_fk;
ALTER TABLE public.attendance_records VALIDATE CONSTRAINT attendance_records_student_school_fk;
ALTER TABLE public.class_subjects VALIDATE CONSTRAINT class_subjects_teacher_school_fk;
ALTER TABLE public.classes VALIDATE CONSTRAINT classes_form_teacher_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_student_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_structure_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_invoice_school_fk;
ALTER TABLE public.fee_structures VALIDATE CONSTRAINT fee_structures_class_school_fk;
ALTER TABLE public.form_teacher_comments VALIDATE CONSTRAINT form_teacher_comments_class_school_fk;
ALTER TABLE public.form_teacher_comments VALIDATE CONSTRAINT form_teacher_comments_student_school_fk;
ALTER TABLE public.form_teacher_comments VALIDATE CONSTRAINT form_teacher_comments_teacher_school_fk;
ALTER TABLE public.student_invoice_items VALIDATE CONSTRAINT student_invoice_items_invoice_school_fk;
ALTER TABLE public.student_invoice_items VALIDATE CONSTRAINT student_invoice_items_structure_school_fk;
ALTER TABLE public.student_invoices VALIDATE CONSTRAINT student_invoices_student_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_class_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_student_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_subject_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_submitter_school_fk;

ALTER TABLE public.bank_statement_allocations VALIDATE CONSTRAINT bank_statement_allocations_entry_school_fk;
ALTER TABLE public.bank_statement_allocations VALIDATE CONSTRAINT bank_statement_allocations_payment_school_fk;
ALTER TABLE public.bank_statement_allocations VALIDATE CONSTRAINT bank_statement_allocations_expense_school_fk;
ALTER TABLE public.bank_statement_entries VALIDATE CONSTRAINT bank_statement_entries_payment_school_fk;
ALTER TABLE public.bank_statement_entries VALIDATE CONSTRAINT bank_statement_entries_expense_school_fk;
ALTER TABLE public.promotions VALIDATE CONSTRAINT promotions_class_from_school_fk;
ALTER TABLE public.promotions VALIDATE CONSTRAINT promotions_class_to_school_fk;
ALTER TABLE public.promotions VALIDATE CONSTRAINT promotions_student_school_fk;
ALTER TABLE public.promotion_history VALIDATE CONSTRAINT promotion_history_class_school_fk;
ALTER TABLE public.promotion_history VALIDATE CONSTRAINT promotion_history_student_school_fk;
ALTER TABLE public.school_documents VALIDATE CONSTRAINT school_documents_class_school_fk;
ALTER TABLE public.school_documents VALIDATE CONSTRAINT school_documents_student_school_fk;
ALTER TABLE public.school_documents VALIDATE CONSTRAINT school_documents_template_school_fk;
ALTER TABLE public.school_document_audit_events VALIDATE CONSTRAINT school_document_audit_events_document_school_fk;
ALTER TABLE public.school_document_permissions VALIDATE CONSTRAINT school_document_permissions_document_school_fk;
ALTER TABLE public.school_document_permissions VALIDATE CONSTRAINT school_document_permissions_user_school_fk;
ALTER TABLE public.school_document_versions VALIDATE CONSTRAINT school_document_versions_document_school_fk;
ALTER TABLE public.student_document_attachments VALIDATE CONSTRAINT student_document_attachments_student_school_fk;
ALTER TABLE public.staff_members VALIDATE CONSTRAINT staff_members_role_school_fk;
ALTER TABLE public.payroll_records VALIDATE CONSTRAINT payroll_records_user_school_fk;
ALTER TABLE public.school_notices VALIDATE CONSTRAINT school_notices_class_school_fk;
ALTER TABLE public.notice_reads VALIDATE CONSTRAINT notice_reads_notice_school_fk;
ALTER TABLE public.notice_reads VALIDATE CONSTRAINT notice_reads_user_school_fk;
ALTER TABLE public.notice_reads VALIDATE CONSTRAINT notice_reads_parent_school_fk;
ALTER TABLE public.users VALIDATE CONSTRAINT users_branch_school_fk;

ALTER TABLE public.teacher_unavailability VALIDATE CONSTRAINT teacher_unavailability_teacher_school_fk;
ALTER TABLE public.teachers VALIDATE CONSTRAINT teachers_user_school_fk;
ALTER TABLE public.staff_members VALIDATE CONSTRAINT staff_members_user_school_fk;

COMMIT;
