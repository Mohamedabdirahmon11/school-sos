import { School, SchoolSetupChecklistItem, SchoolSetupProgress, SchoolSetupProgressUpdate } from '../types/index.ts';
import { normalizeWhatsAppNumber } from '../lib/whatsapp.ts';
import { isSchoolSetupProgressComplete } from '../lib/school-setup-navigation.ts';

// Step 0 is a new stable ID reserved for Teacher Assignment. Existing IDs 1–9 remain unchanged.
export const REQUIRED_SCHOOL_SETUP_STEPS = [1, 2, 3, 4, 5, 0, 6] as const;
export const OPTIONAL_SCHOOL_SETUP_STEPS = [7, 9] as const;

export interface TeacherAssignmentReadiness {
  ready: boolean;
  issues: string[];
}

export function evaluateTeacherAssignmentReadiness(
  schoolId: string,
  classes: Array<{ id: string; schoolId?: string; name?: string; section?: string; classTeacherId?: string | null; isArchived?: boolean }>,
  teachers: Array<{ id: string; schoolId?: string; userId?: string; fullName?: string; status?: string }>,
  curriculum: Array<{ schoolId?: string; classId: string; subjectId: string; teacherId?: string | null; periodsPerWeek?: number; isActive?: boolean }>,
  subjects: Array<{ id: string; schoolId?: string; name?: string }>
): TeacherAssignmentReadiness {
  const activeClasses = classes.filter(row => (!row.schoolId || row.schoolId === schoolId) && row.isArchived !== true);
  const activeTeachers = teachers.filter(row => (!row.schoolId || row.schoolId === schoolId) && String(row.status || 'active').toLowerCase() === 'active');
  const teacherById = new Map(activeTeachers.map(row => [String(row.id), row]));
  const teacherByUserId = new Map(activeTeachers.filter(row => row.userId).map(row => [String(row.userId), row]));
  const classById = new Map(activeClasses.map(row => [String(row.id), row]));
  const subjectById = new Map(subjects.filter(row => !row.schoolId || row.schoolId === schoolId).map(row => [String(row.id), row]));
  const issues: string[] = [];
  if (!activeClasses.length) issues.push('Marka hore ku dar Classes');
  const formTeacherClassByUser = new Map<string, string>();
  const curriculumByClass = new Map<string, number>();
  const classLabelFor = (klass: typeof activeClasses[number]) => `${klass.name || 'Fasal'}${klass.section ? ' · ' + klass.section : ''}`;
  for (const klass of activeClasses) {
    const classLabel = classLabelFor(klass);
    const formTeacherUserId = klass.classTeacherId ? String(klass.classTeacherId) : '';
    const formTeacher = formTeacherUserId ? teacherByUserId.get(formTeacherUserId) : null;
    if (!formTeacher) {
      issues.push(`${classLabel}: Form Teacher la'aan`);
    } else {
      const previousClass = formTeacherClassByUser.get(formTeacherUserId);
      if (previousClass) issues.push(`${formTeacher.fullName || 'Macallin'}: Form Teacher ayuu uga yahay laba fasal (${previousClass} iyo ${classLabel})`);
      else formTeacherClassByUser.set(formTeacherUserId, classLabel);
    }
  }
  const periodsByTeacher = new Map<string, number>();
  for (const row of curriculum) {
    if ((row.schoolId && row.schoolId !== schoolId) || row.isActive === false) continue;
    const klass = classById.get(String(row.classId));
    if (!klass) continue;
    curriculumByClass.set(String(row.classId), (curriculumByClass.get(String(row.classId)) || 0) + 1);
    const subjectName = String(subjectById.get(String(row.subjectId))?.name || 'Maaddo');
    const teacher = row.teacherId ? teacherById.get(String(row.teacherId)) : null;
    const classLabel = classLabelFor(klass);
    if (!teacher) issues.push(`${classLabel}: ${subjectName} macallin la'aan`);
    else periodsByTeacher.set(String(teacher.id), (periodsByTeacher.get(String(teacher.id)) || 0) + Number(row.periodsPerWeek || 0));
  }
  for (const klass of activeClasses) {
    if (!curriculumByClass.has(String(klass.id))) issues.push(`${classLabelFor(klass)}: ugu yaraan hal maaddo ma leh`);
  }
  for (const [teacherId, periods] of periodsByTeacher) {
    if (periods > 30) issues.push(`${teacherById.get(teacherId)?.fullName || 'Macallin'}: ${periods}/30 xiisadood toddobaadkii`);
  }
  return { ready: activeClasses.length > 0 && issues.length === 0, issues };
}

export interface SchoolSetupEvidence {
  classNames: string[];
  subjectCount: number;
  teachers: Array<{ staffId?: string; userId?: string; hasLogin: boolean }>;
  studentCount: number;
  guardianContactCount: number;
  timetableSlotCount: number;
  hasExamConfig: boolean;
  feeStructureCount: number;
  teacherAssignmentReady?: boolean;
  teacherAssignmentIssues?: string[];
  curriculumClassCoverageReady?: boolean;
  curriculumClassCoverageIssues?: string[];
}

export function normalizeSchoolSetupProgress(value: unknown): SchoolSetupProgress {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const validSteps = (input: unknown) => Array.isArray(input)
    ? [...new Set(input.filter((step): step is number => Number.isInteger(step) && Number(step) >= 0 && Number(step) <= 10))]
    : [];
  const skippedSteps = validSteps(source.skippedSteps).filter(step => OPTIONAL_SCHOOL_SETUP_STEPS.includes(step as 7 | 9));
  const rawCompletedSteps = validSteps(source.completedSteps).filter(step => !skippedSteps.includes(step));
  const rawCompletedAt = typeof source.completedAt === 'string' && source.completedAt.trim()
    ? source.completedAt
    : null;
  const fullyComplete = isSchoolSetupProgressComplete({
    completedAt: rawCompletedAt,
    completedSteps: rawCompletedSteps,
    skippedSteps
  });
  // Discard the legacy five-step wizard's premature step-10 marker.
  const completedSteps = rawCompletedSteps.filter(step => step !== 10 || fullyComplete);
  const rawCurrentStep = Number(source.currentStep);
  const currentStep = fullyComplete
    ? 10
    : Number.isInteger(rawCurrentStep)
      ? Math.min(10, Math.max(0, rawCurrentStep === 5 && [1, 2, 3, 4, 5].every(step => completedSteps.includes(step)) ? 6 : rawCurrentStep))
      : 1;
  const completedAt = fullyComplete ? rawCompletedAt : null;
  const startedAt = typeof source.startedAt === 'string' && source.startedAt.trim() ? source.startedAt : null;
  return { currentStep, completedSteps, skippedSteps, completedAt, ...(startedAt ? { startedAt } : {}) };
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
  const normalizedNames = evidence.classNames.map(name => name.trim()).filter(Boolean);
  const hasActiveClass = normalizedNames.length > 0;
  const profileReady = Boolean(
    school.name?.trim() && school.address?.trim() && school.city?.trim()
    && school.email?.trim() && school.phone?.trim() && normalizeWhatsAppNumber(school.whatsappPhone)
  );
  const teachersReady = evidence.teachers.length > 0
    && evidence.teachers.every(teacher => Boolean(teacher.staffId?.trim() && teacher.userId && teacher.hasLogin));

  return {
    1: step(yearReady && datesReady, false, 'Set a valid academic year and complete start/end dates for both semesters.'),
    2: step(profileReady, false, 'Complete the school name, address, city, email, and an international administration WhatsApp number.'),
    3: step(hasActiveClass, false, 'Create at least one active class or section. KG classes are available when your school offers kindergarten.'),
    4: step(evidence.subjectCount > 0 && evidence.curriculumClassCoverageReady !== false, false, evidence.subjectCount === 0 ? 'Add at least one school subject.' : (evidence.curriculumClassCoverageIssues || []).join(' · ') || 'Add subjects to the active class curriculum; every class needs at least one subject.'),
    5: step(teachersReady, false, 'Add at least one teacher; every teacher needs a school-specific ID and a linked teacher login with a password/PIN hash.'),
    0: step(Boolean(evidence.teacherAssignmentReady), false, (evidence.teacherAssignmentIssues || []).length ? 'Marka hore qoondee macallimiinta: ' + (evidence.teacherAssignmentIssues || []).join(' · ') : 'Qoondee Form Teacher fasal kasta iyo macallin maaddo kasta; culayska macallin kasta waa inuu ahaadaa 30 xiisadood ama ka yar toddobaadkii.'),
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
  if (!Number.isInteger(currentStep) || currentStep < 0 || currentStep > 10) {
    throw new Error('Current setup step must be a whole number from 1 to 10.');
  }
  const parseSteps = (value: unknown, label: string): number[] => {
    if (!Array.isArray(value) || value.length > 10 || value.some(item => !Number.isInteger(item) || Number(item) < 0 || Number(item) > 9)) {
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
      throw new Error('Complete steps 1–6 and Teacher Assignment, then complete or skip Timetable (7) and Fees/Modules (9) before opening the dashboard. Attendance & Exams (8) is a follow-up check and does not block the dashboard.');
    }
    return {
      currentStep: 10,
      completedSteps: [...new Set([...update.completedSteps, 10])].sort((a, b) => a - b),
      skippedSteps: [...update.skippedSteps],
      completedAt: now,
      startedAt: existing.startedAt || now
    };
  }
  return {
    currentStep: update.currentStep,
    completedSteps: [...update.completedSteps],
    skippedSteps: [...update.skippedSteps],
    completedAt: existing.completedAt,
    startedAt: existing.startedAt || now
  };
}
