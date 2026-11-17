export type TemplateKind =
  | 'exam_result_list'
  | 'individual_report_card'
  | 'attendance_sheet'
  | 'certificate'
  | 'student_id_cards'
  | 'official_letter'
  | 'fee_receipt'
  | 'class_timetable'
  | 'class_list';

export type MarkException = 'ABS' | 'LB';
export type MarkValue = number | MarkException;
export type StudentOutcome = 'Gudub' | 'Aan Gudbin' | 'Maqan' | 'Laga Baabiyey';

export interface MarkParseResult {
  valid: boolean;
  value?: MarkValue;
  message?: string;
}

export interface PassRule {
  mode: 'percent' | 'fixed';
  percent?: number;
  fixedTotal?: number;
}

export interface OutcomeCounts {
  total: number;
  passed: number;
  failed: number;
  absent: number;
  exempted: number;
}

export interface AttendanceEntry {
  studentId: string;
  date: string;
  status: 'J' | 'M' | '';
}

export interface TemplateSubject {
  id: string;
  name: string;
  maxMark: number;
}

export interface TemplateConfig {
  version: number;
  kind: TemplateKind;
  title: string;
  direction: 'ltr' | 'rtl';
  accentColor: string;
  rowsPerPage: number;
  subjects: TemplateSubject[];
  passRule: PassRule;
  showLogo: boolean;
  showQr: boolean;
  showSummary: boolean;
  showFooter: boolean;
  zebra: boolean;
  fontSize: number;
  rowHeight: number;
}

const EXCEPTION_MARKS = new Set<MarkException>(['ABS', 'LB']);
const TEMPLATE_KINDS = new Set<TemplateKind>([
  'exam_result_list', 'individual_report_card', 'attendance_sheet',
  'certificate', 'student_id_cards', 'official_letter', 'fee_receipt',
  'class_timetable', 'class_list'
]);

export function parseMark(input: unknown, maxMark = 100): MarkParseResult {
  if (typeof input === 'string') {
    const normalized = input.trim().toUpperCase();
    if (EXCEPTION_MARKS.has(normalized as MarkException)) {
      return { valid: true, value: normalized as MarkException };
    }
    if (!normalized || !/^(?:\\d+(?:\\.\\d+)?|\\.\\d+)$/.test(normalized)) {
      return { valid: false, message: 'Geli dhibco sax ah, ABS ama LB.' };
    }
    input = Number(normalized);
  }
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > maxMark) {
    return { valid: false, message: `Dhibcuhu waa inay u dhexeeyaan 0 iyo ${maxMark}.` };
  }
  return { valid: true, value: input };
}

export function sumMarks(values: readonly MarkValue[]): number {
  return values.reduce((sum, value) => typeof value === 'number' && Number.isFinite(value) ? sum + value : sum, 0);
}

export function maximumMarks(subjects: readonly Pick<TemplateSubject, 'maxMark'>[]): number {
  return subjects.reduce((sum, subject) => sum + subject.maxMark, 0);
}

export function passThreshold(subjects: readonly Pick<TemplateSubject, 'maxMark'>[], rule: PassRule): number {
  const maximum = maximumMarks(subjects);
  if (rule.mode === 'fixed') return Math.max(0, Math.min(maximum, Number(rule.fixedTotal) || 0));
  const percent = Math.max(0, Math.min(100, Number(rule.percent ?? 40) || 0));
  return Math.ceil(maximum * percent / 100);
}

export function hasPassed(total: number, subjects: readonly Pick<TemplateSubject, 'maxMark'>[], rule: PassRule): boolean {
  return total >= passThreshold(subjects, rule);
}

export function summarizeOutcomes(outcomes: readonly StudentOutcome[]): OutcomeCounts {
  return outcomes.reduce<OutcomeCounts>((counts, outcome) => {
    counts.total += 1;
    if (outcome === 'Gudub') counts.passed += 1;
    else if (outcome === 'Aan Gudbin') counts.failed += 1;
    else if (outcome === 'Maqan') counts.absent += 1;
    else if (outcome === 'Laga Baabiyey') counts.exempted += 1;
    return counts;
  }, { total: 0, passed: 0, failed: 0, absent: 0, exempted: 0 });
}

export function monthDays(year: number, month: number, weekendDays: readonly number[] = [0], holidays: readonly string[] = []): Array<{ date: string; day: number; isWeekend: boolean; isHoliday: boolean }> {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Sanadka ama bisha sax ma aha.');
  }
  const holidaySet = new Set(holidays);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { date, day, isWeekend: weekendDays.includes(weekday), isHoliday: holidaySet.has(date) };
  });
}

export function countAttendance(entries: readonly AttendanceEntry[], studentId: string): { present: number; absent: number } {
  return entries.reduce((counts, entry) => {
    if (entry.studentId !== studentId) return counts;
    if (entry.status === 'J') counts.present += 1;
    if (entry.status === 'M') counts.absent += 1;
    return counts;
  }, { present: 0, absent: 0 });
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): { items: T[]; page: number; pageSize: number; pageCount: number; total: number } {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.max(1, Math.min(pageCount, Math.floor(page)));
  const start = (safePage - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page: safePage, pageSize: safePageSize, pageCount, total: items.length };
}

export function removeSubjectAndMarks<T extends { subjectId: string }>(subjects: readonly TemplateSubject[], marks: readonly T[], subjectId: string): { subjects: TemplateSubject[]; marks: T[] } {
  return {
    subjects: subjects.filter(subject => subject.id !== subjectId),
    marks: marks.filter(mark => mark.subjectId !== subjectId)
  };
}

export function escapePlainText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] || character);
}

export function validateTemplateConfig(value: unknown): value is TemplateConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<TemplateConfig>;
  return Number.isInteger(config.version)
    && TEMPLATE_KINDS.has(config.kind as TemplateKind)
    && typeof config.title === 'string' && config.title.length > 0 && config.title.length <= 160
    && (config.direction === 'ltr' || config.direction === 'rtl')
    && /^#[0-9a-fA-F]{6}$/.test(config.accentColor || '')
    && Number.isInteger(config.rowsPerPage) && (config.rowsPerPage as number) >= 5 && (config.rowsPerPage as number) <= 25
    && Array.isArray(config.subjects) && config.subjects.length >= 1 && config.subjects.length <= 12
    && config.subjects.every(subject => subject && typeof subject.id === 'string' && typeof subject.name === 'string' && subject.name.length <= 80 && Number.isFinite(subject.maxMark) && subject.maxMark > 0 && subject.maxMark <= 100)
    && !!config.passRule && ['percent', 'fixed'].includes(config.passRule.mode)
    && (config.passRule.mode !== 'percent' || (Number.isFinite(config.passRule.percent ?? 40) && Number(config.passRule.percent ?? 40) >= 0 && Number(config.passRule.percent ?? 40) <= 100))
    && (config.passRule.mode !== 'fixed' || (Number.isFinite(config.passRule.fixedTotal) && Number(config.passRule.fixedTotal) >= 0))
    && Number.isFinite(config.fontSize) && config.fontSize >= 8 && config.fontSize <= 24
    && Number.isFinite(config.rowHeight) && config.rowHeight >= 18 && config.rowHeight <= 64
    && typeof config.showLogo === 'boolean' && typeof config.showQr === 'boolean'
    && typeof config.showSummary === 'boolean' && typeof config.showFooter === 'boolean'
    && typeof config.zebra === 'boolean';
}

export function exportTemplateConfig(config: TemplateConfig): string {
  if (!validateTemplateConfig(config)) throw new TypeError('Template config-ku ma saxna.');
  return JSON.stringify(config);
}

export function importTemplateConfig(serialized: string): TemplateConfig {
  const parsed: unknown = JSON.parse(serialized);
  if (!validateTemplateConfig(parsed)) throw new TypeError('Template config-ku ma saxna.');
  return parsed;
}
