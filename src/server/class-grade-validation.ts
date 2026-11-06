export function classGradeMismatchError(name: string, gradeLevel: number): string | null {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;

  const namedGrade = /\bgrade\s*(\d{1,2})\b/i.exec(cleanName);
  if (namedGrade && Number(namedGrade[1]) !== gradeLevel) {
    return `Class name "${cleanName}" conflicts with selected Grade ${gradeLevel}.`;
  }

  const namesKindergarten = /\b(?:KG|KINDERGARTEN|NURSERY)\b/i.test(cleanName);
  if (namesKindergarten && gradeLevel !== 0) {
    return `Class name "${cleanName}" must use KG grade level (0).`;
  }
  return null;
}
