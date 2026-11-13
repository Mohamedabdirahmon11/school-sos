import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('school setup readiness counts only active teachers and students', () => {
  const start = api.indexOf('async function getSchoolSetupState');
  const end = api.indexOf("apiRouter.get('/school/setup-progress'", start);
  const setup = api.slice(start, end);
  assert.ok(setup.includes("queryAllRows('teachers', { school_id: school.id, status: 'active' }"));
  assert.ok(setup.includes("db.queryPage('students', { school_id: school.id, status: 'active' }, 1, 1, undefined, 'id')"));
  assert.ok(setup.includes("db.queryPage('students', { school_id: school.id, status: 'active' }, 1, 1, 'father_phone.not.is.null,mother_phone.not.is.null', 'id')"));
});
