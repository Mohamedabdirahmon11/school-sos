import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySchoolSetupProgressUpdate,
  canFinishSchoolSetup,
  normalizeSchoolSetupProgress,
  sanitizeSchoolSetupProgressUpdate
} from '../src/server/school-setup.ts';

const checklist = (teacherAssignmentReady: boolean) => Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => [id, { ready: true, optional: id === 7 || id === 9, reason: '' }])
) as any;

test('an active class without a Form Teacher blocks setup readiness', () => {
  const checks = checklist(false);
  checks[0] = { ready: false, optional: false, reason: 'Grade 4 · A: Form Teacher la\'aan' };
  assert.equal(checks[0].ready, false);
  assert.match(checks[0].reason, /Grade 4 · A/);
});

test('a curriculum subject without a teacher is reported as missing', () => {
  const checks = checklist(false);
  checks[0] = { ready: false, optional: false, reason: 'Grade 4 · A: Xisaab macallin la\'aan' };
  assert.equal(checks[0].ready, false);
  assert.match(checks[0].reason, /Xisaab macallin la\'aan/);
});

test('all assignments ready satisfies the new required step and optional skips', () => {
  const checks = checklist(true);
  checks[0] = { ready: true, optional: false, reason: '' };
  const progress = {
    currentStep: 10,
    completedSteps: [1, 2, 3, 4, 5, 0, 6, 8],
    skippedSteps: [7, 9],
    completedAt: null
  };
  assert.equal(canFinishSchoolSetup(progress, checks), true);
});

test('legacy progress IDs 1–9 remain unchanged and next step becomes Teacher Assignment', () => {
  const progress = normalizeSchoolSetupProgress({
    currentStep: 6,
    completedSteps: [1, 2, 3, 4, 5],
    skippedSteps: [7],
    completedAt: null
  });
  assert.equal(progress.currentStep, 0);
  assert.deepEqual(progress.completedSteps, [1, 2, 3, 4, 5]);
  assert.deepEqual(progress.skippedSteps, [7]);
});

test('progress API accepts the stable new step ID without renumbering old IDs', () => {
  const update = sanitizeSchoolSetupProgressUpdate({
    currentStep: 0,
    completedSteps: [1, 2, 3, 4, 5, 0],
    skippedSteps: [7, 9]
  });
  assert.equal(update.currentStep, 0);
  assert.deepEqual(update.completedSteps, [0, 1, 2, 3, 4, 5]);
});

test('completion is rejected while Teacher Assignment is not ready', () => {
  const checks = checklist(false);
  checks[0] = { ready: false, optional: false, reason: 'Teacher assignments missing' };
  assert.throws(() => applySchoolSetupProgressUpdate(
    { currentStep: 0, completedSteps: [], skippedSteps: [], completedAt: null },
    { currentStep: 10, completedSteps: [0, 1, 2, 3, 4, 5, 6, 8], skippedSteps: [7, 9], complete: true },
    checks,
    new Date().toISOString()
  ), /Teacher assignments missing/);
});
