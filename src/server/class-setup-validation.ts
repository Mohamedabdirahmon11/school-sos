export type ClassIdentityRecord = {
  id: string;
  academicYear?: string;
  gradeLevel: number;
  kindergartenLevel?: number | null;
  section?: string | null;
  classTeacherId?: string | null;
  isArchived?: boolean;
};

export type ClassIdentityCandidate = {
  academicYear: string;
  gradeLevel: number;
  kindergartenLevel?: number | null;
  section?: string | null;
};

const normalizeSection = (value?: string | null) => String(value ?? '').trim().toLocaleUpperCase();

export function hasActiveClassIdentityConflict(
  classes: ClassIdentityRecord[],
  candidate: ClassIdentityCandidate,
  excludingClassId?: string
): boolean {
  const year = candidate.academicYear.trim();
  const section = normalizeSection(candidate.section);
  return classes.some(klass =>
    klass.id !== excludingClassId &&
    klass.isArchived !== true &&
    String(klass.academicYear ?? '').trim() === year &&
    Number(klass.gradeLevel) === Number(candidate.gradeLevel) &&
    Number(klass.kindergartenLevel ?? 0) === Number(candidate.kindergartenLevel ?? 0) &&
    normalizeSection(klass.section) === section
  );
}

export function hasActiveFormTeacherConflict(
  classes: ClassIdentityRecord[],
  teacherUserId?: string | null,
  excludingClassId?: string
): boolean {
  if (!teacherUserId) return false;
  return classes.some(klass =>
    klass.id !== excludingClassId &&
    klass.isArchived !== true &&
    klass.classTeacherId === teacherUserId
  );
}
