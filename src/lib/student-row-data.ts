export type StudentRowLike = {
  id?: string;
  classId?: string | null;
  class_id?: string | null;
  className?: string | null;
  section?: string | null;
  gender?: string | null;
  status?: string | null;
  fatherPhone?: string | null;
  father_phone?: string | null;
  motherPhone?: string | null;
  mother_phone?: string | null;
};

export type StudentClassLike = {
  id: string;
  name: string;
  section?: string | null;
};

export function normalizeStudentPhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00251')) return `+251${digits.slice(5)}`;
  if (digits.startsWith('251')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+251${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('9')) return `+251${digits}`;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return raw;
}

export function resolveStudentParentPhone(
  student: StudentRowLike,
  primaryGuardianPhone?: unknown
): string {
  const value = student.fatherPhone || student.father_phone
    || student.motherPhone || student.mother_phone
    || primaryGuardianPhone;
  return normalizeStudentPhone(value) || 'Phone not provided';
}

export function resolveStudentGender(value: unknown): 'Male' | 'Female' | '—' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  return '—';
}

export function resolveStudentStatus(value: unknown): 'active' | 'inactive' | 'transferred' | 'graduated' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'inactive' || normalized === 'transferred' || normalized === 'graduated') return normalized;
  return 'active';
}

export function resolveStudentClassName(
  student: StudentRowLike,
  classes: StudentClassLike[]
): string {
  const supplied = String(student.className ?? '').trim();
  if (supplied && supplied.toLowerCase() !== 'not assigned') return supplied;
  const classId = String(student.classId || student.class_id || '').trim();
  const klass = classes.find(item => item.id === classId);
  if (!klass) return 'Not assigned';
  return [klass.name, klass.section || student.section].filter(Boolean).join(' · ');
}

export function resolvePrimaryGuardianPhone(rows: unknown): string {
  if (!Array.isArray(rows)) return '';
  const candidates = rows as Array<{ is_primary?: boolean; guardians?: { phone?: string | null } | null }>;
  const ordered = [...candidates].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
  return String(ordered.find(row => row.guardians?.phone)?.guardians?.phone || '');
}
