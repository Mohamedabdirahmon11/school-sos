import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261118183000_step6_teacher_class_subject_assignments.sql', import.meta.url), 'utf8');

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
  assert.match(api, /saved\.error\?\.code === '23505' \? 409/);
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
  const unique = migration.slice(migration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS teacher_class_subject_assignment_unique'));
  assert.match(unique, /school_id, academic_year_id,[\s\S]*class_id,[\s\S]*subject_id/);
  assert.doesNotMatch(unique.split(';')[0], /section_id/);
  const upsert = api.slice(api.indexOf('async function upsertTeacherAssignment'), api.indexOf("apiRouter.get('/teacher-assignments'"));
  assert.doesNotMatch(upsert, /query\.is\('section_id'/);
  assert.doesNotMatch(upsert, /query\.eq\('section_id'/);
});

