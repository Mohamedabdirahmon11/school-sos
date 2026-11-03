import { z } from 'zod';
import { School, SchoolBranch, GradingBand, ExamConfig } from '../types/index.ts';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i;
const MAX_LOGO_CHARS = 2_800_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ALLOWED_CURRENCIES = ['ETB', 'USD', 'SOS'] as const;
export const DEFAULT_GRADING_SCALE: GradingBand[] = [
  { minPercentage: 90, label: 'A', remark: 'Excellent' },
  { minPercentage: 80, label: 'B', remark: 'Very good' },
  { minPercentage: 70, label: 'C', remark: 'Good' },
  { minPercentage: 60, label: 'D', remark: 'Satisfactory' },
  { minPercentage: 0, label: 'F', remark: 'Below pass mark' }
];
export const DEFAULT_ATTENDANCE_RULES = { lateAfterMinutes: 15, absentAfterMinutes: 0, requireExcusedReason: true, allowParentExcuses: false };
export const DEFAULT_CLASS_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const DEFAULT_TERMS = { semester1Start: '', semester1End: '', semester2Start: '', semester2End: '' };
export const DEFAULT_NOTIFICATION_PREFERENCES = { email: true, sms: true, inApp: true, attendanceAlerts: true, feeReminders: true, examResults: true };

function cleanText(value: unknown, field: string, maxLength: number, required = false): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  return trimmed;
}

function cleanEmail(value: unknown, field: string): string {
  const email = cleanText(value, field, 150, true).toLowerCase();
  if (!EMAIL.test(email)) throw new Error(`${field} must be a valid email address.`);
  return email;
}

function cleanLogo(value: unknown): string {
  if (value === null) return '';
  if (typeof value !== 'string') throw new Error('School logo must be an image upload or URL.');
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length > MAX_LOGO_CHARS) throw new Error('School logo must be 2.8 MB or smaller.');
  if (IMAGE_DATA_URL.test(trimmed)) return trimmed;
  if (/^https?:\/\/[^\s]+$/i.test(trimmed) && trimmed.length <= 2048) return trimmed;
  throw new Error('School logo must be an uploaded PNG/JPG image, a WebP image, or an http(s) URL.');
}

function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const headerText = (field: string, max: number) => z.string().trim().max(max, `${field} must be ${max} characters or fewer.`);
const isoDate = z.string().trim().regex(DATE, 'Term dates must use YYYY-MM-DD.');
const termDatesSchema = z.object({
  semester1Start: z.union([z.literal(''), isoDate]),
  semester1End: z.union([z.literal(''), isoDate]),
  semester2Start: z.union([z.literal(''), isoDate]),
  semester2End: z.union([z.literal(''), isoDate])
}).superRefine((terms, ctx) => {
  const values = [terms.semester1Start, terms.semester1End, terms.semester2Start, terms.semester2End];
  if (values.some(value => !value)) return;
  if (!values.every(isValidDate)) return;
  if (terms.semester1Start > terms.semester1End) ctx.addIssue({ code: 'custom', message: 'Semester 1 start date must be on or before its end date.', path: ['semester1Start'] });
  if (terms.semester2Start > terms.semester2End) ctx.addIssue({ code: 'custom', message: 'Semester 2 start date must be on or before its end date.', path: ['semester2Start'] });
  if (terms.semester1End > terms.semester2Start) ctx.addIssue({ code: 'custom', message: 'Semester 2 must start after Semester 1 ends.', path: ['semester2Start'] });
});

const gradingScaleSchema = z.array(z.object({
  minPercentage: z.number().min(0, 'Grade minimum must be between 0 and 100.').max(100, 'Grade minimum must be between 0 and 100.'),
  label: z.string().trim().min(1, 'Each grade band needs a label.').max(20, 'Grade labels must be 20 characters or fewer.'),
  remark: z.string().trim().max(120, 'Grade remarks must be 120 characters or fewer.').optional()
})).min(1, 'Add at least one grade band.').max(20, 'Use 20 grade bands or fewer.').superRefine((bands, ctx) => {
  for (let index = 0; index < bands.length; index += 1) {
    if (index > 0 && bands[index].minPercentage >= bands[index - 1].minPercentage) {
      ctx.addIssue({ code: 'custom', message: 'Grade bands must use strictly descending minimum percentages.', path: [index, 'minPercentage'] });
    }
  }
  const labels = bands.map(band => band.label.toLowerCase());
  if (new Set(labels).size !== labels.length) ctx.addIssue({ code: 'custom', message: 'Grade labels must be unique.', path: ['label'] });
  if (bands[bands.length - 1].minPercentage !== 0) ctx.addIssue({ code: 'custom', message: 'The final grade band must start at 0%.', path: [bands.length - 1, 'minPercentage'] });
});

const schoolSettingsSchema = z.object({
  name: z.string().trim().min(1, 'School name is required.').max(255, 'School name must be 255 characters or fewer.').optional(),
  email: z.string().trim().max(150, 'School email must be 150 characters or fewer.').regex(EMAIL, 'School email must be a valid email address.').optional(),
  address: z.string().trim().max(500, 'Address must be 500 characters or fewer.').optional(),
  city: z.string().trim().max(100, 'City must be 100 characters or fewer.').optional(),
  phone: z.string().trim().max(50, 'Telephone must be 50 characters or fewer.').optional(),
  brandColor: z.string().trim().regex(HEX_COLOR, 'Brand color must be a six-digit hex color.').optional(),
  logoUrl: z.string().optional(),
  currency: z.enum(ALLOWED_CURRENCIES, 'Currency must be ETB, USD, or SOS.').optional(),
  language: z.enum(['en', 'so'], 'Language must be English or Somali.').optional(),
  timezone: z.string().trim().min(1, 'Timezone is required.').max(100, 'Timezone must be 100 characters or fewer.').refine(isValidTimeZone, 'Timezone must be a valid IANA timezone.').optional(),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, 'Academic year must use YYYY-YYYY.').refine(value => {
    const [start, end] = value.split('-').map(Number);
    return end === start + 1;
  }, 'Academic year must cover two consecutive years.').optional(),
  currentSemester: z.enum(['Semester 1', 'Semester 2']).optional(),
  terms: termDatesSchema.optional(),
  gradingScale: gradingScaleSchema.optional(),
  attendanceRules: z.object({
    lateAfterMinutes: z.number().int().min(0, 'Late threshold must be between 0 and 240 minutes.').max(240, 'Late threshold must be between 0 and 240 minutes.'),
    absentAfterMinutes: z.number().int().min(0, 'Absent threshold must be between 0 and 240 minutes.').max(240, 'Absent threshold must be between 0 and 240 minutes.'),
    requireExcusedReason: z.boolean(),
    allowParentExcuses: z.boolean()
  }).optional(),
  classLevels: z.array(z.number().int().min(1, 'Class levels must be between 1 and 12.').max(12, 'Class levels must be between 1 and 12.')).min(1, 'Select at least one class level.').max(12, 'Use 12 class levels or fewer.').refine(levels => new Set(levels).size === levels.length, 'Class levels must be unique.').optional(),
  reportCardHeader: headerText('Report card header', 300).optional(),
  reportCardFooter: headerText('Report card footer', 300).optional(),
  receiptHeader: headerText('Receipt header', 300).optional(),
  receiptFooter: headerText('Receipt footer', 300).optional(),
  notificationPreferences: z.object({
    email: z.boolean(),
    sms: z.boolean(),
    inApp: z.boolean(),
    attendanceAlerts: z.boolean(),
    feeReminders: z.boolean(),
    examResults: z.boolean()
  }).optional(),
  defaultClassCapacity: z.number().int('Default class capacity must be a whole number between 1 and 500.').min(1, 'Default class capacity must be a whole number between 1 and 500.').max(500, 'Default class capacity must be a whole number between 1 and 500.').optional(),
  studentAccessEnabled: z.boolean('Student portal access must be true or false.').optional()
});

export function sanitizeSchoolSettings(body: unknown): Partial<School> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('School settings payload must be an object.');
  const parsed = schoolSettingsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new Error(`${path}${issue.message}`);
  }
  const updates: Partial<School> = { ...parsed.data } as Partial<School>;
  if (updates.email) updates.email = updates.email.toLowerCase();
  if (updates.brandColor) updates.brandColor = updates.brandColor.toLowerCase();
  if (updates.logoUrl !== undefined) updates.logoUrl = cleanLogo(updates.logoUrl);
  if (updates.classLevels) updates.classLevels = [...updates.classLevels].sort((a, b) => a - b);
  if (updates.gradingScale) updates.gradingScale = [...updates.gradingScale].sort((a, b) => b.minPercentage - a.minPercentage);
  return updates;
}

export type BranchInput = Pick<SchoolBranch, 'name' | 'address' | 'phone' | 'email' | 'isMain'>;

export function sanitizeBranchInput(body: unknown, partial = false): Partial<BranchInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Branch payload must be an object.');
  const input = body as Record<string, unknown>;
  const updates: Partial<BranchInput> = {};

  if (input.name !== undefined || !partial) updates.name = cleanText(input.name, 'Branch name', 150, true);
  if (input.address !== undefined || !partial) updates.address = cleanText(input.address, 'Branch address', 500, true);
  if (input.phone !== undefined) updates.phone = cleanText(input.phone, 'Branch telephone', 50);
  if (input.email !== undefined) updates.email = input.email === '' || input.email === null ? '' : cleanEmail(input.email, 'Branch email');
  if (input.isMain !== undefined) {
    if (typeof input.isMain !== 'boolean') throw new Error('Main campus must be true or false.');
    updates.isMain = input.isMain;
  }

  return updates;
}

const examConfigSchema = z.object({
  smallExamName: z.string().trim().min(1, 'Small exam name is required.').max(100, 'Small exam name must be 100 characters or fewer.').optional(),
  smallExamMax: z.number().min(1, 'Small exam maximum must be between 1 and 1000.').max(1000, 'Small exam maximum must be between 1 and 1000.').optional(),
  bigExamName: z.string().trim().min(1, 'Big exam name is required.').max(100, 'Big exam name must be 100 characters or fewer.').optional(),
  bigExamMax: z.number().min(1, 'Big exam maximum must be between 1 and 1000.').max(1000, 'Big exam maximum must be between 1 and 1000.').optional(),
  passMarkPercentage: z.number().min(0, 'Pass mark must be between 0 and 100.').max(100, 'Pass mark must be between 0 and 100.').optional()
});

export function sanitizeExamConfigSettings(body: unknown): Partial<ExamConfig> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Exam configuration payload must be an object.');
  const parsed = examConfigSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new Error(`${path}${issue.message}`);
  }
  if (!Object.keys(parsed.data).length) throw new Error('Provide at least one exam setting to update.');
  return parsed.data as Partial<ExamConfig>;
}

const timetableSettingsSchema = z.object({
  firstPeriodStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Timetable start must use HH:MM.'),
  periodMinutes: z.number().int('Period length must be a whole number.').min(20, 'Period length must be 20-120 minutes.').max(120, 'Period length must be 20-120 minutes.'),
  breakAfterPeriod: z.number().int('Break position must be a whole number.').min(1, 'Break must follow period 1-5.').max(5, 'Break must follow period 1-5.'),
  breakMinutes: z.number().int('Break length must be a whole number.').min(0, 'Break length must be 0-120 minutes.').max(120, 'Break length must be 0-120 minutes.')
});

export function sanitizeTimetableSettings(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Timetable settings payload must be an object.');
  const parsed = timetableSettingsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new Error(`${path}${issue.message}`);
  }
  return parsed.data;
}
