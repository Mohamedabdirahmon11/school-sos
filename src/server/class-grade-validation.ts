export function classGradeMismatchError(name: string, gradeLevel: number, kindergartenLevel?: number | null): string | null {
  const cleanName = String(name || '').trim();
  if (!cleanName) return null;
  const namedGrade = /\bgrade\s*(\d{1,2})\b/i.exec(cleanName);
  if (namedGrade && Number(namedGrade[1]) !== gradeLevel) return `Class name "${cleanName}" conflicts with selected Grade ${gradeLevel}.`;
  const kgName = /\b(?:KG|KINDERGARTEN|NURSERY)(?:[\s-]*(\d+))?\b/i.exec(cleanName);
  if (kgName) {
    if (gradeLevel !== 0) return `Class name "${cleanName}" must use KG grade level (0).`;
    const namedLevel = kgName[1] ? Number(kgName[1]) : null;
    if (namedLevel !== null && (!Number.isInteger(namedLevel) || namedLevel < 1 || namedLevel > 3 || namedLevel !== Number(kindergartenLevel ?? 0))) return `Class name "${cleanName}" must match the selected KG level.`;
    if (kindergartenLevel != null && (!Number.isInteger(kindergartenLevel) || kindergartenLevel < 1 || kindergartenLevel > 3)) return 'Kindergarten level must be KG1, KG2, or KG3.';
  } else if (gradeLevel === 0 && kindergartenLevel != null && (!Number.isInteger(kindergartenLevel) || kindergartenLevel < 1 || kindergartenLevel > 3)) return 'Kindergarten level must be KG1, KG2, or KG3.';
  return null;
}
