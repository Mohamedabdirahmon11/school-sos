import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateExamSubjectTotal,
  calculateExamStudentResult,
  rankExamStudentResults,
  calculateFinalSubjectScore,
  formatExamScore
} from '../src/lib/exam-calculations.ts';

const parts = [
  { id: 'quiz', name: 'Quiz', maxMarks: 10 },
  { id: 'mid', name: 'Mid-test', maxMarks: 30 },
  { id: 'final', name: 'Final', maxMarks: 60 }
];

test('subject total requires every configured part and validates each maximum', () => {
  assert.equal(calculateExamSubjectTotal({ quiz: 8, mid: 20 }, parts), null);
  assert.equal(calculateExamSubjectTotal({ quiz: 8, mid: 20, final: 50 }, parts), 78);
  assert.equal(calculateExamSubjectTotal({ quiz: 11, mid: 20, final: 50 }, parts), null);
});

test('term totals and averages count active subjects only and block ranking when incomplete', () => {
  const complete = calculateExamStudentResult([
    { subjectId: 'math', score: 80, max: 100 },
    { subjectId: 'english', score: 90, max: 100 },
    { subjectId: 'inactive', score: null, max: 100 }
  ]);
  assert.deepEqual(complete, { total: 170, average: 85, subjectCount: 2, complete: false });
  const finished = calculateExamStudentResult([
    { subjectId: 'math', score: 80, max: 100 },
    { subjectId: 'english', score: 90, max: 100 }
  ]);
  assert.deepEqual(finished, { total: 170, average: 85, subjectCount: 2, complete: true });
});

test('class ranking is withheld until every student has submitted every active subject', () => {
  const rows = [
    { studentId: 'a', total: 180, complete: true },
    { studentId: 'b', total: 170, complete: false }
  ];
  assert.deepEqual(rankExamStudentResults(rows).map(row => row.rank), [null, null]);
});

test('ranking shares ties and uses unrounded totals', () => {
  const rows = [
    { studentId: 'a', total: 180.25, complete: true },
    { studentId: 'b', total: 180.25, complete: true },
    { studentId: 'c', total: 180.2, complete: true },
    { studentId: 'd', total: 170, complete: true }
  ];
  assert.deepEqual(rankExamStudentResults(rows).map(row => row.rank), [1, 1, 3, 4]);
});

test('final term subject score requires both terms and averages without early rounding', () => {
  assert.equal(calculateFinalSubjectScore(80, null), null);
  assert.equal(calculateFinalSubjectScore(80, 85), 82.5);
  assert.equal(formatExamScore(82.5), '82.5');
  assert.equal(formatExamScore(80), '80');
});
