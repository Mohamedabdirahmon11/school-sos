import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Phase 3 dashboard migration is additive, school-scoped, and preserves dashboard payload fields', () => {
  const migration = source('../supabase/migrations/20261121114502_phase3_dashboard_aggregate_indexes.sql');
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_students_school_class_status_student/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_teachers_school_status/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_attendance_school_date_status_class_student/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_fee_payments_school_date_voided/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_fee_payments_school_student_date/);
  assert.match(migration, /'attendanceTrend'/);
  assert.match(migration, /'absentStudents'/);
  assert.match(migration, /'attendanceRecordedToday'/);
  assert.match(migration, /status IN \('present', 'late'\)/);
  assert.match(migration, /status = 'excused'/);
  assert.match(migration, /school_id = p_school_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.school_dashboard_summary/);
  assert.doesNotMatch(migration, /\b(DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM)\b/i);
});

test('screen search is debounced and stale network requests are abortable', () => {
  const hook = source('../src/hooks/useApi.ts');
  const client = source('../src/services/api.ts');
  const students = source('../src/components/schooladmin/StudentsView.tsx');
  const teachers = source('../src/components/schooladmin/TeachersView.tsx');
  const parents = source('../src/components/schooladmin/ParentsView.tsx');
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /controller\.abort\(\)/);
  assert.match(students, /setTimeout\(\(\) => setDebouncedSearch\(search\), 300\)/);
  assert.match(teachers, /setTimeout\(\(\) => setDebouncedSearch\(search\), 300\)/);
  assert.match(parents, /setTimeout\(\(\) => setDebouncedSearch\(search\), 300\)/);
  assert.match(client, /signal: params\?\.signal/);
  assert.match(client, /signal: filters\?\.signal/);
});

test('shared async states and responsive table behavior expose keyboard focus and mobile overflow', () => {
  const asyncState = source('../src/components/common/AsyncState.tsx');
  const errorState = source('../src/components/common/ErrorState.tsx');
  const app = source('../src/App.tsx');
  const css = source('../src/index.css');
  const students = source('../src/components/schooladmin/StudentsView.tsx');
  assert.match(asyncState, /export function LoadingState/);
  assert.match(asyncState, /export function EmptyState/);
  assert.match(asyncState, /Isku day mar kale/);
  assert.match(errorState, /AsyncState\.tsx/);
  assert.match(app, /fallback=\{<LoadingState/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 767px/);
  assert.match(css, /overflow-x: auto/);
  assert.match(students, /hidden overflow-x-auto md:block/);
});

test('CSV, Excel and PDF exports reuse the active student list filters', () => {
  const students = source('../src/components/schooladmin/StudentsView.tsx');
  const teachers = source('../src/components/schooladmin/TeachersView.tsx');
  assert.match(students, /if \(classFilter\) params\.set\('classId', classFilter\)/);
  assert.match(students, /if \(branchFilter\) params\.set\('branchId', branchFilter\)/);
  assert.match(students, /if \(search\.trim\(\)\) params\.set\('search', search\.trim\(\)\)/);
  assert.match(students, /if \(feeFilter !== 'all'\) params\.set\('feeStatus', feeFilter\)/);
  assert.match(students, /if \(genderFilter !== 'all'\) params\.set\('gender', genderFilter\)/);
  assert.match(students, /if \(studentStatusFilter !== 'all'\) params\.set\('status', studentStatusFilter\)/);
  assert.match(students, /students\/export\.pdf\?' \+ buildStudentExportQuery\(\)/);
  assert.match(teachers, /subjectId: subjectFilter/);
});

test('tracked Phase 2 hardening migration matches already-applied database restrictions', () => {
  const migration = source('../supabase/migrations/20261121114448_phase2_security_hardening.sql');
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schoolos_audit_component_mark\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schoolos_create_initial_student_enrollment\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schoolos_guard_component_mark\(\)/);
  assert.match(migration, /SET search_path = ''/);
});
