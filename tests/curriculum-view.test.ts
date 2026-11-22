import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const view = readFileSync(new URL('../src/components/schooladmin/CurriculumView.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('Curriculum screen uses live classes, class curriculum and saved subject periods', () => {
  assert.match(view, /fetchAllClasses\(\)/);
  assert.match(view, /ApiClient\.getClassCurriculum/);
  assert.match(view, /ApiClient\.getPrimarySubjectTemplatePeriods/);
  assert.doesNotMatch(view, /localStorage|demo data/i);
});

test('Curriculum screen provides reset, same-grade copy, and weekly period meter', () => {
  assert.match(view, /ApiClient\.applyPrimarySubjectTemplate/);
  assert.match(view, /ApiClient\.copyClassCurriculum/);
  assert.match(view, /Number\(row\.gradeLevel\) === Number\(selectedClass\.gradeLevel\)/);
  assert.match(view, /\\{totalPeriods\\}\\/\\{capacity\\.weeklyCapacity\\}/);
});

test('Curriculum period inputs are limited to 1–10 and total is checked before save', () => {
  assert.match(view, /min=\{1\} max=\{10\}/);
  assert.match(view, /\\{totalPeriods\\}\\/\\{capacity\\.weeklyCapacity\\}/);
  assert.match(view, /ApiClient\.saveClassCurriculum/);
});

test('Server copy requires same grade and academic year and protects marks', () => {
  const route = api.slice(api.indexOf("apiRouter.post('/curriculum/classes/:classId/copy'"), api.indexOf("apiRouter.get('/class-groups'"));
  assert.match(route, /Number\(target\.gradeLevel\) !== Number\(source\.gradeLevel\)/);
  assert.match(route, /String\(target\.academicYear \|\| ''\) !== String\(source\.academicYear \|\| ''\)/);
  assert.match(route, /res\.status\(403\)/);
  assert.match(route, /res\.status\(422\)/);
});
