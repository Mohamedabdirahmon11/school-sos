import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const studentsViewSource = readFileSync(new URL('../src/components/schooladmin/StudentsView.tsx', import.meta.url), 'utf8');
const attendanceViewSource = readFileSync(new URL('../src/components/schooladmin/AttendanceView.tsx', import.meta.url), 'utf8');

test('whole-class response is opt-in for the School Admin student directory only', () => {
  assert.match(apiSource, /req\.query\.allClass === 'true'/);
  assert.match(clientSource, /if \(allClass\) params\.append\('allClass', 'true'\)/);
  assert.match(studentsViewSource, /allClass: showAllClass/);
  assert.doesNotMatch(attendanceViewSource, /allClass/);
});

test('class detail roster is sorted by student name like the main student directory', () => {
  assert.match(apiSource, /db\.queryPage\('students', \{ school_id: school\.id, class_id: klass\.id \}, page, pageSize, orFilter, LIST_QUERY_COLUMNS\.students, 'first_name,middle_name,last_name,student_id'\)/);
});

test('School Admin directory orders students by class roll number and exposes the roll number clearly', () => {
  assert.match(apiSource, /compareStudentsByRollNumber/);
  assert.match(apiSource, /LIST_QUERY_COLUMNS\.students, 'roll_number'/);
  assert.match(apiSource, /enrollmentByStudent\.get\(String\(a\.id\)\)/);
  assert.match(studentsViewSource, /visibleStudents = \[\.\.\.students\]\.sort\(compareRollNumber\)/);
  assert.match(studentsViewSource, /Roll No\./);
});
