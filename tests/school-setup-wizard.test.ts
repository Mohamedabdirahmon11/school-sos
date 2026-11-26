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
import { isSchoolSetupProgressComplete } from '../src/lib/school-setup-navigation.ts';

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
  feeStructureCount: 1,
  teacherAssignmentReady: true,
  teacherAssignmentIssues: []
};

test('school setup checklist validates academic dates, WhatsApp, class setup, teacher login, and school records', () => {
  const checklist = buildSchoolSetupChecklist(school, completeEvidence);
  for (const id of [1, 2, 3, 4, 5, 0, 6, 7, 8, 9]) assert.equal(checklist[id].ready, true, 'step ' + id);
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

test('the old five-step profile completion cannot unlock the ten-step dashboard gate', () => {
  const normalized = normalizeSchoolSetupProgress({
    currentStep: 5,
    completedSteps: [1, 2, 3, 4, 5, 10],
    skippedSteps: [],
    completedAt: '2026-11-14T12:00:00.000Z'
  });
  assert.equal(normalized.completedAt, null);
  assert.deepEqual(normalized.completedSteps, [1, 2, 3, 4, 5]);
  assert.equal(normalized.currentStep, 6);
  assert.equal(isSchoolSetupProgressComplete(normalized), false);
});

test('a full ten-step record with both optional steps explicitly skipped remains complete', () => {
  const progress = {
    currentStep: 10,
    completedSteps: [1, 2, 3, 4, 5, 6, 8, 10],
    skippedSteps: [7, 9],
    completedAt: '2026-11-14T12:00:00.000Z'
  };
  assert.equal(isSchoolSetupProgressComplete(progress), true);
  const missingAttendance = { ...progress, completedSteps: progress.completedSteps.filter(step => step !== 8) };
  assert.equal(isSchoolSetupProgressComplete(missingAttendance), false);
  assert.equal(normalizeSchoolSetupProgress(progress).completedAt, progress.completedAt);
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

test('finalization requires Attendance & Exams; timetable and fees may be completed or skipped', () => {
  const checklist = buildSchoolSetupChecklist(school, completeEvidence);
  const initial = normalizeSchoolSetupProgress(null);
  const requiredWithoutAssignment = {
    ...initial,
    completedSteps: [1, 2, 3, 4, 5, 6],
    skippedSteps: [7, 9]
  };
  assert.equal(canFinishSchoolSetup(requiredWithoutAssignment, checklist), false);
  const requiredWithoutAttendance = {
    ...initial,
    completedSteps: [1, 2, 3, 4, 5, 0, 6],
    skippedSteps: [7, 9]
  };
  assert.equal(canFinishSchoolSetup(requiredWithoutAttendance, checklist), false);
  const readyToFinish = sanitizeSchoolSetupProgressUpdate({
    currentStep: 10,
    completedSteps: [1, 2, 3, 4, 5, 0, 6, 8],
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
  assert.deepEqual(finished.completedSteps, [0, 1, 2, 3, 4, 5, 6, 8, 10]);
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


test('previously completed schools stay complete when the newer assignment audit reports a gap', () => {
  const legacyComplete = normalizeSchoolSetupProgress({
    currentStep: 10,
    completedSteps: [1, 2, 3, 4, 5, 6, 8, 10],
    skippedSteps: [7, 9],
    completedAt: '2026-11-20T12:00:00.000Z'
  });
  assert.equal(legacyComplete.completedAt, '2026-11-20T12:00:00.000Z');
  assert.equal(isSchoolSetupProgressComplete(legacyComplete), true);
});

test('curriculum setup requires at least one subject in every active class', () => {
  const checklist = buildSchoolSetupChecklist(school, {
    ...completeEvidence,
    subjectCount: 2,
    curriculumClassCoverageReady: false,
    curriculumClassCoverageIssues: ['Grade 1: ugu yaraan hal maaddo ma leh']
  });
  assert.equal(checklist[4].ready, false);
  assert.match(checklist[4].reason, /ugu yaraan hal maaddo ma leh/);
});


test('school setup blocks completion when saved academic year dates disagree with its year label', () => {
  const staleYear = {
    ...school,
    terms: {
      semester1Start: '2026-09-11',
      semester1End: '2027-02-22',
      semester2Start: '2027-03-10',
      semester2End: '2027-07-22'
    },
    setupData: {
      academicYear: { name: '2026/2027', startDate: '2026-09-11', endDate: '2028-06-08', isCurrent: true },
      terms: [
        { name: 'Term 1', startDate: '2026-09-11', endDate: '2027-02-22' },
        { name: 'Term 2', startDate: '2027-03-10', endDate: '2027-07-22' }
      ]
    }
  } as any;
  const checklist = buildSchoolSetupChecklist(staleYear, completeEvidence);
  assert.equal(checklist[1].ready, false);
  assert.match(checklist[1].reason, /two consecutive calendar years/);
});

test('school setup accepts a consistent configured academic year and two non-overlapping terms', () => {
  const validYear = {
    ...school,
    terms: {
      semester1Start: '2026-09-11',
      semester1End: '2027-02-22',
      semester2Start: '2027-03-10',
      semester2End: '2027-07-22'
    },
    setupData: {
      academicYear: { name: '2026/2027', startDate: '2026-09-11', endDate: '2027-07-22', isCurrent: true },
      terms: [
        { name: 'Term 1', startDate: '2026-09-11', endDate: '2027-02-22' },
        { name: 'Term 2', startDate: '2027-03-10', endDate: '2027-07-22' }
      ]
    }
  } as any;
  const checklist = buildSchoolSetupChecklist(validYear, completeEvidence);
  assert.equal(checklist[1].ready, true);
});


test('school setup requires the normalized academic year and both semester rows to exist', () => {
  const checklist = buildSchoolSetupChecklist(school, {
    ...completeEvidence,
    academicRecordsReady: false,
    academicRecordsIssues: ['Create/select the current academic year in Academic Setup.', 'Save both semester date ranges under that academic year.']
  });
  assert.equal(checklist[1].ready, false);
  assert.match(checklist[1].reason, /Create\/select the current academic year/);
});
