import test from 'node:test';
import assert from 'node:assert/strict';
import { getSchoolCalendarStatus, getSchoolPeriodsPerDay, getSchoolWorkingDays } from '../src/lib/school-calendar.ts';

test('school working days use configured days in weekday order and safe defaults', () => {
  assert.deepEqual(getSchoolWorkingDays({ workingDays: ['Friday', 'Monday', 'Friday', 'invalid'] }), ['Monday', 'Friday']);
  assert.deepEqual(getSchoolWorkingDays({ workingDays: [] }), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
});

test('school period count respects valid setup values and caps invalid settings', () => {
  assert.equal(getSchoolPeriodsPerDay({ periodsPerDay: 9 }), 9);
  assert.equal(getSchoolPeriodsPerDay({ periodsPerDay: 0 }), 6);
  assert.equal(getSchoolPeriodsPerDay({ periodsPerDay: 17 }), 6);
});

test('school calendar identifies weekly, national and school holidays', () => {
  const calendar = {
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    weeklyHolidays: ['Saturday', 'Sunday'],
    nationalHolidays: [{ name: 'National Day', date: '2026-10-05', calendar: 'gregorian' as const }],
    schoolHolidays: [{ name: 'Mid-term break', startDate: '2026-12-20', endDate: '2026-12-25' }]
  };
  assert.equal(getSchoolCalendarStatus('2026-10-03', calendar).isWeeklyHoliday, true);
  assert.deepEqual(getSchoolCalendarStatus('2026-10-05', calendar), { weekday: 'Monday', isWeeklyHoliday: false, holidayName: 'National Day', holidayType: 'national' });
  assert.equal(getSchoolCalendarStatus('2026-12-22', calendar).holidayName, 'Mid-term break');
});

test('school calendar identifies Ethiopian fixed holidays and rejects invalid dates', () => {
  assert.equal(getSchoolCalendarStatus('2026-09-11').holidayName, 'Ethiopian New Year (Enkutatash)');
  assert.equal(getSchoolCalendarStatus('not-a-date').holidayName, null);
});
