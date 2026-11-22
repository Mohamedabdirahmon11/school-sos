import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('School Setup UI exposes the nine reference steps and the responsive 290px/860px layout', () => {
  const source = read('src/components/schooladmin/SchoolSetupWizard.tsx');
  for (const id of ['profile', 'year', 'classes', 'subjects', 'teachers', 'assign', 'students', 'timetable', 'finish']) {
    assert.match(source, new RegExp(`id: '${id}'`), `missing step ${id}`);
  }
  assert.match(source, /grid-template-columns:290px minmax\(0,1fr\)/);
  assert.match(source, /max-width:860px/);
  assert.match(source, /@media\(max-width:760px\)/);
  assert.match(source, /START HERE/);
  assert.match(source, /Wax ka maqan/);
  assert.match(source, /prefers-color-scheme:dark/);
});

test('setup readiness is shared by API reads and writes and protects attendance, marks, and timetable routes', () => {
  const source = read('src/server/api.ts');
  assert.match(source, /async function evaluateReadiness\(schoolId: string\)/);
  assert.match(source, /async function requireSchoolSetupReady/);
  for (const route of [
    "apiRouter.get('/attendance',",
    "apiRouter.post('/attendance',",
    "apiRouter.put('/attendance',",
    "apiRouter.get('/exams/marks',",
    "apiRouter.post('/exams/marks',",
    "apiRouter.get('/term-marks/entry',",
    "apiRouter.post('/term-marks/entry',",
    "apiRouter.get('/timetable',"
  ]) {
    const line = source.split('\n').find(candidate => candidate.includes(route));
    assert.ok(line?.includes('requireSchoolSetupReady'), `setup gate missing on ${route}`);
  }
  assert.match(source, /res\.status\(423\)\.json\(\{ error: 'Dhammaystir School Setup/);
  assert.match(source, /res\.status\(403\)\.json\(\{ error: 'Your role cannot access school setup operations/);
});

test('completed existing schools are grandfathered and are not relocked by setup gates', () => {
  const source = read('src/server/api.ts');
  assert.match(source, /if \(normalizeSchoolSetupProgress\(school\.setupProgress\)\.completedAt\) \{ next\(\); return; \}/);
  assert.match(source, /const requiredIds = \[1, 2, 3, 4, 5, 0, 6\]/);
});

test('legacy setup checklist identifiers remain mapped to the new wizard evidence', () => {
  const source = read('src/components/schooladmin/SchoolSetupWizard.tsx');
  for (const evidence of ['evidence: 2', 'evidence: 1', 'evidence: 3', 'evidence: 4', 'evidence: 5', 'evidence: 0', 'evidence: 6', 'evidence: 7']) {
    assert.ok(source.includes(evidence), `legacy checklist mapping missing: ${evidence}`);
  }
});


test('teacher assignment writes use the atomic database RPC and migration locks teacher workload', () => {
  const api = read('src/server/api.ts');
  const migration = read('supabase/migrations/20261122120000_atomic_teacher_assignment_upsert.sql');
  assert.match(api, /client\\.rpc\\('upsert_teacher_assignment_atomic'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /used_periods \\+ requested_periods > teacher_limit/);
  assert.match(migration, /INSERT INTO public\\.teacher_assignment_audit/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION .* TO service_role/);
});
