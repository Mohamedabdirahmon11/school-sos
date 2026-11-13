import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGradeBand, getGradeLabel } from '../src/lib/grading.ts';

const scale = [
  { minPercentage: 90, label: 'A' },
  { minPercentage: 80, label: 'B' },
  { minPercentage: 70, label: 'C' },
  { minPercentage: 60, label: 'D' },
  { minPercentage: 0, label: 'F' }
];

test('school grading scale uses inclusive lower boundaries', () => {
  assert.equal(getGradeLabel(100, scale), 'A');
  assert.equal(getGradeLabel(90, scale), 'A');
  assert.equal(getGradeLabel(89.99, scale), 'B');
  assert.equal(getGradeLabel(80, scale), 'B');
  assert.equal(getGradeLabel(79.99, scale), 'C');
  assert.equal(getGradeLabel(70, scale), 'C');
  assert.equal(getGradeLabel(69.99, scale), 'D');
  assert.equal(getGradeLabel(60, scale), 'D');
  assert.equal(getGradeLabel(59.99, scale), 'F');
  assert.equal(getGradeLabel(0, scale), 'F');
});

test('grade conversion rejects missing, non-finite, and out-of-range percentages', () => {
  assert.equal(getGradeBand(undefined, scale), null);
  assert.equal(getGradeBand(Number.NaN, scale), null);
  assert.equal(getGradeBand(-1, scale), null);
  assert.equal(getGradeBand(101, scale), null);
  assert.equal(getGradeLabel(80), '—');
});
