export type PrimarySubjectGradeBand = '1-4' | '5-6' | '7-8';
export type PrimarySubjectTemplates = Record<PrimarySubjectGradeBand, string[]>;

/**
 * Editable starter curriculum for Ethiopian primary grades.
 *
 * These are per-school defaults, not an authoritative Ministry curriculum.
 * Schools can replace each band's list in setupData.subjectTemplates.
 * Conduct is deliberately excluded: it is a separate report-card field.
 */
export const PRIMARY_SUBJECT_TEMPLATE_DEFAULTS: PrimarySubjectTemplates = {
  '1-4': [
    'Af-Hooyo (Af-Soomaali)',
    'English',
    'Mathematics',
    'Environmental Science',
    'Arts & Physical Education',
    'Amharic',
    'Moral Education'
  ],
  '5-6': [
    'Af-Hooyo (Af-Soomaali)',
    'English',
    'Amharic',
    'Mathematics',
    'Environmental Science (Science + Social)',
    'Civics and Ethical Education',
    'Arts',
    'Physical Education'
  ],
  '7-8': [
    'Af-Hooyo (Af-Soomaali)',
    'English',
    'Amharic',
    'Mathematics',
    'Biology',
    'Chemistry',
    'Physics',
    'Social Studies (History + Geography)',
    'Civics and Ethical Education',
    'Arts',
    'Physical Education',
    'ICT'
  ]
};

/** Optional subjects schools may add to any grade-band template. */
export const OPTIONAL_SCHOOL_SUBJECTS = [
  'Arabic',
  'Islamic Studies/Quraan'
] as const;

/**
 * Legacy generic defaults are retained unchanged for the existing manual
 * "add default subjects" action. Grade-specific class creation uses the
 * Ethiopia templates above instead.
 */
export const DEFAULT_SUBJECT_NAMES = [
  'Soomaali',
  'Carabi',
  'Ingiriis',
  'Xisaab',
  'Science',
  'Tarbiyada Islaamka',
  'Bulsho'
] as const;

export function primarySubjectBandForGrade(gradeLevel: number): PrimarySubjectGradeBand | null {
  if (gradeLevel >= 1 && gradeLevel <= 4) return '1-4';
  if (gradeLevel >= 5 && gradeLevel <= 6) return '5-6';
  if (gradeLevel >= 7 && gradeLevel <= 8) return '7-8';
  return null;
}

export function getDefaultPrimarySubjectTemplate(gradeBand: PrimarySubjectGradeBand): string[] {
  return [...PRIMARY_SUBJECT_TEMPLATE_DEFAULTS[gradeBand]];
}

export function normalizeSubjectName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSubjectCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function subjectNameExists(
  subjects: Array<{ id?: string; name?: string }>,
  name: string,
  exceptId?: string
): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return subjects.some(subject =>
    subject.id !== exceptId &&
    String(subject.name || '').trim().toLocaleLowerCase() === normalized
  );
}
