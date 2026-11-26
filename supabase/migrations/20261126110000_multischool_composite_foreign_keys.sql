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

-- A submission without a tenant key cannot be safely isolated.
ALTER TABLE public.assignment_submissions
  ALTER COLUMN school_id SET NOT NULL;

DO $constraints$
BEGIN
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.attendance_records'::regclass AND conname='attendance_records_recorder_school_fk') THEN
    ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_recorder_school_fk
      FOREIGN KEY (recorded_by, school_id) REFERENCES public.users(id, school_id) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.class_subjects'::regclass AND conname='class_subjects_teacher_school_fk') THEN
    ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_teacher_school_fk
      FOREIGN KEY (teacher_id, school_id) REFERENCES public.teachers(id, school_id) ON DELETE SET NULL (teacher_id) NOT VALID;
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fee_payments'::regclass AND conname='fee_payments_recorder_school_fk') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_recorder_school_fk
      FOREIGN KEY (recorded_by, school_id) REFERENCES public.users(id, school_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fee_payments'::regclass AND conname='fee_payments_voider_school_fk') THEN
    ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_voider_school_fk
      FOREIGN KEY (voided_by, school_id) REFERENCES public.users(id, school_id) NOT VALID;
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_invoices'::regclass AND conname='student_invoices_creator_school_fk') THEN
    ALTER TABLE public.student_invoices ADD CONSTRAINT student_invoices_creator_school_fk
      FOREIGN KEY (created_by, school_id) REFERENCES public.users(id, school_id) ON DELETE SET NULL (created_by) NOT VALID;
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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.student_marks'::regclass AND conname='student_marks_approver_school_fk') THEN
    ALTER TABLE public.student_marks ADD CONSTRAINT student_marks_approver_school_fk
      FOREIGN KEY (approved_by, school_id) REFERENCES public.users(id, school_id) NOT VALID;
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
ALTER TABLE public.admission_applications VALIDATE CONSTRAINT admission_applications_class_school_fk;
ALTER TABLE public.admission_applications VALIDATE CONSTRAINT admission_applications_student_school_fk;
ALTER TABLE public.assignment_submissions VALIDATE CONSTRAINT assignment_submissions_assignment_school_fk;
ALTER TABLE public.assignment_submissions VALIDATE CONSTRAINT assignment_submissions_student_school_fk;
ALTER TABLE public.assignments VALIDATE CONSTRAINT assignments_class_school_fk;
ALTER TABLE public.assignments VALIDATE CONSTRAINT assignments_subject_school_fk;
ALTER TABLE public.assignments VALIDATE CONSTRAINT assignments_teacher_school_fk;
ALTER TABLE public.attendance_records VALIDATE CONSTRAINT attendance_records_class_school_fk;
ALTER TABLE public.attendance_records VALIDATE CONSTRAINT attendance_records_student_school_fk;
ALTER TABLE public.attendance_records VALIDATE CONSTRAINT attendance_records_recorder_school_fk;
ALTER TABLE public.class_subjects VALIDATE CONSTRAINT class_subjects_teacher_school_fk;
ALTER TABLE public.classes VALIDATE CONSTRAINT classes_form_teacher_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_student_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_structure_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_invoice_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_recorder_school_fk;
ALTER TABLE public.fee_payments VALIDATE CONSTRAINT fee_payments_voider_school_fk;
ALTER TABLE public.fee_structures VALIDATE CONSTRAINT fee_structures_class_school_fk;
ALTER TABLE public.form_teacher_comments VALIDATE CONSTRAINT form_teacher_comments_class_school_fk;
ALTER TABLE public.form_teacher_comments VALIDATE CONSTRAINT form_teacher_comments_student_school_fk;
ALTER TABLE public.form_teacher_comments VALIDATE CONSTRAINT form_teacher_comments_teacher_school_fk;
ALTER TABLE public.student_invoice_items VALIDATE CONSTRAINT student_invoice_items_invoice_school_fk;
ALTER TABLE public.student_invoice_items VALIDATE CONSTRAINT student_invoice_items_structure_school_fk;
ALTER TABLE public.student_invoices VALIDATE CONSTRAINT student_invoices_student_school_fk;
ALTER TABLE public.student_invoices VALIDATE CONSTRAINT student_invoices_creator_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_class_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_student_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_subject_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_submitter_school_fk;
ALTER TABLE public.student_marks VALIDATE CONSTRAINT student_marks_approver_school_fk;
ALTER TABLE public.teachers VALIDATE CONSTRAINT teachers_user_school_fk;
ALTER TABLE public.staff_members VALIDATE CONSTRAINT staff_members_user_school_fk;

COMMIT;
