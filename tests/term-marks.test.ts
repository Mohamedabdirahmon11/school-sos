import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTermComponents,calculateYearlySubject,rankWithTies} from '../src/lib/term-marks.ts';

test('term components always total exactly 100',()=>{
  for(const exam of [50,60]){
    const rows=buildTermComponents(exam,'single',1);
    assert.equal(rows.reduce((sum,row)=>sum+row.maxMarks,0),100);
    assert.equal(rows[0].kind,'exam');
  }
  const quizzes=buildTermComponents(60,'quizzes',4);
  assert.deepEqual(quizzes.slice(1).map(row=>row.maxMarks),[10,10,10,10]);
  assert.equal(quizzes.reduce((sum,row)=>sum+row.maxMarks,0),100);
});

test('invalid quiz divisions are rejected',()=>{
  assert.throws(()=>buildTermComponents(60,'quizzes',3),/si isle/);
  assert.throws(()=>buildTermComponents(55,'single',1),/50 ama 60/);
});

test('yearly subject score is the average of the two terms',()=>{
  assert.equal(calculateYearlySubject(80,90),85);
  assert.equal(calculateYearlySubject(0,100),50);
  assert.throws(()=>calculateYearlySubject(101,80),/0 iyo 100/);
});

test('class ranking gives equal ranks to ties and skips the next rank',()=>{
  const ranked=rankWithTies([{name:'A',score:95},{name:'B',score:95},{name:'C',score:80}],row=>row.score);
  assert.deepEqual(ranked.map(row=>row.rank),[1,1,3]);
});
