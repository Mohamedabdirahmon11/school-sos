export const SCHOOL_SETUP_EXTRA_MODULES = [
  { view: 'sch_inventory', labelKey: 'inventory' },
  { view: 'sch_library', labelKey: 'library' },
  { view: 'sch_transport', labelKey: 'transport' },
  { view: 'sch_discipline', labelKey: 'discipline' },
  { view: 'sch_health', labelKey: 'health_nurse' }
] as const;

export const SCHOOL_SETUP_ALLOWED_VIEWS: ReadonlySet<string> = new Set([
  'sch_setup', 'sch_settings', 'sch_setup_academics', 'sch_classes', 'sch_subjects',
  'sch_teachers', 'sch_students', 'sch_parents', 'sch_timetable', 'sch_attendance', 'sch_exams',
  'sch_fees', ...SCHOOL_SETUP_EXTRA_MODULES.map(module => module.view),
  'sch_admissions', 'sch_events', 'sch_report_cards', 'sch_staff', 'sch_messages', 'sch_support'
]);

export const SCHOOL_SETUP_STEP_TARGETS = {
  fees: 'sch_fees'
} as const;


/**
 * Only a fully validated ten-step onboarding record may unlock the School Admin dashboard.
 * The older five-step profile wizard used to write completedAt and step 10 prematurely.
 */
export function isSchoolSetupProgressComplete(progress: unknown): boolean {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return false;
  const value = progress as Record<string, unknown>;
  if (typeof value.completedAt !== 'string' || !value.completedAt.trim()) return false;
  const completed = new Set(Array.isArray(value.completedSteps) ? value.completedSteps.filter(Number.isInteger) as number[] : []);
  const skipped = new Set(Array.isArray(value.skippedSteps) ? value.skippedSteps.filter(Number.isInteger) as number[] : []);
  const required = [1, 2, 3, 4, 5, 6, 8, 10];
  return required.every(step => completed.has(step))
    && [7, 9].every(step => completed.has(step) || skipped.has(step))
    && [...skipped].every(step => (step === 7 || step === 9) && !completed.has(step));
}
