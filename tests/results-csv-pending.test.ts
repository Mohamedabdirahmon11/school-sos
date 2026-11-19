import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResultsCsv } from '../src/lib/results-csv.ts';

test('semester CSV marks incomplete students as pending instead of failing them', () => {
  const csv = buildResultsCsv('semester', [{
    rank: 0,
    student: { studentId: 'S-02', firstName: 'Amina', lastName: 'Ali' },
    subjectCount: 2,
    expectedSubjectCount: 4,
    averagePercentage: 0,
    isComplete: false,
    isPass: false
  }], () => 'F', 50);
  assert.match(csv, /"Pending","S-02","Amina Ali","2\/4","","","Pending subjects"/);
});

test('semester CSV uses the approved server grade and pass decision', () => {
  const csv = buildResultsCsv('semester', [{
    rank: 1,
    student: { studentId: 'S-01', firstName: 'Omar' },
    subjectCount: 4,
    expectedSubjectCount: 4,
    averagePercentage: 83,
    grade: 'B+',
    isComplete: true,
    isPass: true
  }], () => 'B', 50);
  assert.match(csv, /"1","S-01","Omar","4\/4","83","B\+","Passing"/);
});
