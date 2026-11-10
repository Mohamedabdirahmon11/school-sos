import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchoolLocalDate } from '../src/lib/school-local-date.ts';

test('uses the school timezone when the browser date is on another day', () => {
  const instant = new Date('2026-11-09T21:30:00.000Z');
  assert.equal(getSchoolLocalDate(instant, 'Africa/Addis_Ababa'), '2026-11-10');
  assert.equal(getSchoolLocalDate(instant, 'America/Los_Angeles'), '2026-11-09');
});

test('falls back safely when a stored timezone is invalid', () => {
  assert.equal(getSchoolLocalDate(new Date('2026-11-09T21:30:00.000Z'), 'Invalid/Timezone'), '2026-11-10');
});
