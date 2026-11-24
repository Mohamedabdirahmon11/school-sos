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

test('School Admin mobile modules use dedicated responsive layouts and keep roll numbers prominent', () => {
  const parentsSource = readFileSync(new URL('../src/components/schooladmin/ParentsView.tsx', import.meta.url), 'utf8');
  const classesSource = readFileSync(new URL('../src/components/schooladmin/ClassesView.tsx', import.meta.url), 'utf8');
  const feesSource = readFileSync(new URL('../src/components/schooladmin/FeesLedgerView.tsx', import.meta.url), 'utf8');
  const settingsSource = readFileSync(new URL('../src/components/schooladmin/SchoolSettingsView.tsx', import.meta.url), 'utf8');
  const timetableSource = readFileSync(new URL('../src/components/schooladmin/TimetableView.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(studentsViewSource, /student-mobile-roll/);
  assert.match(parentsSource, /school-people-parents-page/);
  assert.match(classesSource, /school-admin-classes-page/);
  assert.match(attendanceViewSource, /school-admin-attendance-page/);
  assert.match(feesSource, /school-admin-fees-page/);
  assert.match(settingsSource, /school-admin-settings-page/);
  assert.match(timetableSource, /school-admin-timetable-page/);
  for (const selector of ['.school-people-parents-page tbody tr', '.school-admin-classes-page .scroll tbody tr', '.school-admin-attendance-page', '.school-admin-fees-page', '.school-admin-settings-page', '.school-admin-timetable-page']) {
    assert.ok(styles.includes(selector), 'missing responsive module style: ' + selector);
  }
});
