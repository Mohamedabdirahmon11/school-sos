import type { TimetableSlot } from '../types/index.ts';

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export interface TimetableGrid {
  days: string[];
  periods: number[];
  /** key: `${day}:${period}` → slots in that cell (more than one when classes run in different shifts). */
  cells: Map<string, TimetableSlot[]>;
}

/** Build a weekly grid; Saturday is shown only when a slot uses it. */
export function buildTimetableGrid(slots: TimetableSlot[]): TimetableGrid {
  const usedDays = new Set(slots.map(slot => slot.dayOfWeek as string));
  const days = WEEK_DAYS.filter(day => day !== 'Saturday' || usedDays.has(day)) as string[];
  const maxPeriod = Math.max(0, ...slots.map(slot => Number(slot.periodNumber) || 0));
  const periods = Array.from({ length: maxPeriod }, (_, index) => index + 1);
  const cells = new Map<string, TimetableSlot[]>();
  for (const slot of slots) {
    const key = `${slot.dayOfWeek}:${slot.periodNumber}`;
    cells.set(key, [...(cells.get(key) || []), slot]);
  }
  for (const list of cells.values()) list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
  return { days, periods, cells };
}
