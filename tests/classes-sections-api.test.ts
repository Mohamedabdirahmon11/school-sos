import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('Class create and update enforce school/year/grade/section uniqueness with HTTP 409', () => {
  assert.match(api, /hasActiveClassIdentityConflict\(existingClasses, \{ academicYear, gradeLevel, kindergartenLevel, section \}\)/);
  assert.match(api, /hasActiveClassIdentityConflict\(allClasses,[\s\S]*existing\.id\)/);
  assert.ok(api.includes("Grade ${gradeLevel} · Section ${section || '—'}"));
  assert.match(api, /Another active class already uses this school\/year\/grade\/section/);
});

test('Form Teacher is limited to one active class on create and update', () => {
  assert.match(api, /hasActiveFormTeacherConflict\(existingClasses, String\(req\.body\.classTeacherId\)\)/);
  assert.match(api, /hasActiveFormTeacherConflict\(allClasses, String\(req\.body\.classTeacherId\), existing\.id\)/);
});

test('Class archive refuses linked records with HTTP 409 and preserves the class row', () => {
  const route = api.slice(api.indexOf("apiRouter.delete('/classes/:id'"), api.indexOf("const classGroupsClient"));
  assert.match(route, /findClassDependency\(classGroupsClient\(\), school\.id, klass\.id\)/);
  assert.match(route, /res\.status\(409\)/);
  assert.match(route, /isArchived: true/);
  assert.doesNotMatch(route, /\.delete\(\)/);
});
