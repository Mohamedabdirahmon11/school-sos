export type TimetableShift = 1 | 2;

export interface TimetableShiftSettings {
  firstPeriodStart: string;
  periodMinutes: number;
  breakAfterPeriod: number;
  breakMinutes: number;
  shift2FirstPeriodStart?: string;
  shift2PeriodMinutes?: number;
  shift2BreakAfterPeriod?: number;
  shift2BreakMinutes?: number;
}

export interface TimetablePeriodTime {
  startTime: string;
  endTime: string;
}

export function timetableClockMinutes(value: string): number {
  const match = /^(\\d{2}):(\\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error('Time must use HH:MM.');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error('Time must use HH:MM.');
  return hours * 60 + minutes;
}

export function timetableClock(value: number): string {
  const safe = Math.max(0, Math.min(1439, Math.trunc(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function getShiftTimetableSettings(settings: TimetableShiftSettings, shift: number = 1) {
  if (shift === 2) {
    return {
      firstPeriodStart: settings.shift2FirstPeriodStart || '13:00',
      periodMinutes: Number(settings.shift2PeriodMinutes ?? 40),
      breakAfterPeriod: Number(settings.shift2BreakAfterPeriod ?? 3),
      breakMinutes: Number(settings.shift2BreakMinutes ?? 20)
    };
  }
  return {
    firstPeriodStart: settings.firstPeriodStart || '08:00',
    periodMinutes: Number(settings.periodMinutes ?? 40),
    breakAfterPeriod: Number(settings.breakAfterPeriod ?? 3),
    breakMinutes: Number(settings.breakMinutes ?? 20)
  };
}

export function getTimetablePeriodTimes(settings: TimetableShiftSettings, period: number, shift: number = 1): TimetablePeriodTime {
  if (!Number.isInteger(period) || period < 1 || period > 6) throw new Error('Period must be between 1 and 6.');
  const selected = getShiftTimetableSettings(settings, shift);
  const start = timetableClockMinutes(selected.firstPeriodStart)
    + (period - 1) * selected.periodMinutes
    + (period > selected.breakAfterPeriod ? selected.breakMinutes : 0);
  return { startTime: timetableClock(start), endTime: timetableClock(start + selected.periodMinutes) };
}

export function timetableTimesOverlap(first: { startTime: string; endTime: string }, second: { startTime: string; endTime: string }): boolean {
  const firstStart = timetableClockMinutes(first.startTime);
  const firstEnd = timetableClockMinutes(first.endTime);
  const secondStart = timetableClockMinutes(second.startTime);
  const secondEnd = timetableClockMinutes(second.endTime);
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function hasTeacherTimeClash(
  candidate: { dayOfWeek: string; teacherId: string; classId: string; startTime: string; endTime: string },
  existing: Array<{ dayOfWeek: string; teacherId: string; classId: string; startTime: string; endTime: string }>
): boolean {
  return existing.some(slot =>
    slot.dayOfWeek === candidate.dayOfWeek
    && slot.teacherId === candidate.teacherId
    && slot.classId !== candidate.classId
    && timetableTimesOverlap(candidate, slot)
  );
}

export function hasRoomTimeClash(
  candidate: { dayOfWeek: string; roomNumber: string; classId: string; startTime: string; endTime: string },
  existing: Array<{ dayOfWeek: string; roomNumber: string; classId: string; startTime: string; endTime: string }>
): boolean {
  const room = candidate.roomNumber.trim().toLowerCase();
  return Boolean(room) && existing.some(slot =>
    slot.dayOfWeek === candidate.dayOfWeek
    && slot.classId !== candidate.classId
    && slot.roomNumber.trim().toLowerCase() === room
    && timetableTimesOverlap(candidate, slot)
  );
}
