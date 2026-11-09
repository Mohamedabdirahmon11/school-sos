export const SCHOOL_SETUP_ALLOWED_VIEWS: ReadonlySet<string> = new Set([
  'sch_setup', 'sch_settings', 'sch_setup_academics', 'sch_classes', 'sch_subjects',
  'sch_teachers', 'sch_students', 'sch_timetable', 'sch_attendance', 'sch_exams',
  'sch_fees', 'sch_inventory', 'sch_transport', 'sch_library', 'sch_discipline', 'sch_health',
  'sch_admissions', 'sch_events', 'sch_report_cards', 'sch_staff', 'sch_messages', 'sch_support'
]);

export const SCHOOL_SETUP_STEP_TARGETS = {
  fees: 'sch_fees',
  modules: 'sch_inventory'
} as const;
