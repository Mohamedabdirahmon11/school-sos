import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignSemesterRanks } from '../src/lib/exam-results.ts';

test('semester rankings share positions for ties and skip incomplete students', () => {
  const rows = [
    { id: 'a', isComplete: true, averagePercentage: 90, rank: 0, isTopThree: false },
    { id: 'b', isComplete: true, averagePercentage: 90, rank: 0, isTopThree: false },
    { id: 'c', isComplete: true, averagePercentage: 80, rank: 0, isTopThree: false },
    { id: 'd', isComplete: false, averagePercentage: 0, rank: 0, isTopThree: false }
  ];
  const ranked = assignSemesterRanks(rows);
  assert.deepEqual(ranked.map(row => [row.id, row.rank, row.isTopThree]), [
    ['a', 1, true], ['b', 1, true], ['c', 3, true], ['d', 0, false]
  ]);
});
