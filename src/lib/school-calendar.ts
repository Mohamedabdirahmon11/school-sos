import { getEthiopianCalendarInfo } from './ethiopian-calendar.ts';

export const SCHOOL_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export interface SchoolCalendarConfig {
  workingDays?: string[];
  weeklyHolidays?: string[];
  nationalHolidays?: Array<{ name: string; date: string; calendar?: 'ethiopian' | 'gregorian' }>;
  schoolHolidays?: Array<{ name: string; startDate: string; endDate: string }>;
}

export function getSchoolWorkingDays(calendar?: SchoolCalendarConfig | null): string[] {
  const configured = Array.isArray(calendar?.workingDays)
    ? calendar.workingDays.filter(day => SCHOOL_WEEKDAYS.includes(day as typeof SCHOOL_WEEKDAYS[number]))
    : [];
  return configured.length ? SCHOOL_WEEKDAYS.filter(day => configured.includes(day)) : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
}

export function getSchoolPeriodsPerDay(workingHours?: { periodsPerDay?: number } | null): number {
  const count = Number(workingHours?.periodsPerDay);
  return Number.isInteger(count) && count >= 1 && count <= 16 ? count : 6;
}

export interface SchoolCalendarStatus {
  weekday: string;
  isWeeklyHoliday: boolean;
  holidayName: string | null;
  holidayType: 'national' | 'school' | 'ethiopian' | null;
}

export function getSchoolCalendarStatus(
  isoDate: string,
  calendar?: SchoolCalendarConfig | null,
  timeZone = 'Africa/Addis_Ababa'
): SchoolCalendarStatus {
  const fallback = { weekday: '', isWeeklyHoliday: false, holidayName: null, holidayType: null } as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return fallback;
  const date = new Date(isoDate + 'T12:00:00.000Z');
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) return fallback;
  let weekday = '';
  try {
    weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
  } catch {
    weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
  }
  const configuredWorkingDays = getSchoolWorkingDays(calendar);
  const isWeeklyHoliday = Array.isArray(calendar?.weeklyHolidays)
    ? calendar!.weeklyHolidays!.includes(weekday)
    : !configuredWorkingDays.includes(weekday);
  const national = calendar?.nationalHolidays?.find(item => item.date === isoDate);
  if (national) return { weekday, isWeeklyHoliday, holidayName: national.name, holidayType: 'national' };
  const schoolHoliday = calendar?.schoolHolidays?.find(item => item.startDate <= isoDate && item.endDate >= isoDate);
  if (schoolHoliday) return { weekday, isWeeklyHoliday, holidayName: schoolHoliday.name, holidayType: 'school' };
  const ethiopian = getEthiopianCalendarInfo(isoDate, timeZone).holiday;
  if (ethiopian) return { weekday, isWeeklyHoliday, holidayName: ethiopian, holidayType: 'ethiopian' };
  return { weekday, isWeeklyHoliday, holidayName: null, holidayType: null };
}
