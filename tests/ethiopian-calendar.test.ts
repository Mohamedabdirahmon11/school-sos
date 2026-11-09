import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEthiopianCalendarInfo } from '../src/lib/ethiopian-calendar.ts';

test('Ethiopian calendar identifies fixed national holidays', () => {
  const newYear = getEthiopianCalendarInfo('2026-09-11');
  assert.match(newYear.dateLabel, /Meskerem/i);
  assert.equal(newYear.holiday, 'Ethiopian New Year (Enkutatash)');
});

test('Ethiopian calendar returns a date label and no holiday for ordinary days', () => {
  const ordinary = getEthiopianCalendarInfo('2026-10-01');
  assert.ok(ordinary.dateLabel.length > 0);
  assert.equal(ordinary.holiday, null);
});

test('Ethiopian calendar safely handles invalid dates', () => {
  assert.deepEqual(getEthiopianCalendarInfo('not-a-date'), { dateLabel: 'not-a-date', holiday: null });
});
