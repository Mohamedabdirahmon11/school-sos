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
});
