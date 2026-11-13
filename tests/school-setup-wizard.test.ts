import test from 'node:test';
import assert from 'node:assert/strict';
import { School } from '../src/types/index.ts';
import {
  applySchoolSetupProgressUpdate,
  buildSchoolSetupChecklist,
  canFinishSchoolSetup,
  normalizeSchoolSetupProgress,
  sanitizeSchoolSetupProgressUpdate
} from '../src/server/school-setup.ts';

const school: School = {
  id: 'school-1',
  name: 'Example School',
  code: 'EX01',
  address: 'Main Street',
  city: 'Jijiga',
  phone: '+251911234567',
  email: 'office@example.edu',
  whatsappPhone: '+251911234567',
  currency: 'ETB',
  academicYear: '2026-2027',
  currentSemester: 'Semester 1',
  terms: {
    semester1Start: '2026-09-01',
    semester1End: '2027-01-20',
    semester2Start: '2027-02-01',
    semester2End: '2027-06-30'
  },
  attendanceRules: {
    lateAfterMinutes: 15,
    absentAfterMinutes: 0,
    requireExcusedReason: true,
    allowParentExcuses: false
  },
  defaultClassCapacity: 40,
  studentAccessEnabled: false,
  subscription: {
    plan: 'basic',
    cadence: 'trial',
    status: 'trial',
    startDate: '2026-11-01',
    validUntil: '2026-11-08',
    graceDays: 7,
    pricePaid: 0,
    autoRenew: false
  },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z'
};

const completeEvidence = {
  classNames: ['KG 1 - A', 'KG 2 - A', 'Grade 1 - A'],
  subjectCount: 5,
  teachers: [{ staffId: 'STF-EX01-0001', userId: 'teacher-user-1', hasLogin: true }],
  studentCount: 12,
  guardianContactCount: 12,
  timetableSlotCount: 30,
  hasExamConfig: true,
  feeStructureCount: 1
};

test('school setup checklist validates academic dates, WhatsApp, class setup, teacher login, and school records', () => {
  const checklist = buildSchoolSetupChecklist(school, completeEvidence);
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9]) assert.equal(checklist[id].ready, true, 'step ' + id);
});


test('school setup requires the dedicated administration WhatsApp number, not only the public school phone', () => {
  const withoutAdminWhatsApp = { ...school, whatsappPhone: undefined };
  const checklist = buildSchoolSetupChecklist(withoutAdminWhatsApp, completeEvidence);
  assert.equal(checklist[2].ready, false);
});

test('a school without kindergarten can finish class setup while KG classes remain supported', () => {
  const noKindergarten = buildSchoolSetupChecklist(school, { ...completeEvidence, classNames: ['Grade 1 - A'] });
  const noClasses = buildSchoolSetupChecklist(school, { ...completeEvidence, classNames: [] });
  const kindergarten = buildSchoolSetupChecklist(school, { ...completeEvidence, classNames: ['KG 1 - A', 'KG 2 - A'] });
  assert.equal(noKindergarten[3].ready, true);
  assert.equal(noClasses[3].ready, false);
  assert.equal(kindergarten[3].ready, true);
});

test('teacher setup requires a school-specific staff ID and linked login credential hash', () => {
  const checklist = buildSchoolSetupChecklist(school, {
    ...completeEvidence,
    teachers: [{ staffId: '', userId: 'teacher-user-1', hasLogin: false }]
  });
  assert.equal(checklist[5].ready, false);
});

test('malformed saved progress safely normalizes to the first setup step', () => {
  assert.deepEqual(normalizeSchoolSetupProgress({ currentStep: 'bad', completedSteps: ['1'], skippedSteps: [1], completedAt: '' }), {
    currentStep: 1,
    completedSteps: [],
    skippedSteps: [],
    completedAt: null
  });
});

test('required steps cannot be skipped and cannot be marked complete before their data is ready', () => {
  const checklist = buildSchoolSetupChecklist(school, { ...completeEvidence, subjectCount: 0 });
  const input = sanitizeSchoolSetupProgressUpdate({ currentStep: 5, completedSteps: [1, 2, 3, 4], skippedSteps: [] });
  assert.throws(() => applySchoolSetupProgressUpdate(
    normalizeSchoolSetupProgress(null), input, checklist, '2026-11-07T00:00:00.000Z'
  ), /Add at least one school subject/);
  assert.throws(() => sanitizeSchoolSetupProgressUpdate({ currentStep: 2, completedSteps: [], skippedSteps: [1] }), /Only timetable and fees/);
});

test('finalization requires steps 1–6 and 8; timetable and fees may be completed or skipped', () => {
  const checklist = buildSchoolSetupChecklist(school, completeEvidence);
  const initial = normalizeSchoolSetupProgress(null);
  const requiredWithoutEight = {
    ...initial,
    completedSteps: [1, 2, 3, 4, 5, 6],
    skippedSteps: [7, 9]
  };
  assert.equal(canFinishSchoolSetup(requiredWithoutEight, checklist), false);
  const readyToFinish = sanitizeSchoolSetupProgressUpdate({
    currentStep: 10,
    completedSteps: [1, 2, 3, 4, 5, 6, 8],
    skippedSteps: [7, 9]
  });
  assert.equal(canFinishSchoolSetup({
    ...initial,
    completedSteps: readyToFinish.completedSteps,
    skippedSteps: readyToFinish.skippedSteps
  }, checklist), true);
  const finished = applySchoolSetupProgressUpdate(initial, {
    ...readyToFinish,
    complete: true
  }, checklist, '2026-11-07T12:00:00.000Z');
  assert.equal(finished.completedAt, '2026-11-07T12:00:00.000Z');
  assert.deepEqual(finished.completedSteps, [1, 2, 3, 4, 5, 6, 8, 10]);
});

test('setup progress rejects a step that is both completed and skipped', () => {
  const checklist = buildSchoolSetupChecklist(school, completeEvidence);
  const input = sanitizeSchoolSetupProgressUpdate({
    currentStep: 8,
    completedSteps: [1, 2, 3, 4, 5, 6, 7],
    skippedSteps: [7, 9]
  });
  assert.throws(() => applySchoolSetupProgressUpdate(
    normalizeSchoolSetupProgress(null), input, checklist, '2026-11-07T00:00:00.000Z'
  ), /both completed and skipped/);
});
