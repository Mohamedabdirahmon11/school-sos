export type StudentRowLike = {
  id?: string;
  classId?: string | null;
  class_id?: string | null;
  className?: string | null;
  class_name?: string | null;
  section?: string | null;
  gender?: string | null;
  status?: string | null;
  student_status?: string | null;
  fatherPhone?: string | null;
  father_phone?: string | null;
  motherPhone?: string | null;
  mother_phone?: string | null;
  enrollment?: { classId?: string | null; class_id?: string | null; className?: string | null } | null;
};

export type StudentClassLike = {
  id: string;
  name: string;
  section?: string | null;
  gradeLevel?: number;
  grade_level?: number;
};

type FeeStructureLike = {
  id?: string;
  name?: string;
  feeType?: string;
  fee_type?: string;
  isActive?: boolean;
  is_active?: boolean;
  classId?: string | null;
  class_id?: string | null;
  minGrade?: number;
  min_grade?: number;
  maxGrade?: number;
  max_grade?: number;
  academicYear?: string;
  academic_year?: string;
};

export function normalizeStudentPhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
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
  const candidates = [
    student.fatherPhone, student.father_phone,
    student.motherPhone, student.mother_phone,
    primaryGuardianPhone
  ];
  for (const candidate of candidates) {
    const normalized = normalizeStudentPhone(candidate);
    if (normalized) return normalized;
  }
  return 'Phone not provided';
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

const normalizedLabel = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function resolveStudentClassName(
  student: StudentRowLike,
  classes: StudentClassLike[]
): string {
  const supplied = String(student.className ?? student.class_name ?? '').trim();
  if (supplied && supplied.toLowerCase() !== 'not assigned') return supplied;
  const classId = String(student.classId || student.class_id || student.enrollment?.classId || student.enrollment?.class_id || '').trim();
  const klass = classes.find(item => String(item.id) === classId)
    || classes.find(item => normalizedLabel([item.name, item.section].filter(Boolean).join(' · ')) === normalizedLabel(supplied));
  if (!klass) return 'Not assigned';
  return [klass.name, klass.section || student.section].filter(Boolean).join(' · ');
}

export function resolveStudentFeeStructure(
  student: StudentRowLike,
  classes: StudentClassLike[],
  structures: FeeStructureLike[],
  academicYear?: string
): FeeStructureLike | undefined {
  const classId = String(student.classId || student.class_id || student.enrollment?.classId || student.enrollment?.class_id || '').trim();
  const suppliedClassName = String(student.className ?? student.class_name ?? student.enrollment?.className ?? '').trim();
  const klass = classes.find(item => String(item.id) === classId)
    || classes.find(item => normalizedLabel([item.name, item.section].filter(Boolean).join(' · ')) === normalizedLabel(suppliedClassName));
  const resolvedClassId = classId || String(klass?.id || '');
  const grade = Number(klass?.gradeLevel ?? klass?.grade_level ?? (suppliedClassName.match(/(?:grade|g)\s*(\d+)/i)?.[1] || NaN));
  const year = String(academicYear || '').trim();
  return structures
    .filter(item => {
      const feeType = String(item.feeType ?? item.fee_type ?? '').toLowerCase();
      const active = item.isActive ?? item.is_active;
      const feeYear = String(item.academicYear ?? item.academic_year ?? '').trim();
      if (feeType !== 'monthly_tuition' || active === false) return false;
      if (feeYear && year && feeYear !== year) return false;
      const feeClassId = String(item.classId || item.class_id || '').trim();
      if (feeClassId) return Boolean(resolvedClassId) && feeClassId === resolvedClassId;
      const minGrade = Number(item.minGrade ?? item.min_grade);
      const maxGrade = Number(item.maxGrade ?? item.max_grade);
      return Number.isFinite(grade) && Number.isFinite(minGrade) && Number.isFinite(maxGrade) && grade >= minGrade && grade <= maxGrade;
    })
    .sort((a, b) => Number(Boolean(b.classId || b.class_id)) - Number(Boolean(a.classId || a.class_id)))[0];
}

export function resolvePrimaryGuardianPhone(rows: unknown): string {
  if (!Array.isArray(rows)) return '';
  const candidates = rows as Array<{ is_primary?: boolean; guardians?: { phone?: string | null } | null }>;
  const ordered = [...candidates].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
  return String(ordered.find(row => row.guardians?.phone)?.guardians?.phone || '');
}
