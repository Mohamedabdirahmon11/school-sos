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
