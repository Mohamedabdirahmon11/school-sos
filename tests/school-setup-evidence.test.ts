import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const setupNavigation = readFileSync(new URL('../src/lib/school-setup-navigation.ts', import.meta.url), 'utf8');

test('school setup readiness counts only active teachers and students', () => {
  const start = api.indexOf('async function getSchoolSetupState');
  const end = api.indexOf("apiRouter.get('/school/setup-progress'", start);
  const setup = api.slice(start, end);
  assert.ok(setup.includes("queryAllRows('teachers', { school_id: school.id, status: 'active' }"));
  assert.ok(setup.includes("db.queryPage('students', { school_id: school.id, status: 'active' }, 1, 1, undefined, 'id')"));
  assert.ok(setup.includes("db.queryPage('students', { school_id: school.id, status: 'active' }, 1, 1, 'father_phone.not.is.null,mother_phone.not.is.null', 'id')"));
});

test('school settings are flushed before the onboarding form receives success', () => {
  const start = api.indexOf("apiRouter.put('/school/settings'");
  const end = api.indexOf("apiRouter.post('/school/transport'", start);
  const route = api.slice(start, end);
  assert.ok(route.includes('async (req, res)'));
  assert.ok(route.indexOf('db.logAudit(') < route.indexOf('await db.flush()'));
  assert.ok(route.indexOf('await db.flush()') < route.indexOf('res.json(updated)'));
});


test('both frontend routing and backend dashboard endpoint require full ten-step setup completion', () => {
  assert.ok(app.includes('!isSchoolSetupProgressComplete(school?.setupProgress)'));
  assert.ok(api.includes('!isSchoolSetupProgressComplete(school.setupProgress)'));
  assert.ok(setupNavigation.includes('const required = [1, 2, 3, 4, 5, 6, 8, 10]'));
  assert.ok(setupNavigation.includes('[7, 9].every(step => completed.has(step) || skipped.has(step))'));
});

test('the five-step school profile endpoint never sets the ten-step completion timestamp', () => {
  const start = api.indexOf("apiRouter.put('/school/setup-data'");
  const end = api.indexOf("apiRouter.get('/school/setup-progress'", start);
  const route = api.slice(start, end);
  assert.ok(route.includes('const progress = normalizeSchoolSetupProgress(school.setupProgress)'));
  assert.ok(route.includes('coreSetupCompleted'));
  assert.ok(!route.includes('completedAt: allDone'));
});
