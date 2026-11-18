import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildResultsCsv } from '../src/lib/results-csv.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const grade = (value: number) => (value >= 90 ? 'A' : value >= 50 ? 'C' : 'F');

test('semester results CSV has rank, total subjects, average, grade and status', () => {
  const csv = buildResultsCsv('semester', [
    { rank: 1, student: { studentId: 'S001', firstName: 'Ayaan', middleName: '', lastName: 'Ali' }, subjectCount: 8, averagePercentage: 91.5 },
    { rank: 2, student: { studentId: 'S002', firstName: 'Omar', lastName: 'Nur' }, subjectCount: 8, averagePercentage: 40 }
  ], grade, 50);
  const lines = csv.replace('﻿', '').split('\r\n');
  assert.equal(lines[0], '"Rank","Student ID","Student Name","Subjects Graded","Average (%)","Grade","Status"');
  assert.equal(lines[1], '"1","S001","Ayaan Ali","8","91.5","A","Passing"');
  assert.equal(lines[2], '"2","S002","Omar Nur","8","40","F","Below Pass Mark"');
  assert.ok(csv.startsWith('﻿'));
});

test('yearly results CSV exports the decision and neutralises spreadsheet formulas', () => {
  const csv = buildResultsCsv('yearly', [
    { yearlyRank: 1, student: { studentId: 'S001', firstName: '=HYPERLINK("x")', lastName: 'Ali' }, yearlyPercentage: 70, isPass: true }
  ], grade, 50);
  const line = csv.replace('﻿', '').split('\r\n')[1];
  assert.match(line, /"'=HYPERLINK\(""x""\) Ali"/);
  assert.match(line, /"Promote Candidate"$/);
});

test('timetable generation reports lessons that have no teacher', () => {
  const api = read('../src/server/api.ts');
  assert.match(api, /res\.json\(\{ slots: generated, unfilled, warnings, withoutTeacher: generated\.filter\(slot => !slot\.teacherId\)\.length \}\)/);
  assert.match(api, /withoutTeacher: generatedSlots\.filter\(slot => !slot\.teacherId\)\.length/);
  assert.match(read('../src/components/schooladmin/TimetableView.tsx'), /result\.withoutTeacher/);
});

test('results screens offer CSV download and the teacher portal shows school holidays', () => {
  const exams = read('../src/components/schooladmin/ExamsResultsView.tsx');
  assert.equal((exams.match(/Download CSV/g) || []).length, 2);
  assert.match(read('../src/components/teacher/TeacherPortalView.tsx'), /getSchoolCalendarStatus\(attendanceDate/);
});
