import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const storage = read('../src/server/storage.ts');
const api = read('../src/server/api.ts');
const adminExam = read('../src/components/schooladmin/ExamsResultsView.tsx');
const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
const classImport = read('../src/components/schooladmin/ClassBulkImportWizard.tsx');
const timetable = read('../src/components/schooladmin/TimetableView.tsx');

test('teacher mark submissions are flushed before the API can report success', () => {
  const start = storage.indexOf('public async saveStudentMarks(');
  const end = storage.indexOf('public async forwardClassMarks(', start);
  const method = storage.slice(start, end);
  assert.match(method, /this\.save\(\);\s*await this\.flush\(\);\s*return results;/);
});

test('School Admin mark approval is persisted before the response', () => {
  const start = api.indexOf("apiRouter.post('/exams/approve'");
  const end = api.indexOf('// Semester 1 Results & Ranking', start);
  const route = api.slice(start, end);
  assert.match(route, /db\.approveMarks\(school\.id, uniqueMarkIds, user\.id\);\s*await db\.flush\(\);\s*res\.json/);
});

test('School Admin exam results matrix loads every subject for the selected class', () => {
  assert.match(adminExam, /ApiClient\.getMarks\(selectedClassId, undefined, selectedSemester\)/);
  assert.match(adminExam, /setClassSubjectRows\(classDetails\.subjects \|\| \[\]\)/);
  assert.match(adminExam, /selectedClassSubjects\.map\(subject =>/);
  assert.match(adminExam, /students\.map\(student =>/);
  assert.doesNotMatch(adminExam, /Select Subject to Review/);
});

test('Form Teacher saves editable subjects for the class in one submission action', () => {
  const start = teacher.indexOf('const handleSaveMarks = async');
  const end = teacher.indexOf('const handleForwardClassMarks', start);
  const handler = teacher.slice(start, end);
  assert.match(handler, /editableClassSubjects\.map\(async subject =>/);
  assert.match(handler, /Promise\.all\(/);
  assert.match(handler, /ApiClient\.saveMarks\(selectedClassId, subject\.id, semester, formatted\)/);
  assert.match(teacher, /As Form Teacher, you may complete all subjects for your class/);
});

test('Class bulk import template includes KG and backend accepts KG grade zero', () => {
  assert.match(classImport, /'KG,KG,A/);
  assert.match(classImport, /'KG,KG,B/);
  const start = api.indexOf("apiRouter.post('/classes/bulk-import'");
  const end = api.indexOf("apiRouter.get('/classes'", start);
  const route = api.slice(start, end);
  assert.match(route, /\(KG\|KINDERGARTEN\|NURSERY\)/);
  assert.match(route, /new Set\(\[0,/);
});

test('All-class timetable generation preserves unscheduled classes and reports unfilled lessons', () => {
  const start = api.indexOf("apiRouter.post('/timetable/generate-all'");
  const end = api.indexOf("apiRouter.post('/timetable/generate'", start);
  const route = api.slice(start, end);
  assert.match(timetable, /ApiClient\.generateAllTimetables\(\)/);
  assert.match(route, /req\.body\?\.allClasses !== true/);
  assert.match(route, /No active subject assignments with periods per week/);
  assert.match(route, /previous timetable was kept/);
  assert.match(route, /await db\.replaceTimetableForClass/);
  assert.match(route, /unfilled, skipped, generatedClassIds/);
});
