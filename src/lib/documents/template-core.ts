/** Pure helpers for the editable result-list and attendance-sheet templates (no DOM, no network). */

export type MarkValue = number | 'ABS' | 'LB' | null;
export type ResultStatus = 'pass' | 'fail' | 'absent' | 'cancelled';
export type PassRuleKind = 'percent' | 'average' | 'total';

export interface PassRule { kind: PassRuleKind; value: number }
export interface SubjectColumn { id: string; name: string; max: number }

const HEX = /^#[0-9a-f]{6}$/i;
export const TEMPLATE_TYPES = ['result_list', 'attendance_sheet'] as const;
export type TemplateType = typeof TEMPLATE_TYPES[number];

export type MarkParse = { ok: true; value: MarkValue } | { ok: false; error: string };

/** Accepts blank, a number from 0..max, "ABS" or "LB". Anything else is rejected with a Somali message. */
export function parseMark(input: unknown, max: number): MarkParse {
  const text = String(input ?? '').trim();
  if (text === '') return { ok: true, value: null };
  const upper = text.toUpperCase();
  if (upper === 'ABS' || upper === 'LB') return { ok: true, value: upper };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'Geli lambar, ABS ama LB.' };
  const value = Number(text);
  if (value < 0 || value > max) return { ok: false, error: `Dhibcuhu waa inay u dhexeeyaan 0 iyo ${max}.` };
  return { ok: true, value };
}

/** ABS and LB never add to the total. */
export function markTotal(marks: MarkValue[]): number {
  return marks.reduce<number>((sum, mark) => (typeof mark === 'number' ? sum + mark : sum), 0);
}

export function maxTotal(subjects: SubjectColumn[]): number {
  return subjects.reduce((sum, subject) => sum + subject.max, 0);
}

/** Threshold points the student must reach (percent of the maximum total, an average, or a fixed total). */
export function passThreshold(rule: PassRule, subjects: SubjectColumn[]): number {
  const max = maxTotal(subjects);
  if (rule.kind === 'percent') return Math.round((max * rule.value) / 100 * 100) / 100;
  if (rule.kind === 'average') return Math.round(rule.value * subjects.length * 100) / 100;
  return rule.value;
}

export function studentResultStatus(marks: MarkValue[], subjects: SubjectColumn[], rule: PassRule): ResultStatus {
  if (marks.some(mark => mark === 'LB')) return 'cancelled';
  if (marks.length > 0 && marks.every(mark => mark === 'ABS')) return 'absent';
  return markTotal(marks) >= passThreshold(rule, subjects) ? 'pass' : 'fail';
}

export function summarizeStatuses(statuses: ResultStatus[]) {
  const count = (status: ResultStatus) => statuses.filter(item => item === status).length;
  return { total: statuses.length, pass: count('pass'), fail: count('fail'), absent: count('absent'), cancelled: count('cancelled') };
}

/** Splits rows into pages. Every page repeats the header, and the caller shows "Page x of y". */
export function paginate<T>(rows: T[], perPage: number): Array<{ page: number; pages: number; rows: T[] }> {
  const size = Math.min(25, Math.max(5, Math.floor(perPage) || 20));
  const pages = Math.max(1, Math.ceil(rows.length / size));
  return Array.from({ length: pages }, (_unused, index) => ({ page: index + 1, pages, rows: rows.slice(index * size, (index + 1) * size) }));
}

export interface MonthDay { day: number; iso: string; weekday: number; weekend: boolean }

/** Builds every day of a month (month is 1-12). Weekend weekdays default to Friday (5), the common Somali/Ethiopian rest day, plus Sunday. */
export function monthDays(year: number, month: number, weekendDays: number[] = [0, 5]): MonthDay[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: count }, (_unused, index) => {
    const day = index + 1;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return { day, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, weekday, weekend: weekendDays.includes(weekday) };
  });
}

export type AttendanceMark = '' | 'J' | 'M';
export const nextAttendanceMark = (current: AttendanceMark): AttendanceMark => (current === '' ? 'J' : current === 'J' ? 'M' : '');

/** J = present (including late), M = absent. Excused records are not counted as absent. */
export function attendanceMarkFromStatus(status: string | null | undefined): AttendanceMark {
  if (status === 'present' || status === 'late') return 'J';
  if (status === 'absent') return 'M';
  return '';
}

export function attendanceCounts(marks: AttendanceMark[]) {
  return { present: marks.filter(mark => mark === 'J').length, absent: marks.filter(mark => mark === 'M').length };
}

export interface LayoutConfig {
  color: string;
  rowsPerPage: number;
  fontSize: number;
  zebra: boolean;
  showLogo: boolean;
  showQr: boolean;
  showSummary: boolean;
  showFooter: boolean;
  passRule: PassRule;
  subjects: SubjectColumn[];
  texts: Record<string, string>;
}

export const DEFAULT_LAYOUT: LayoutConfig = {
  color: '#1e3a8a', rowsPerPage: 20, fontSize: 11, zebra: true, showLogo: true, showQr: true, showSummary: true, showFooter: true,
  passRule: { kind: 'percent', value: 40 }, subjects: [], texts: {}
};

/** Validates untrusted template JSON. Returns a clean config or a Somali error; never passes raw values through. */
export function validateLayoutConfig(input: unknown): { ok: true; config: LayoutConfig } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Template-ku waa inuu noqdaa shay sax ah.' };
  const raw = input as Record<string, any>;
  const color = raw.color ?? DEFAULT_LAYOUT.color;
  if (typeof color !== 'string' || !HEX.test(color)) return { ok: false, error: 'Midabku waa inuu ahaadaa hex sax ah, tusaale #1e3a8a.' };
  const rowsPerPage = raw.rowsPerPage ?? DEFAULT_LAYOUT.rowsPerPage;
  if (!Number.isInteger(rowsPerPage) || rowsPerPage < 5 || rowsPerPage > 25) return { ok: false, error: 'Safafka bogga waa inay u dhexeeyaan 5 iyo 25.' };
  const fontSize = raw.fontSize ?? DEFAULT_LAYOUT.fontSize;
  if (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 16) return { ok: false, error: 'Cabbirka far-qorista waa inuu u dhexeeyaa 8 iyo 16.' };
  const flags = ['zebra', 'showLogo', 'showQr', 'showSummary', 'showFooter'] as const;
  const out: Record<string, boolean> = {};
  for (const flag of flags) {
    const value = raw[flag] ?? DEFAULT_LAYOUT[flag];
    if (typeof value !== 'boolean') return { ok: false, error: `${flag} waa inuu ahaadaa true ama false.` };
    out[flag] = value;
  }
  const rule = raw.passRule ?? DEFAULT_LAYOUT.passRule;
  if (!rule || !['percent', 'average', 'total'].includes(rule.kind) || typeof rule.value !== 'number' || !Number.isFinite(rule.value) || rule.value < 0 || rule.value > 1200)
    return { ok: false, error: 'Xeerka gudbinta ma sax aha.' };
  if (rule.kind === 'percent' && rule.value > 100) return { ok: false, error: 'Boqolkii waa inuusan ka badnaan 100.' };
  const subjects = raw.subjects ?? [];
  if (!Array.isArray(subjects) || subjects.length > 12) return { ok: false, error: 'Maaddooyinku waa inay u dhexeeyaan 0 iyo 12.' };
  const cleanSubjects: SubjectColumn[] = [];
  for (const subject of subjects) {
    if (!subject || typeof subject.id !== 'string' || subject.id.length > 64 || typeof subject.name !== 'string' || subject.name.length > 40
      || typeof subject.max !== 'number' || !Number.isFinite(subject.max) || subject.max < 1 || subject.max > 100)
      return { ok: false, error: 'Maaddo kasta waa inay leedahay magac iyo dhibco ugu badan 1..100.' };
    cleanSubjects.push({ id: subject.id, name: subject.name.trim(), max: subject.max });
  }
  const texts = raw.texts ?? {};
  if (typeof texts !== 'object' || Array.isArray(texts) || Object.keys(texts).length > 60) return { ok: false, error: 'Qoraalada template-ka aad bay u badan yihiin.' };
  const cleanTexts: Record<string, string> = {};
  for (const [key, value] of Object.entries(texts)) {
    if (!/^[a-z][a-z0-9_]{0,40}$/i.test(key) || typeof value !== 'string' || value.length > 400) return { ok: false, error: 'Qoraal template ah ma sax aha ama aad buu u dheer yahay.' };
    cleanTexts[key] = value;
  }
  return { ok: true, config: { color, rowsPerPage, fontSize, ...(out as any), passRule: { kind: rule.kind, value: rule.value }, subjects: cleanSubjects, texts: cleanTexts } };
}
