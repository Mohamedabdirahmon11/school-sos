import { School, SchoolSetupChecklistItem, SchoolSetupProgress, SchoolSetupProgressUpdate } from '../types/index.ts';
import { normalizeWhatsAppNumber } from '../lib/whatsapp.ts';

export const REQUIRED_SCHOOL_SETUP_STEPS = [1, 2, 3, 4, 5, 6, 8] as const;
export const OPTIONAL_SCHOOL_SETUP_STEPS = [7, 9] as const;

export interface SchoolSetupEvidence {
  classNames: string[];
  subjectCount: number;
  teachers: Array<{ staffId?: string; userId?: string; hasLogin: boolean }>;
  studentCount: number;
  guardianContactCount: number;
  timetableSlotCount: number;
  hasExamConfig: boolean;
  feeStructureCount: number;
}

export function normalizeSchoolSetupProgress(value: unknown): SchoolSetupProgress {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const validSteps = (input: unknown) => Array.isArray(input)
    ? [...new Set(input.filter((step): step is number => Number.isInteger(step) && Number(step) >= 1 && Number(step) <= 10))]
    : [];
  const skippedSteps = validSteps(source.skippedSteps).filter(step => OPTIONAL_SCHOOL_SETUP_STEPS.includes(step as 7 | 9));
  const completedSteps = validSteps(source.completedSteps).filter(step => !skippedSteps.includes(step));
  const rawCurrentStep = Number(source.currentStep);
  const currentStep = Number.isInteger(rawCurrentStep) ? Math.min(10, Math.max(1, rawCurrentStep)) : 1;
  const completedAt = typeof source.completedAt === 'string' && source.completedAt.trim()
    ? source.completedAt
    : null;
  return { currentStep, completedSteps, skippedSteps, completedAt };
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function step(ready: boolean, optional: boolean, reason: string): SchoolSetupChecklistItem {
  return { ready, optional, reason };
}

export function buildSchoolSetupChecklist(school: School, evidence: SchoolSetupEvidence): Record<number, SchoolSetupChecklistItem> {
  const terms = school.terms || {
    semester1Start: '', semester1End: '', semester2Start: '', semester2End: ''
  };
  const semesterDates = [terms.semester1Start, terms.semester1End, terms.semester2Start, terms.semester2End];
  const datesReady = semesterDates.every(validDate)
    && terms.semester1Start <= terms.semester1End
    && terms.semester2Start <= terms.semester2End
    && terms.semester1End < terms.semester2Start;
  const yearReady = /^\d{4}-\d{4}$/.test(String(school.academicYear || ''));
  const normalizedNames = evidence.classNames.map(name => name.trim());
  const hasKg1 = normalizedNames.some(name => /(?:kg|kindergarten)[\s_-]*1(?:\b|$)/i.test(name));
  const hasKg2 = normalizedNames.some(name => /(?:kg|kindergarten)[\s_-]*2(?:\b|$)/i.test(name));
  const profileReady = Boolean(
    school.name?.trim() && school.address?.trim() && school.city?.trim()
    && school.email?.trim() && normalizeWhatsAppNumber(school.phone)
  );
  const teachersReady = evidence.teachers.length > 0
    && evidence.teachers.every(teacher => Boolean(teacher.staffId?.trim() && teacher.userId && teacher.hasLogin));

  return {
    1: step(yearReady && datesReady, false, 'Set a valid academic year and complete start/end dates for both semesters.'),
    2: step(profileReady, false, 'Complete the school name, address, city, email, and an international administration WhatsApp number.'),
    3: step(hasKg1 && hasKg2, false, 'Create active classes named KG 1 and KG 2 before continuing.'),
    4: step(evidence.subjectCount > 0, false, 'Add at least one school subject.'),
    5: step(teachersReady, false, 'Add at least one teacher; every teacher needs a school-specific ID and a linked teacher login with a password/PIN hash.'),
    6: step(evidence.studentCount > 0 && evidence.guardianContactCount > 0, false, 'Add students and at least one parent/guardian contact number.'),
    7: step(evidence.timetableSlotCount > 0, true, 'Create at least one active timetable period, or skip and configure the timetable later.'),
    8: step(Boolean(school.attendanceRules) && evidence.hasExamConfig, false, 'Review attendance rules and ensure this school has an exam configuration.'),
    9: step(evidence.feeStructureCount > 0, true, 'Create an active fee structure, or skip this step for the Accountant to configure later.')
  };
}

export function canFinishSchoolSetup(
  progress: SchoolSetupProgress,
  checklist: Record<number, SchoolSetupChecklistItem>
): boolean {
  const completed = new Set(progress.completedSteps);
  const skipped = new Set(progress.skippedSteps);
  return REQUIRED_SCHOOL_SETUP_STEPS.every(id => completed.has(id) && checklist[id]?.ready)
    && OPTIONAL_SCHOOL_SETUP_STEPS.every(id => completed.has(id) || skipped.has(id));
}

export function sanitizeSchoolSetupProgressUpdate(body: unknown): SchoolSetupProgressUpdate {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Setup progress payload must be an object.');
  }
  const source = body as Record<string, unknown>;
  const currentStep = Number(source.currentStep);
  if (!Number.isInteger(currentStep) || currentStep < 1 || currentStep > 10) {
    throw new Error('Current setup step must be a whole number from 1 to 10.');
  }
  const parseSteps = (value: unknown, label: string): number[] => {
    if (!Array.isArray(value) || value.length > 10 || value.some(item => !Number.isInteger(item) || Number(item) < 1 || Number(item) > 9)) {
      throw new Error(label + ' must contain step numbers from 1 to 9.');
    }
    const steps = value as number[];
    if (new Set(steps).size !== steps.length) throw new Error(label + ' cannot contain duplicate steps.');
    return [...steps].sort((a, b) => a - b);
  };
  if (source.complete !== undefined && typeof source.complete !== 'boolean') {
    throw new Error('Complete must be true or false.');
  }
  const completedSteps = parseSteps(source.completedSteps, 'Completed steps');
  const skippedSteps = parseSteps(source.skippedSteps, 'Skipped steps');
  if (skippedSteps.some(id => !OPTIONAL_SCHOOL_SETUP_STEPS.includes(id as 7 | 9))) {
    throw new Error('Only timetable and fees/modules may be skipped.');
  }
  return { currentStep, completedSteps, skippedSteps, complete: source.complete === true };
}

export function applySchoolSetupProgressUpdate(
  existing: SchoolSetupProgress,
  update: SchoolSetupProgressUpdate,
  checklist: Record<number, SchoolSetupChecklistItem>,
  now: string
): SchoolSetupProgress {
  if (existing.completedAt) throw new Error('School setup has already been completed.');
  if (update.completedSteps.some(id => update.skippedSteps.includes(id))) {
    throw new Error('A setup step cannot be both completed and skipped.');
  }
  if (update.skippedSteps.some(id => !OPTIONAL_SCHOOL_SETUP_STEPS.includes(id as 7 | 9))) {
    throw new Error('Only timetable and fees/modules may be skipped.');
  }
  for (const id of update.completedSteps) {
    if (!checklist[id]?.ready) {
      throw new Error(checklist[id]?.reason || 'Complete the saved data for this step before marking it complete.');
    }
  }
  if (update.complete) {
    const candidate: SchoolSetupProgress = {
      currentStep: update.currentStep,
      completedSteps: update.completedSteps,
      skippedSteps: update.skippedSteps,
      completedAt: null
    };
    if (!canFinishSchoolSetup(candidate, checklist)) {
      throw new Error('Complete steps 1–6 and 8, then complete or skip steps 7 and 9 before opening the dashboard.');
    }
    return {
      currentStep: 10,
      completedSteps: [...new Set([...update.completedSteps, 10])].sort((a, b) => a - b),
      skippedSteps: [...update.skippedSteps],
      completedAt: now
    };
  }
  return {
    currentStep: update.currentStep,
    completedSteps: [...update.completedSteps],
    skippedSteps: [...update.skippedSteps],
    completedAt: existing.completedAt
  };
}
