import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMarkSchemeMaximums } from '../src/lib/exam-results.ts';

test('uses the saved assessment snapshot instead of a newer admin scheme', () => {
  const savedScheme = [
    { id: 'quiz', category: 'continuous', maxMarks: 20 },
    { id: 'final', category: 'final', maxMarks: 80 }
  ];
  assert.deepEqual(getMarkSchemeMaximums(savedScheme, 40, 60), {
    small: 20, big: 80, total: 100
  });
});

test('supports multiple continuous assessments and final components', () => {
  const savedScheme = [
    { category: 'continuous', maxMarks: 10 },
    { category: 'continuous', maxMarks: 15 },
    { category: 'final', maxMarks: 75 }
  ];
  assert.deepEqual(getMarkSchemeMaximums(savedScheme), {
    small: 25, big: 75, total: 100
  });
});

test('uses compatibility totals for legacy marks without a snapshot', () => {
  assert.deepEqual(getMarkSchemeMaximums([], 40, 60), {
    small: 40, big: 60, total: 100
  });
});
