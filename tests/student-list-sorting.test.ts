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

test('class detail roster is sorted by Student ID and pages 50 students', () => {
  assert.match(apiSource, /db\.queryPage\('students', \{ school_id: school\.id, class_id: klass\.id \}, Number\(req\.query\.page\) \|\| 1, Number\(req\.query\.pageSize\) \|\| 20, orFilter, LIST_QUERY_COLUMNS\.students, 'first_name,middle_name,last_name,student_id'\)/);
});
