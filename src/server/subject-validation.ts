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
    'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Environmental Science',
    'Arts', 'Physical Education', 'Amharic', 'Moral Education'
  ],
  '5-6': [
    'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Environmental Science',
    'Arts', 'Physical Education', 'Amharic', 'Civics & Ethical Education'
  ],
  '7-8': [
    'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Arts', 'Physical Education',
    'Amharic', 'Civics & Ethical Education', 'Biology', 'Chemistry', 'Physics',
    'Cilmi Bulsho', 'ICT'
  ]
};

export const PRIMARY_SUBJECT_TEMPLATE_PERIODS: Record<string, number> = {
  'Af-Hooyo (Af-Soomaali)': 5,
  English: 5,
  Xisaab: 5,
  'Environmental Science': 4,
  Arts: 1,
  'Physical Education': 2,
  Amharic: 3,
  'Moral Education': 1,
  'Civics & Ethical Education': 2,
  Biology: 2,
  Chemistry: 2,
  Physics: 2,
  'Cilmi Bulsho': 3,
  ICT: 1,
  Arabic: 2,
  'Islamic Studies/Quraan': 2
};

export function getDefaultSubjectPeriods(name: string, overrides?: Record<string, number>): number {
  const key = name.trim().toLocaleLowerCase();
  const override = Object.entries(overrides || {}).find(([candidate]) => candidate.trim().toLocaleLowerCase() === key)?.[1];
  const base = Object.entries(PRIMARY_SUBJECT_TEMPLATE_PERIODS).find(([candidate]) => candidate.toLocaleLowerCase() === key)?.[1] ?? 2;
  const value = Number(override ?? base);
  return Number.isInteger(value) && value >= 1 && value <= 10 ? value : base;
}

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
  'Af-Hooyo (Af-Soomaali)', 'English', 'Xisaab', 'Environmental Science',
  'Arts', 'Physical Education', 'Amharic', 'Moral Education',
  'Civics & Ethical Education', 'Biology', 'Chemistry', 'Physics',
  'Cilmi Bulsho', 'ICT'
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
