import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  applySchoolSetupProgressUpdate,
  canFinishSchoolSetup,
  evaluateTeacherAssignmentReadiness,
  normalizeSchoolSetupProgress,
  sanitizeSchoolSetupProgressUpdate
} from '../src/server/school-setup.ts';

const schoolId = 'school-a';
const classes = [{ id: 'class-a', schoolId, name: 'Grade 4', section: 'A', classTeacherId: 'user-teacher-a', isArchived: false }];
const teachers = [{ id: 'teacher-a', schoolId, userId: 'user-teacher-a', fullName: 'Teacher A', status: 'active' }];
const subjects = [{ id: 'subject-a', schoolId, name: 'Xisaab' }];
const curriculum = [{ schoolId, classId: 'class-a', subjectId: 'subject-a', teacherId: 'teacher-a', periodsPerWeek: 5, isActive: true }];

const checklist = (teacherAssignmentReady: boolean) => {
  const checks: Record<number, { ready: boolean; optional: boolean; reason: string }> = Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => [id, { ready: true, optional: id === 7 || id === 9, reason: '' }])
  );
  checks[0] = { ready: teacherAssignmentReady, optional: false, reason: teacherAssignmentReady ? '' : 'Teacher assignments missing' };
  return checks;
};

test('an active class without a Form Teacher is not ready', () => {
  const result = evaluateTeacherAssignmentReadiness(schoolId, [{ ...classes[0], classTeacherId: null }], teachers, curriculum, subjects);
  assert.equal(result.ready, false);
  assert.match(result.issues.join(' '), /Grade 4 · A: Form Teacher la'aan/);
});

test('a curriculum subject without a teacher is not ready and lists the missing subject', () => {
  const result = evaluateTeacherAssignmentReadiness(schoolId, classes, teachers, [{ ...curriculum[0], teacherId: null }], subjects);
  assert.equal(result.ready, false);
  assert.match(result.issues.join(' '), /Grade 4 · A: Xisaab macallin la'aan/);
});

test('all Form Teacher and subject assignments within the workload limit are ready', () => {
  const result = evaluateTeacherAssignmentReadiness(schoolId, classes, teachers, curriculum, subjects);
  assert.deepEqual(result, { ready: true, issues: [] });
});

test('teacher workload above 30 periods per week is not ready', () => {
  const result = evaluateTeacherAssignmentReadiness(schoolId, classes, teachers, [{ ...curriculum[0], periodsPerWeek: 31 }], subjects);
  assert.equal(result.ready, false);
  assert.match(result.issues.join(' '), /31\/30/);
});

test('readiness is school-specific and ignores another school records', () => {
  const otherSchool = 'school-b';
  const result = evaluateTeacherAssignmentReadiness(schoolId, classes, teachers, [
    ...curriculum,
    { schoolId: otherSchool, classId: 'foreign-class', subjectId: 'foreign-subject', teacherId: null, periodsPerWeek: 40, isActive: true }
  ], [...subjects, { id: 'foreign-subject', schoolId: otherSchool, name: 'Foreign Subject' }]);
  assert.equal(result.ready, true);
  assert.deepEqual(result.issues, []);
});

test('all assignments ready satisfies the new required step and optional skips', () => {
  const checks = checklist(true);
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
  assert.equal(progress.currentStep, 6);
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
  assert.throws(() => applySchoolSetupProgressUpdate(
    { currentStep: 0, completedSteps: [], skippedSteps: [], completedAt: null },
    { currentStep: 10, completedSteps: [0, 1, 2, 3, 4, 5, 6, 8], skippedSteps: [7, 9], complete: true },
    checks,
    new Date().toISOString()
  ), /Teacher assignments missing/);
});

test('Timetable and teacher attendance/marks are gated after the existing authorization checks', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(api, /apiRouter\.get\('\/timetable', requireAuth, requireSchoolContext, requireTeacherAssignmentsReady,/);
  assert.match(api, /apiRouter\.post\('\/timetable', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext, requireTeacherAssignmentsReady,/);
  assert.match(api, /apiRouter\.post\('\/attendance', requireAuth, requireSchoolContext, requireSchoolStaff,/);
  assert.match(api, /if \(user\.role === 'teacher' && !await ensureTeacherAssignmentReadyForTeacher\(school, res\)\) return;/);
  assert.match(api, /apiRouter\.post\('\/exams\/marks', requireAuth, requireSchoolContext, requireSchoolStaff,/);
  assert.match(api, /apiRouter\.post\('\/term-marks\/entry', requireAuth, requireSchoolContext, requireSchoolStaff,/);
  assert.match(api, /if \(!await ensureTeacherAssignmentReadyForTeacher\(school, res\)\) return;/);
});
