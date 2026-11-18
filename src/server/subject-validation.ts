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
