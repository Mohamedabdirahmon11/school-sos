import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateExamSubjectTotal,
  calculateExamStudentResult,
  rankExamStudentResults,
  calculateFinalSubjectScore,
  formatExamScore
} from '../src/lib/exam-calculations.ts';
import { translations } from '../src/lib/translations.ts';

const parts = [
  { id: 'quiz', name: 'Quiz', maxMarks: 10 },
  { id: 'mid', name: 'Mid-test', maxMarks: 30 },
  { id: 'final', name: 'Final', maxMarks: 60 }
];

test('subject total requires every configured part and validates each maximum', () => {
  assert.equal(calculateExamSubjectTotal({ quiz: 8, mid: 20 }, parts), null);
  assert.equal(calculateExamSubjectTotal({ quiz: 8, mid: 20, final: 50 }, parts), 78);
  assert.equal(calculateExamSubjectTotal({ quiz: 'ABS', mid: 'LB', final: 50 }, parts), 50);
  assert.equal(calculateExamSubjectTotal({ quiz: 'ABS' }, parts), null);
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


test('seven-subject yearly example preserves half marks until the final average', () => {
  const term1 = Array(7).fill(80) as number[];
  const term2 = Array(7).fill(85) as number[];
  assert.equal(term1.reduce((sum, score) => sum + score, 0), 560);
  assert.equal(term2.reduce((sum, score) => sum + score, 0), 595);
  const finalSubjects = term1.map((score, index) => calculateFinalSubjectScore(score, term2[index])!);
  assert.equal(finalSubjects.reduce((sum, score) => sum + score, 0), 577.5);
  assert.equal(finalSubjects.reduce((sum, score) => sum + score, 0) / 7, 82.5);
});

test('exam workflow labels are available in English, Somali, and Arabic', () => {
  assert.equal(translations.en.exam_forward_to_admin, 'Forward class to Admin');
  assert.equal(translations.so.exam_forward_to_admin, 'Fasalka u gudbi Maamulka');
  assert.equal(translations.ar.exam_forward_to_admin, 'إرسال الصف إلى الإدارة');
  assert.equal(translations.ar.exam_publish_results, 'نشر النتائج');
});
