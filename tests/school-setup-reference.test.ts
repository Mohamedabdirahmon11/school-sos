import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

test('School Setup UI exposes the nine reference steps in order and the responsive 290px/860px layout', () => {
  const source = read('src/components/schooladmin/SchoolSetupWizard.tsx');
  const ids = ['profile', 'year', 'classes', 'subjects', 'teachers', 'assign', 'students', 'timetable', 'finish'];
  const positions = ids.map(id => source.indexOf("id: '" + id + "'"));
  assert.ok(positions.every(position => position >= 0), 'all nine setup steps must exist');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'steps must follow the requested order');
  assert.ok(source.includes("view: 'sch_setup_academics'"));
  assert.ok(source.includes("view: 'sch_settings'"));
  assert.ok(source.includes("id: 'assign'"));
  assert.ok(source.includes("<SchoolSetupInlineEditor step=\"assign\""));
  assert.ok(source.includes('REFERENCE_STEP_BY_PROGRESS_ID'));
  assert.ok(source.includes('Tallaabada {referenceStep + 1} ee {wizardSteps.length}'));
  assert.ok(source.includes('{completedCount}/{wizardSteps.length} diyaar'));
  assert.ok(source.includes('grid-template-columns:290px minmax(0,1fr)'));
  assert.ok(source.includes('max-width:860px'));
  assert.ok(source.includes('@media(max-width:760px)'));
  assert.ok(source.includes('START HERE'));
  assert.ok(source.includes('Wax ka maqan'));
  assert.ok(source.includes('prefers-color-scheme:dark'));
  assert.ok(source.includes("id: 'finish'"));
  assert.match(source, /needs: \['year', 'profile', 'classes', 'subjects', 'teachers', 'assign', 'students'\]/);
  assert.ok(source.includes('Dashboard-ka lama furi karo ilaa dhammaan toddobada tallaabo ee aasaasiga ah la xaqiijiyo.'));
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
  for (const evidence of ['evidence: 1', 'evidence: 2', 'evidence: 3', 'evidence: 4', 'evidence: 5', 'evidence: 0', 'evidence: 6', 'evidence: 7']) {
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


test('dedicated setup_completed_at is additive, idempotent, backfilled, and preserves incomplete schools', () => {
  const migration = read('supabase/migrations/20261122122000_school_setup_completed_at.sql');
  const storage = read('src/server/storage.ts');
  const api = read('src/server/api.ts');
  const types = read('src/types/index.ts');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz/);
  assert.match(migration, /setup_progress ->> 'completedAt'/);
  assert.match(migration, /WHERE setup_completed_at IS NULL/);
  assert.match(storage, /setup_progress,setup_completed_at,setup_data/);
  assert.match(api, /setupCompletedAt: progress\.completedAt \|\| loadedSchool\.setupCompletedAt \|\| null/);
  assert.match(types, /setupCompletedAt\?: string \| null/);
  assert.doesNotMatch(migration, /DELETE FROM public\.schools/i);
});

test('teacher assignment slot cleanup is inside the atomic RPC and failure rolls back', () => {
  const migration = read('supabase/migrations/20261122120000_atomic_teacher_assignment_upsert.sql');
  const api = read('src/server/api.ts');
  const sqlTest = read('tests/sql/school-setup-migrations.test.sql');
  assert.match(migration, /p_clear_dependent_slots boolean DEFAULT false/);
  assert.match(migration, /UPDATE public\.timetable_slots/);
  assert.match(migration, /p_clear_dependent_slots THEN/);
  assert.match(api, /p_clear_dependent_slots: clearDependentSlots/);
  assert.match(sqlTest, /simulated timetable cleanup failure/);
  assert.match(sqlTest, /assignment update was not rolled back/);
});

test('PostgreSQL CI integration covers atomic rollback, Form Teacher uniqueness and tenant RLS', () => {
  const workflow = read('.github/workflows/ci.yml');
  const sqlTest = read('tests/sql/school-setup-migrations.test.sql');
  const formTeacherMigration = read('supabase/migrations/20261122121000_one_active_form_teacher_per_school.sql');
  assert.match(workflow, /school-setup-sql:/);
  assert.match(workflow, /image: postgres:16/);
  assert.match(workflow, /tests\/sql\/school-setup-migrations\.test\.sql/);
  assert.match(sqlTest, /CREATE POLICY classes_school_scope/);
  assert.match(sqlTest, /duplicate Form Teacher was not rejected/);
  assert.match(sqlTest, /cross-school RLS isolation failed/);
  assert.match(formTeacherMigration, /GROUP BY school_id, class_teacher_id/);
  assert.match(formTeacherMigration, /RAISE EXCEPTION 'Duplicate active Form Teacher assignments exist/);
});


test('six setup modules render inside the wizard and use existing database-backed APIs', () => {
  const wizard = read('src/components/schooladmin/SchoolSetupWizard.tsx');
  const editor = read('src/components/schooladmin/SchoolSetupInlineEditor.tsx');
  for (const step of ['classes', 'subjects', 'teachers', 'assign', 'students', 'timetable']) {
    assert.ok(wizard.includes(`SchoolSetupInlineEditor step="${step}"`), `${step} must render inside the wizard`);
  }
  for (const method of ['getClasses', 'createClass', 'deleteClass', 'getSubjects', 'createSubject', 'saveClassCurriculum', 'getTeachers', 'createTeacher', 'getStudents', 'createStudent', 'setTimetableSlot']) {
    assert.ok(editor.includes(`ApiClient.${method}`), `inline editor must use ${method}`);
  }
  assert.match(editor, /request<any>\('\/teacher-assignments'/);
  assert.match(editor, /request\(.*timetable/);
  assert.doesNotMatch(editor, /localStorage/);
});
