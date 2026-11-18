import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261118183000_step6_teacher_class_subject_assignments.sql');
const api = read('../src/server/api.ts');
const view = read('../src/components/schooladmin/TeacherAssignmentsView.tsx');
const app = read('../src/App.tsx');
const sidebar = read('../src/components/layout/Sidebar.tsx');

test('Step 6 uses a dedicated table and does not alter homework assignments', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.teacher_class_subject_assignments/);
  assert.doesNotMatch(migration, /ALTER TABLE public\.assignments/);
  assert.match(migration, /INSERT INTO public\.teacher_class_subject_assignments[\s\S]*FROM public\.class_subjects/);
});

test('Step 6 tables have tenant RLS and composite same-school relationships', () => {
  assert.match(migration, /teacher_assignments_school_scope/);
  assert.match(migration, /teacher_assignment_audit_school_read/);
  assert.match(migration, /auth_user_role\(\)::text = 'school_admin'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.teacher_assignment_audit/);
  assert.match(migration, /FOREIGN KEY \(teacher_id, school_id\)[\s\S]*REFERENCES public\.teachers\s*\(id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(subject_id, school_id\)[\s\S]*REFERENCES public\.subjects \(id, school_id\)/);
  assert.match(migration, /teacher_class_subject_assignment_unique/);
});

test('Assignment API requires an active curriculum pair and explicit qualification override', () => {
  assert.match(api, /Maaddadan kuma jirto manhajka fasalkan/);
  assert.match(api, /teacher_subjects/);
  assert.match(api, /body\?\.override !== true/);
  assert.match(api, /teacher-assignments\/teachers\/:teacherId\/workload-limit/);
  assert.match(api, /max_periods_per_week/);
});

test('Assignment API is school-scoped and blocks timetable-dependent deletion without confirmation', () => {
  assert.match(api, /apiRouter\.delete\('\/teacher-assignments\/:id'/);
  assert.match(api, /Qoondeyntan waxaa ku xiran jadwal casharro/);
  assert.match(api, /clearDependentEntries/);
  assert.match(api, /eq\('school_id', school\.id\)/);
});

test('Bulk, replace, and copy endpoints report skipped assignments', () => {
  assert.match(api, /teacher-assignments\/bulk/);
  assert.match(api, /teacher-assignments\/replace-teacher/);
  assert.match(api, /teacher-assignments\/copy/);
  assert.match(api, /skipped/);
});

test('Assignment page includes matrix, teacher workload, filters, and print actions', () => {
  assert.match(view, /Qoondeynta Macallimiinta/);
  assert.match(view, /Matrix/);
  assert.match(view, /Macallin kasta/);
  assert.match(view, /maxPeriodsPerWeek/);
  assert.match(view, /unassignedOnly/);
  assert.match(view, /window\.print/);
});

test('Assignment page is reachable from the School Admin app and sidebar', () => {
  assert.match(app, /TeacherAssignmentsView/);
  assert.match(app, /sch_teacher_assignments/);
  assert.match(sidebar, /sch_teacher_assignments/);
});
