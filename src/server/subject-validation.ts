export type PrimarySubjectGradeBand = '1-4' | '5-6' | '7-8';
export type PrimarySubjectTemplates = Record<PrimarySubjectGradeBand, string[]>;

export const PRIMARY_SUBJECT_TEMPLATE_DEFAULTS: PrimarySubjectTemplates = {
  '1-4': ['Soomaali', 'Ingiriis', 'Xisaab', 'Environmental Science', 'Tarbiyada Islaamka', 'Aesthetic Education', 'Physical Education'],
  '5-6': ['Soomaali', 'Ingiriis', 'Xisaab', 'General Science', 'Bulsho', 'Civic and Ethical Education', 'ICT', 'Tarbiyada Islaamka', 'Aesthetic Education', 'Physical Education'],
  '7-8': ['Soomaali', 'Ingiriis', 'Xisaab', 'General Science', 'Bulsho', 'Civic and Ethical Education', 'ICT', 'Agriculture', 'Tarbiyada Islaamka', 'Aesthetic Education', 'Physical Education']
};

export const DEFAULT_SUBJECT_NAMES = [
  'Soomaali',
  'Carabi',
  'Ingiriis',
  'Xisaab',
  'Science',
  'Tarbiyada Islaamka',
  'Bulsho'
] as const;

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
