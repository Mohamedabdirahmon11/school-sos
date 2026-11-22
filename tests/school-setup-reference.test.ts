import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('School Setup UI exposes the ten requested steps in order and the responsive 290px/860px layout', () => {
  const source = read('src/components/schooladmin/SchoolSetupWizard.tsx');
  const ids = ['year', 'profile', 'classes', 'subjects', 'teachers', 'students', 'timetable', 'attendance', 'fees', 'finish'];
  const positions = ids.map(id => source.indexOf("id: '" + id + "'"));
  assert.ok(positions.every(position => position >= 0), 'all ten setup steps must exist');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'steps must follow the requested order');
  assert.ok(source.includes("view: 'sch_setup_academics'"));
  assert.ok(source.includes("view: 'sch_settings'"));
  assert.ok(source.includes('assignmentEvidence: 0'));
  assert.ok(source.includes('REFERENCE_STEP_BY_PROGRESS_ID'));
  assert.ok(source.includes('Tallaabada {referenceStep + 1} ee {wizardSteps.length}'));
  assert.ok(source.includes('{completedCount}/{wizardSteps.length} diyaar'));
  assert.ok(source.includes('grid-template-columns:290px minmax(0,1fr)'));
  assert.ok(source.includes('max-width:860px'));
  assert.ok(source.includes('@media(max-width:760px)'));
  assert.ok(source.includes('START HERE'));
  assert.ok(source.includes('Wax ka maqan'));
  assert.ok(source.includes('prefers-color-scheme:dark'));
  assert.match(source, /\{ id: 'attendance', title: 'Attendance & Exams', required: true, evidence: 8,/);
  assert.match(source, /needs: \['year', 'profile', 'classes', 'subjects', 'teachers', 'students', 'attendance'\]/);
  assert.ok(source.includes('Dashboard-ku ma furmayo ilaa attendance rules iyo exam configuration la xaqiijiyo.'));
});

test('setup readiness is shared by API reads and writes and protects attendance, marks, and timetable routes', () => {
  const source = read('src/server/api.ts');
  assert.match(source, /async function evaluateReadiness\(schoolId: string\)/);
  assert.match(source, /async function requireSchoolSetupReady/);
  for (const route of [
    "apiRouter.get('/attendance',",
    "apiRouter.post('/attendance',",
    "apiRouter.put('/attendance',",
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
  assert.match(source, /const savedProgress = normalizeSchoolSetupProgress\(school\.setupProgress\)/);
  assert.match(source, /if \(!isSchoolSetupWizardEligible\(school\.createdAt\) \|\| !savedProgress\.startedAt \|\| savedProgress\.completedAt\) \{ next\(\); return; \}/);
  assert.match(source, /if \(isSchoolSetupWizardEligible\(school\.createdAt\) && !saved\.startedAt && !saved\.completedAt\)/);
  assert.match(source, /role === 'school_admin' && isSchoolSetupWizardEligible\(school\.createdAt\)/);
  assert.ok(read('src/App.tsx').includes('isSchoolSetupWizardEligible(school?.createdAt)'));
  assert.match(source, /const requiredIds = \[1, 2, 3, 4, 5, 0, 6\]/);
});

test('legacy setup checklist identifiers remain mapped to the new wizard evidence', () => {
  const source = read('src/components/schooladmin/SchoolSetupWizard.tsx');
  for (const evidence of ['evidence: 1', 'evidence: 2', 'evidence: 3', 'evidence: 4', 'evidence: 5', 'assignmentEvidence: 0', 'evidence: 6', 'evidence: 7', 'evidence: 8', 'evidence: 9']) {
    assert.ok(source.includes(evidence), `legacy checklist mapping missing: ${evidence}`);
  }
});


test('teacher assignment writes use the atomic database RPC and migration locks teacher workload', () => {
  const api = read('src/server/api.ts');
  const migration = read('supabase/migrations/20261122120000_atomic_teacher_assignment_upsert.sql');
  assert.match(api, /client\.rpc\('upsert_teacher_assignment_atomic'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /used_periods \+ requested_periods > teacher_limit/);
  assert.match(migration, /INSERT INTO public\.teacher_assignment_audit/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION .* TO service_role/);
});

test('Form Teacher uniqueness is enforced by the existing API guard and additive database index', () => {
  const api = read('src/server/api.ts');
  const migration = read('supabase/migrations/20261122121000_one_active_form_teacher_per_school.sql');
  assert.match(api, /hasActiveFormTeacherConflict/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS classes_one_active_form_teacher_per_school_uidx/);
  assert.match(migration, /GROUP BY school_id, class_teacher_id/);
  assert.match(migration, /RAISE EXCEPTION 'Duplicate active Form Teacher assignments exist/);
});
