import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeDocumentHtml } from '../src/lib/documents/sanitize-html.ts';
import {
  renderAttendanceSheet, renderClassList, renderExamResultList, renderStudentIdCards
} from '../src/lib/documents/structured-renderers.ts';

test('exam result, attendance and class-list tables paginate with stable page numbers', () => {
  const students = Array.from({length:25},(_,index)=>({id:String(index+1),name:'Arday '+index,marks:{m:50},outcome:'Gudub' as const}));
  const exam = renderExamResultList({schoolName:'Dugsi',examTitle:'Imtixaan',academicYear:'2026',subjects:[{id:'m',name:'Xisaab',maxMark:100}],students,passRule:{mode:'percent',percent:40},rowsPerPage:20});
  const attendance = renderAttendanceSheet({schoolName:'Dugsi',className:'KG 1',month:1,year:2026,students:students.map(s=>({id:s.id,name:s.name})),entries:[],rowsPerPage:20});
  const classList = renderClassList({schoolName:'Dugsi',className:'KG 1',students:students.map(s=>({id:s.id,name:s.name})),rowsPerPage:20});
  assert.match(exam,/Bogga 1 \/ 2/);
  assert.match(exam,/Bogga 2 \/ 2/);
  assert.equal(attendance.length,2);
  assert.equal(classList.length,2);
  assert.match(attendance[1],/Bogga 2 \/ 2/);
  assert.match(classList[1],/Bogga 2 \/ 2/);
});

test('student ID sheets place eight cards per A4 page and continue to the next page', () => {
  const html=renderStudentIdCards({schoolName:'Dugsi',year:'2026',cards:Array.from({length:9},(_,index)=>({id:String(index+1),name:'Arday '+index,className:'KG'}))});
  assert.match(html,/Bogga 1 \/ 2/);
  assert.match(html,/Bogga 2 \/ 2/);
  assert.equal((html.match(/KAARKA AQOONSIGA ARDAYGA/g)||[]).length,11);
});

test('structured template HTML survives the shared allow-list sanitizer and preserves print breaks', () => {
  const html=renderStudentIdCards({schoolName:'Dugsi',year:'2026',cards:Array.from({length:9},(_,index)=>({id:String(index+1),name:'Arday '+index,className:'KG'}))});
  const safe=sanitizeDocumentHtml(html);
  assert.match(safe,/page-break-after:always/);
  assert.match(safe,/<table/);
  assert.match(safe,/KAARKA AQOONSIGA ARDAYGA/);
  assert.doesNotMatch(safe,/<article|<section|<script/i);
});
