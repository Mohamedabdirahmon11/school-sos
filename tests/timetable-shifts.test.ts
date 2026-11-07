import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getShiftTimetableSettings,
  getTimetablePeriodTimes,
  hasTeacherTimeClash,
  timetableTimesOverlap
} from '../src/lib/timetable.ts';

const settings = {
  firstPeriodStart: '08:00',
  periodMinutes: 40,
  breakAfterPeriod: 3,
  breakMinutes: 20,
  shift2FirstPeriodStart: '13:00',
  shift2PeriodMinutes: 40,
  shift2BreakAfterPeriod: 3,
  shift2BreakMinutes: 30
};

test('period times use the selected shift and insert a 20-minute Shift 1 break', () => {
  assert.deepEqual(getTimetablePeriodTimes(settings, 1, 1), { startTime: '08:00', endTime: '08:40' });
  assert.deepEqual(getTimetablePeriodTimes(settings, 4, 1), { startTime: '10:20', endTime: '11:00' });
});

test('period times use Shift 2 start and its 30-minute break', () => {
  assert.deepEqual(getTimetablePeriodTimes(settings, 1, 2), { startTime: '13:00', endTime: '13:40' });
  assert.deepEqual(getTimetablePeriodTimes(settings, 4, 2), { startTime: '15:30', endTime: '16:10' });
  assert.equal(getShiftTimetableSettings(settings, 2).breakMinutes, 30);
});

test('legacy timetable settings fall back to Shift 1 without changing old times', () => {
  const legacy = { firstPeriodStart: '07:45', periodMinutes: 45, breakAfterPeriod: 2, breakMinutes: 20 };
  assert.deepEqual(getShiftTimetableSettings(legacy, 1), legacy);
  assert.deepEqual(getTimetablePeriodTimes(legacy, 3), { startTime: '09:35', endTime: '10:20' });
  assert.deepEqual(getShiftTimetableSettings(legacy, 2), {
    firstPeriodStart: '13:00', periodMinutes: 40, breakAfterPeriod: 3, breakMinutes: 20
  });
});

test('same period number in different shifts is not a teacher clash when clock times differ', () => {
  const shiftOne = { dayOfWeek: 'Monday', teacherId: 't1', classId: 'c1', ...getTimetablePeriodTimes(settings, 1, 1) };
  const shiftTwo = { dayOfWeek: 'Monday', teacherId: 't1', classId: 'c2', ...getTimetablePeriodTimes(settings, 1, 2) };
  assert.equal(hasTeacherTimeClash(shiftTwo, [shiftOne]), false);
  assert.equal(timetableTimesOverlap(shiftOne, shiftTwo), false);
});

test('actual teacher overlap within a shift is detected', () => {
  const first = { dayOfWeek: 'Tuesday', teacherId: 't1', classId: 'c1', startTime: '08:00', endTime: '08:40' };
  const overlapping = { dayOfWeek: 'Tuesday', teacherId: 't1', classId: 'c2', startTime: '08:30', endTime: '09:10' };
  assert.equal(hasTeacherTimeClash(overlapping, [first]), true);
  assert.equal(timetableTimesOverlap(first, overlapping), true);
});

test('20- and 30-minute breaks are both supported', () => {
  assert.equal(getTimetablePeriodTimes({ ...settings, breakMinutes: 20 }, 4, 1).startTime, '10:20');
  assert.equal(getTimetablePeriodTimes({ ...settings, shift2BreakMinutes: 30 }, 4, 2).startTime, '15:30');
});
