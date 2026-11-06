export type CalendarType = 'ethiopian' | 'gregorian';

export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
}

const ETHIOPIAN_PARTS_FORMATTER = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric'
});

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must use YYYY-MM-DD.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid Gregorian date.');
  }
  return date;
}

function partsFor(date: Date): EthiopianDate {
  if (ETHIOPIAN_PARTS_FORMATTER.resolvedOptions().calendar !== 'ethiopic') {
    throw new Error('The runtime does not support the Ethiopian calendar.');
  }
  const parts = ETHIOPIAN_PARTS_FORMATTER.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  const result = { year: value('year'), month: value('month'), day: value('day') };
  if (!Number.isInteger(result.year) || !Number.isInteger(result.month) || !Number.isInteger(result.day)) {
    throw new Error('The runtime does not support the Ethiopian calendar.');
  }
  return result;
}

export function gregorianToEthiopian(isoDate: string): EthiopianDate {
  return partsFor(parseIsoDate(isoDate));
}

export function ethiopianToGregorian(value: EthiopianDate): string {
  const { year, month, day } = value;
  if (![year, month, day].every(Number.isInteger) || year < 1 || month < 1 || month > 13 || day < 1 || day > 30) {
    throw new Error('Invalid Ethiopian date.');
  }

  // Ethiopian year N overlaps Gregorian years N+7 and N+8. Search the
  // narrow 13-month window using ICU's calendar implementation so leap-day
  // rules and the September 11/12 new-year shift are not reimplemented.
  const start = Date.UTC(year + 7, 8, 1);
  const end = Date.UTC(year + 8, 8, 20);
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    const date = new Date(timestamp);
    const parts = partsFor(date);
    if (parts.year === year && parts.month === month && parts.day === day) {
      return date.toISOString().slice(0, 10);
    }
  }
  throw new Error('Invalid Ethiopian date for the selected year.');
}

export function formatSchoolDate(isoDate: string, calendarType: CalendarType, locale = 'en'): string {
  const date = parseIsoDate(isoDate);
  const calendarLocale = calendarType === 'ethiopian'
    ? `${locale}-u-ca-ethiopic-nu-latn`
    : locale;
  const formatter = new Intl.DateTimeFormat(calendarLocale, {
    timeZone: 'UTC',
    dateStyle: 'medium'
  });
  // English ICU output appends the implementation era label ("ERA1") for
  // Ethiopic dates. It is not useful in school-facing dates, so omit only
  // that part while preserving the locale's date ordering and month name.
  return formatter.formatToParts(date)
    .filter(part => part.type !== 'era')
    .map(part => part.value)
    .join('');
}

export function schoolDateToGregorian(value: string, calendarType: CalendarType): string {
  if (calendarType === 'gregorian') {
    parseIsoDate(value);
    return value;
  }
  const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) throw new Error('Ethiopian date must use YYYY-MM-DD.');
  return ethiopianToGregorian({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  });
}

export function gregorianToSchoolDate(isoDate: string, calendarType: CalendarType): string {
  if (calendarType === 'gregorian') {
    parseIsoDate(isoDate);
    return isoDate;
  }
  const { year, month, day } = gregorianToEthiopian(isoDate);
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

export function schoolAcademicYearToGregorian(value: string, calendarType: CalendarType): string {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  if (!match) throw new Error('Academic year must use YYYY-YYYY.');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) throw new Error('Academic year must cover two consecutive years.');
  if (calendarType === 'gregorian') return value;
  const firstDay = ethiopianToGregorian({ year: start, month: 1, day: 1 });
  const secondDay = ethiopianToGregorian({ year: end, month: 1, day: 1 });
  return `${firstDay.slice(0, 4)}-${secondDay.slice(0, 4)}`;
}

export function gregorianAcademicYearToSchool(value: string, calendarType: CalendarType): string {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  if (!match) throw new Error('Academic year must use YYYY-YYYY.');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) throw new Error('Academic year must cover two consecutive years.');
  if (calendarType === 'gregorian') return value;
  for (let day = 10; day <= 13; day += 1) {
    const candidate = gregorianToEthiopian(`${String(start).padStart(4, '0')}-09-${day}`);
    if (candidate.month === 1 && candidate.day === 1) {
      return `${candidate.year}-${candidate.year + 1}`;
    }
  }
  throw new Error('Unable to determine Ethiopian academic year boundary.');
}

export function schoolTodayIso(timeZone = 'Africa/Addis_Ababa'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatSchoolDateTime(isoDateTime: string, calendarType: CalendarType, locale = 'en', timeZone = 'Africa/Addis_Ababa'): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  const calendarLocale = calendarType === 'ethiopian'
    ? `${locale}-u-ca-ethiopic-nu-latn`
    : locale;
  const formatter = new Intl.DateTimeFormat(calendarLocale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  return formatter.formatToParts(date)
    .filter(part => part.type !== 'era')
    .map(part => part.value)
    .join('');
}
