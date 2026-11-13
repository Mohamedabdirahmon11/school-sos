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
