import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDocumentAcademicMarks } from '../src/lib/documents/academic-variables.ts';

const gradingScale = [
  { minPercentage:90, label:'A' },
  { minPercentage:80, label:'B' },
  { minPercentage:70, label:'C' },
  { minPercentage:0, label:'F' }
];

test('summarizes approved marks and ranks students in the class', () => {
  const result = summarizeDocumentAcademicMarks([
    { studentId:'s1', status:'approved', totalMarks:85, percentage:85, teacherRemarks:'Good progress', submittedAt:'2026-10-01' },
    { studentId:'s1', status:'approved', totalMarks:95, percentage:95, teacherRemarks:'Excellent', submittedAt:'2026-10-02' },
    { studentId:'s2', status:'approved', totalMarks:70, percentage:70 },
    { studentId:'s3', status:'draft', totalMarks:100, percentage:100 }
  ],'s1',gradingScale);
  assert.deepEqual(result,{totalMarks:'180',average:'90.00',grade:'A',rank:'1',teacherComment:'Excellent'});
});

test('does not expose draft or missing marks as academic results', () => {
  const result = summarizeDocumentAcademicMarks([
    { studentId:'s1', status:'draft', totalMarks:100, percentage:100 }
  ],'s1',gradingScale);
  assert.deepEqual(result,{totalMarks:'',average:'',grade:'',rank:'',teacherComment:''});
});

test('uses deterministic shared rank order for equal averages', () => {
  const result = summarizeDocumentAcademicMarks([
    { studentId:'b', status:'approved', totalMarks:80, percentage:80 },
    { studentId:'a', status:'approved', totalMarks:80, percentage:80 }
  ],'b',gradingScale);
  assert.equal(result.rank,'2');
});
