export const SCHOOL_SETUP_DEFAULTS = {
  schoolInformation: { name: '', logoUrl: '', address: '', phone: '', email: '', schoolType: 'combined' as const },
  academicYear: { name: '', startDate: '', endDate: '', isCurrent: true },
  terms: [] as Array<{ name: string; startDate: string; endDate: string }>,
  calendar: { workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], weeklyHolidays: ['Saturday', 'Sunday'], nationalHolidays: [] as Array<{ name: string; date: string; calendar: 'ethiopian' | 'gregorian' }>, schoolHolidays: [] as Array<{ name: string; startDate: string; endDate: string }>, calendarType: 'both' as const },
  workingHours: { openingTime: '07:30', classStartTime: '08:00', closingTime: '16:00', breakStartTime: '10:00', breakEndTime: '10:30', periodsPerDay: 8 },
  completedSteps: [] as number[]
};

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateSchoolSetupStep(step: number, data: any): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Setup data must be an object.';
  if (step === 1) {
    const s = data.schoolInformation;
    if (!s || !String(s.name || '').trim() || !String(s.address || '').trim() || !String(s.phone || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email || ''))) return 'School name, address, phone and a valid email are required.';
    if (!['primary', 'secondary', 'combined'].includes(s.schoolType)) return 'Choose a valid school type.';
    if (s.logoUrl && (String(s.logoUrl).length > 2_000_000 || !/^https:\/\/|^data:image\/(png|jpeg|webp);base64,/i.test(String(s.logoUrl)))) return 'School logo must be a valid HTTPS image URL or PNG, JPEG or WebP image smaller than 1.5 MB.';
  }
  if (step === 2) {
    const y = data.academicYear;
    if (!y || !/^\d{4}\/\d{4}$/.test(String(y.name || '')) || !validIsoDate(y.startDate) || !validIsoDate(y.endDate) || y.startDate >= y.endDate) return 'Enter a valid academic year and an ordered start/end date.';
    const years = String(y.name).split('/').map(Number);
    if (years[1] !== years[0] + 1) return 'Academic year must contain consecutive years, such as 2026/2027.';
  }
  if (step === 3) {
    const terms = data.terms;
    if (!Array.isArray(terms) || terms.length < 1 || terms.length > 3 || terms.some((t: any) => !String(t.name || '').trim() || !validIsoDate(t.startDate) || !validIsoDate(t.endDate) || t.startDate >= t.endDate)) return 'Add 1–3 terms with valid names and start/end dates.';
    const sorted = [...terms].sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
    if (sorted.some((t: any, i: number) => i > 0 && sorted[i - 1].endDate >= t.startDate)) return 'Term dates must not overlap.';
  }
  if (step === 4) {
    const c = data.calendar;
    const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!c || !Array.isArray(c.workingDays) || !c.workingDays.length || !Array.isArray(c.weeklyHolidays) || c.workingDays.some((d: string) => !allowedDays.includes(d) || c.weeklyHolidays.includes(d)) || c.weeklyHolidays.some((d: string) => !allowedDays.includes(d))) return 'Choose working days and weekly holidays without overlap.';
    if (!['ethiopian', 'gregorian', 'both'].includes(c.calendarType)) return 'Choose a supported calendar display.';
    if (!Array.isArray(c.nationalHolidays) || !Array.isArray(c.schoolHolidays)) return 'Holiday lists are invalid.';
    if (c.nationalHolidays.some((h: any) => !String(h.name || '').trim() || !validIsoDate(h.date) || !['ethiopian', 'gregorian'].includes(h.calendar || 'ethiopian')) || c.schoolHolidays.some((h: any) => !String(h.name || '').trim() || !validIsoDate(h.startDate) || !validIsoDate(h.endDate) || h.startDate > h.endDate)) return 'Holiday names and dates must be valid.';
  }
  if (step === 5) {
    const w = data.workingHours;
    const time = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
    if (!w || !time(w.openingTime) || !time(w.classStartTime) || !time(w.closingTime) || !time(w.breakStartTime) || !time(w.breakEndTime) || !Number.isInteger(w.periodsPerDay) || w.periodsPerDay < 1 || w.periodsPerDay > 16) return 'Enter valid school times and 1–16 daily periods.';
    if (!(w.openingTime <= w.classStartTime && w.classStartTime < w.closingTime && w.breakStartTime < w.breakEndTime && w.breakStartTime >= w.classStartTime && w.breakEndTime < w.closingTime)) return 'School hours and break times are not in the correct order.';
  }
  return null;
}
