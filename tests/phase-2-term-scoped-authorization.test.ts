import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261121115111_phase2_term_scoped_authorization.sql', import.meta.url), 'utf8');

test('student marks are tied to a configured term and use normalized active teacher assignments', () => {
  assert.match(migration, /student_marks_sync_term/);
  assert.match(migration, /NEW\.term_id := v_term_id/);
  assert.match(migration, /private\.auth_has_term_assignment/);
  assert.match(migration, /lower\(t\.status\) = 'active'/);
  assert.match(migration, /student_marks_school_term_class_subject_student_idx/);
  assert.match(migration, /status = 'open'/);
});

test('direct attendance writes are Form Teacher only and preserve recorded history', () => {
  assert.match(migration, /attendance_form_teacher_insert/);
  assert.match(migration, /attendance_form_teacher_update/);
  assert.match(migration, /attendance_no_direct_delete/);
  assert.match(migration, /c\.class_teacher_id = private\.auth_user_id\(\)/);
});

test('timetable and enrollment writes are restricted to school administrators', () => {
  assert.match(migration, /timetable_admin_insert_guard/);
  assert.match(migration, /enrollments_admin_insert_guard/);
  assert.match(migration, /enrollments_no_direct_delete/);
});

test('fee write policies require active accountant fee permission and block direct deletion', () => {
  assert.match(migration, /private\.auth_has_staff_permission\('fees_manage'\)/);
  assert.match(migration, /fee_payments_staff_insert_guard/);
  assert.match(migration, /student_invoices_staff_insert_guard/);
  assert.match(migration, /fee_payments_no_direct_delete/);
  assert.match(migration, /student_invoices_no_direct_delete/);
});
