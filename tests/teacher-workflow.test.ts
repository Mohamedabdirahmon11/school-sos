import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('class teachers submit attendance while administrators review and contact parents', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const admin = read('../src/components/schooladmin/AttendanceView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(teacher, /recordDailyAttendance/);
  assert.doesNotMatch(teacher, /wa\.me/);
  assert.match(admin, /openAbsentStudentWhatsApp/);
  assert.doesNotMatch(admin, /handleSaveAttendance/);
  assert.match(api, /Only the assigned class teacher can submit daily attendance/);
});

test('teachers enter exam marks and school administrators only review and approve', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const admin = read('../src/components/schooladmin/ExamsResultsView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(teacher, /saveMarks\(selectedClassId/);
  assert.doesNotMatch(admin, /handleSaveMarks/);
  assert.match(admin, /handleApproveAll/);
  assert.match(api, /Only assigned teachers can enter and submit exam marks/);
  assert.match(api, /isFormTeacher/);
  assert.match(api, /classTeacherId === user\.id/);
  assert.match(api, /form-teacher-\$\{klass\.id\}-\$\{subject\.id\}/);
});

test('Form Teachers see every student and can complete every subject in their homeroom class', () => {
  const api = read('../src/server/api.ts');
  assert.match(api, /formTeacherClassIds = classes[\s\S]*klass\.classTeacherId === userId/);
  assert.match(api, /isFormTeacher \? classAssignments\.items\.map\(\(item: any\) => item\.subjectId\)/);
  assert.match(api, /mayFillFormTeacherSubject = isFormTeacher && classSubject\.items\.length > 0/);
  assert.match(api, /canEditMarks: true/);
});

test('teacher workspace exposes every teaching task and batch class workflows', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /Teacher workspace navigation/);
  assert.match(teacher, /id: 'dashboard'/);
  assert.match(teacher, /id: 'timetable'/);
  assert.match(teacher, /id: 'attendance'/);
  assert.match(teacher, /id: 'grades'/);
  assert.match(teacher, /id: 'assignments'/);
  assert.match(teacher, /id: 'notices'/);
  assert.match(teacher, /attendanceCounts/);
  assert.match(teacher, /Submit all subjects/);
  assert.match(teacher, /Forward complete class to Admin/);
});

test('teacher appointment supports optional multiple profile tags and one-time school credentials', () => {
  const admin = read('../src/components/schooladmin/TeachersView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(admin, /selectedClassIds/);
  assert.match(admin, /selectedSubjectIds/);
  assert.match(admin, /Teacher ID:/);
  assert.match(admin, /Initial PIN:/);
  assert.match(admin, /Reset PIN/);
  assert.match(api, /Teacher ID and password or PIN are required/);
  assert.match(api, /Every assigned class must belong to this school|Every assigned subject must belong to this school/);
});

test('Form Teacher class and student reads are included in the private Supabase RLS helpers', () => {
  const migration = read('../supabase/migrations/20261111070000_form_teacher_rls_scope.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.auth_can_access_student/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.auth_can_access_class/);
  assert.match(migration, /c\.class_teacher_id = u\.id/);
  assert.match(migration, /c\.id = s\.class_id/);
  assert.match(migration, /c\.school_id = s\.school_id/);
  assert.match(migration, /u\.school_id = c\.school_id AND u\.role = 'teacher'/);
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\./);
});
