import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTimetableSettings } from '../src/server/school-settings.ts';

test('accepts separate morning and afternoon timetable settings', () => {
  const result = sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20,
    shift2FirstPeriodStart: '13:00',
    shift2PeriodMinutes: 45,
    shift2BreakAfterPeriod: 2,
    shift2BreakMinutes: 15
  });

  assert.equal(result.firstPeriodStart, '08:00');
  assert.equal(result.shift2FirstPeriodStart, '13:00');
  assert.equal(result.shift2PeriodMinutes, 45);
  assert.equal(result.shift2BreakAfterPeriod, 2);
  assert.equal(result.shift2BreakMinutes, 15);
});

test('rejects invalid afternoon start time and period length', () => {
  assert.throws(() => sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20,
    shift2FirstPeriodStart: '25:00'
  }));

  assert.throws(() => sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20,
    shift2PeriodMinutes: 10
  }));
});

test('shift count defaults to one and accepts an explicitly enabled second shift', () => {
  const single = sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20
  });
  assert.equal(single.shiftCount, 1);

  const two = sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20,
    shiftCount: 2,
    shift2FirstPeriodStart: '13:00',
    shift2PeriodMinutes: 40,
    shift2BreakAfterPeriod: 3,
    shift2BreakMinutes: 20
  });
  assert.equal(two.shiftCount, 2);
});

test('two shifts require all second-shift timetable values', () => {
  assert.throws(() => sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20,
    shiftCount: 2
  }), /Configure every second-shift timetable value/);
});

test('shift count accepts only one or two', () => {
  assert.throws(() => sanitizeTimetableSettings({
    firstPeriodStart: '08:00',
    periodMinutes: 40,
    breakAfterPeriod: 3,
    breakMinutes: 20,
    shiftCount: 3
  }));
});
