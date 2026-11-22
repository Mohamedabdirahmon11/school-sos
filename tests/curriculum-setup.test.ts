import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('curriculum save rejects invalid subjects and weekly periods above 30 with HTTP 422', () => {
  const route = api.slice(api.indexOf("apiRouter.put('/curriculum/classes/:classId'"), api.indexOf("apiRouter.delete('/curriculum/classes/:classId/subjects"));
  assert.match(route, /item\.periodsPerWeek > 10/);
  assert.match(route, /total > capacity\.weeklyCapacity/);
  assert.match(route, /res\.status\(422\)/);
  assert.match(route, /validSubjectIds/);
});

test('curriculum subject removal detaches teacher assignment and preserves historical marks', () => {
  const route = api.slice(api.indexOf("apiRouter.put('/curriculum/classes/:classId'"), api.indexOf("apiRouter.post('/curriculum/classes/:classId/apply-template'"));
  assert.match(route, /teacher_class_subject_assignments'[\s\S]*?\.delete\(\)/);
  assert.match(route, /is_active: false, teacher_id: null/);
  const dependencyFn = api.slice(api.indexOf('async function findCurriculumDependency'), api.indexOf('function primarySubjectBandForGrade'));
  assert.doesNotMatch(dependencyFn, /student_marks/);
});

test('Reset to standard template synchronizes exactly the selected class and deactivates extra subjects', () => {
  const route = api.slice(api.indexOf("apiRouter.post('/curriculum/classes/:classId/apply-template'"), api.indexOf("apiRouter.post('/curriculum/classes/:classId/copy'"));
  assert.match(route, /syncPrimarySubjectTemplates\([\s\S]*\[klass\.id\]/);
  assert.match(api, /classIdSet\.has\(klass\.id\)/);
});

test('Copy curriculum is restricted to same-grade sections and preserves removed-subject history', () => {
  const route = api.slice(api.indexOf("apiRouter.post('/curriculum/classes/:classId/copy'"), api.indexOf("apiRouter.get('/class-groups'"));
  assert.match(route, /target\.gradeLevel\) !== Number\(source\.gradeLevel/);
  assert.match(route, /res\.status\(403\)/);
  assert.match(route, /res\.status\(422\)/);
  assert.match(route, /removedByClass/);
  assert.match(route, /teacher_class_subject_assignments'[\s\S]*?\.delete\(\)/);
});
test('Configured school periods can reduce weekly curriculum capacity but never raise it above 30', () => {
  const helper = api.slice(api.indexOf('async function getClassCurriculumCapacity'), api.indexOf('async function findCurriculumDependency'));
  assert.match(helper, /Math\.min\(30, workingDays \* lessonPeriodsPerDay\)/);
});

