import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const assignmentView = readFileSync(new URL('../src/components/schooladmin/TeacherAssignmentsView.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261118183000_step6_teacher_class_subject_assignments.sql', import.meta.url), 'utf8');
const uniqueMigration = readFileSync(new URL('../supabase/migrations/20261122090000_teacher_assignment_unique_class_subject.sql', import.meta.url), 'utf8');

test('Teacher assignments canonicalize same-date Term/Semester aliases and block ambiguous duplicates', () => {
  const check = api.slice(api.indexOf('async function checkTeacherAssignment'), api.indexOf('async function upsertTeacherAssignment'));
  const upsert = api.slice(api.indexOf('async function upsertTeacherAssignment'), api.indexOf("apiRouter.get('/teacher-assignments'"));
  assert.match(check, /samePeriodTerms/);
  assert.match(check, /semester\\s\*\[12\]/i);
  assert.match(check, /termAliasIds\.includes\(String\(row\.term_id\)\)/);
  assert.match(check, /term_alias_ids: termAliasIds/);
  assert.match(upsert, /\.in\('term_id', payload\.term_alias_ids\)/);
  assert.match(upsert, /logicalRows\s*\|\|\s*\[\]\.length > 1|\(logicalRows\s*\|\|\s*\[\]\)\.length > 1/);
  assert.match(upsert, /error\.status = 409/);
});

test('Teacher assignment screen surfaces same-date Term/Semester conflicts without hiding rows', () => {
  const route = api.slice(api.indexOf("apiRouter.get('/teacher-assignments'"), api.indexOf("apiRouter.post('/teacher-assignments'"));
  assert.match(route, /start_date,end_date/);
  assert.match(route, /termAliasConflicts/);
  assert.match(route, /effectiveTermRows/);
  assert.match(route, /termRows\.sort/);
  assert.match(assignmentView, /Qoondeynno Term\/Semester is dul saaran/);
  assert.match(assignmentView, /data\.termAliasConflicts\.map/);
});

test('Teacher assignment requires an active teacher and an active class-subject curriculum row', () => {
  const fn = api.slice(api.indexOf('async function checkTeacherAssignment'), api.indexOf("apiRouter.get('/teacher-assignments'"));
  assert.match(fn, /teacher\.data\.status\)\.toLowerCase\(\) !== 'active'/);
  assert.match(fn, /class_subjects'[\s\S]*?\.eq\('is_active', true\)/);
  assert.match(fn, /error\.status = 422/);
});

test('Teacher weekly workload is capped at 30 and returns HTTP 422 when exceeded', () => {
  const fn = api.slice(api.indexOf('async function checkTeacherAssignment'), api.indexOf("apiRouter.get('/teacher-assignments'"));
  assert.match(fn, /Math\.min\(30/);
  assert.match(fn, /usedPeriods \+ requestedPeriods > teacherLimit/);
  assert.match(fn, /error\.status = 422/);
});

test('Duplicate class-subject-teacher assignment returns HTTP 409', () => {
  assert.match(api, /client\.rpc\('upsert_teacher_assignment_atomic'/);
  assert.match(api, /code === '23505' \? 409/);
  assert.match(migration, /unique.*school_id.*academic_year_id.*class_id.*subject_id/is);
});

test('Teacher assignment workload display and editable limit never exceed 30', () => {
  assert.match(api, /maxPeriodsPerWeek: max/);
  assert.match(api, /value > 30/);
  assert.match(api, /res\.status\(422\)/);
});

test('Teacher timetable clash validation checks both teacher and class period conflicts', () => {
  const timetable = api.slice(api.indexOf("apiRouter.post('/timetable/generate'"), api.indexOf("apiRouter.post('/timetable/generate-all'"));
  assert.match(timetable, /teacher_id/);
  assert.match(timetable, /day_of_week/);
  assert.match(timetable, /period_number/);
  assert.match(timetable, /409/);
});

test('Teacher assignment update preserves HTTP 409 and 422 validation statuses', () => {
  const putRoute = api.slice(api.indexOf("apiRouter.put('/teacher-assignments/:id'"), api.indexOf("apiRouter.delete('/teacher-assignments/:id'"));
  assert.match(putRoute, /Number\(error\?\.status\)/);
  assert.match(putRoute, /409/);
});
test('Assignment uniqueness is per school, year, term, class and subject—not section metadata', () => {
  const unique = uniqueMigration.slice(uniqueMigration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_subject_assignment_unique'));
  assert.match(unique, /school_id, academic_year_id,[\s\S]*class_id,[\s\S]*subject_id/);
  assert.doesNotMatch(unique.split(';')[0], /section_id/);
  const upsert = api.slice(api.indexOf('async function upsertTeacherAssignment'), api.indexOf("apiRouter.get('/teacher-assignments'"));
  assert.doesNotMatch(upsert, /query\.is\('section_id'/);
  assert.doesNotMatch(upsert, /query\.eq\('section_id'/);
});
test('Teacher Assignment uses the shared Academic Setup header and theme stylesheet', () => {
  const view = readFileSync(new URL('../src/components/schooladmin/TeacherAssignmentsView.tsx', import.meta.url), 'utf8');
  const style = readFileSync(new URL('../src/components/schooladmin/academic-setup.css', import.meta.url), 'utf8');
  assert.match(view, /AcademicSetupHeader active="sch_teacher_assignments"/);
  assert.match(view, /className="academic-setup"/);
  assert.match(view, /academic-setup\.css/);
  assert.match(style, /schoolos-assignment-page/);
  assert.doesNotMatch(style, /\\\\n/);
});
test('Unassigned teachers receive HTTP 403 when submitting marks for a class subject', () => {
  const route = api.slice(api.indexOf("apiRouter.post('/exams/marks'"), api.indexOf("apiRouter.post('/exams/forward-class'"));
  assert.match(route, /class_subjects'[\s\S]*?teacher_id: teacherRecord\.id/);
  assert.match(route, /if \(!assignment\.total\)[\s\S]*?res\.status\(403\)/);
});

test('Only the Form Teacher can submit class attendance; other teachers receive HTTP 403', () => {
  const start = api.indexOf("apiRouter.post('/attendance'");
  const end = api.indexOf("\napiRouter.", start + 1);
  const route = api.slice(start, end);
  assert.match(route, /attendanceClass\.classTeacherId !== user\.id/);
  assert.match(route, /res\.status\(403\)/);
});

test('Teacher assignment reads and writes are explicitly isolated by school_id', () => {
  const fn = api.slice(api.indexOf('async function checkTeacherAssignment'), api.indexOf('async function upsertTeacherAssignment'));
  assert.match(fn, /academic_years'[\s\S]*?\.eq\('school_id', school\.id\)/);
  assert.match(fn, /classes'[\s\S]*?\.eq\('school_id', school\.id\)/);
  assert.match(fn, /subjects'[\s\S]*?\.eq\('school_id', school\.id\)/);
  assert.match(fn, /teachers'[\s\S]*?\.eq\('school_id', school\.id\)/);
  assert.match(fn, /teacher_class_subject_assignments'[\s\S]*?\.eq\('school_id', school\.id\)/);
  assert.match(fn, /class_subjects'[\s\S]*?\.eq\('school_id', school\.id\)/);
});

test('Removing a subject from a curriculum detaches assignments without deleting historical marks', () => {
  const sync = api.slice(api.indexOf('async function syncPrimarySubjectTemplates'), api.indexOf('function primarySubjectBandForGrade'));
  assert.match(sync, /teacher_class_subject_assignments'[\s\S]*?\.delete\(\)/);
  assert.match(sync, /class_subjects'[\s\S]*?\.update\(\{ is_active: false, teacher_id: null \}\)/);
  assert.doesNotMatch(sync, /student_marks'[\s\S]*?\.delete\(\)/);
});

test('Form Teachers can read only their own attendance register without a school-wide setup scan', () => {
  const readiness = api.slice(api.indexOf('async function requireSchoolSetupReady'), api.indexOf('async function getTeacherAssignmentReadinessForSchool'));
  assert.match(readiness, /role === 'teacher' && req\.method === 'GET' && req\.path === '\/attendance'/);
  const route = api.slice(api.indexOf("apiRouter.get('/attendance'"), api.indexOf("apiRouter.get('/attendance/month'"));
  assert.match(route, /requireSchoolSetupReady/);
  assert.match(route, /canAccessFormTeacherClass\(req, res, classId as string\)/);
});
