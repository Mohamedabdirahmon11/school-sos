import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  renderAttendanceSheet, renderCertificate, renderClassList, renderClassTimetable,
  renderExamResultList, renderFeeReceipt, renderIndividualReportCard, renderOfficialLetter,
  renderStudentIdCards
} from '../src/lib/documents/structured-renderers.ts';

test('all nine document layouts render Somali headings and escape user text', () => {
  const schoolName = 'Dugsi <script>alert(1)</script>';
  const outputs = [
    renderExamResultList({ schoolName, examTitle: 'Imtixaan', academicYear: '2026', subjects: [{ id: 'm', name: 'Xisaab', maxMark: 100 }], students: [{ id: 'S1', name: '<img onerror=x>', marks: { m: 90 }, outcome: 'Gudub' }], passRule: { mode: 'percent', percent: 40 } }),
    renderIndividualReportCard({ schoolName, student: { id: 'S1', name: 'Asha', className: 'KG 1', academicYear: '2026' }, subjects: [{ name: 'Xisaab', term1: 80, term2: 90, final: 85 }] }),
    renderAttendanceSheet({ schoolName, className: 'KG 1', month: 2, year: 2024, students: [{ id: 'S1', name: 'Asha' }], entries: [] })[0],
    renderCertificate({ schoolName, title: 'Shahaado', studentName: 'Asha', body: 'Guul', date: '2026-11-16' }),
    renderStudentIdCards({ schoolName, year: '2026', cards: [{ id: 'S1', name: 'Asha', className: 'KG 1' }] }),
    renderOfficialLetter({ schoolName, date: '2026-11-16', recipient: 'Waalid', subject: 'Ogeysiis', paragraphs: ['Fariin'], signatory: 'Maamule' }),
    renderFeeReceipt({ schoolName, receiptNumber: 'R1', date: '2026-11-16', student: { id: 'S1', name: 'Asha', className: 'KG 1' }, items: [{ description: 'Waxbarasho', amount: 100 }] }),
    renderClassTimetable({ schoolName, className: 'KG 1', days: ['Isniin'], periods: [{ label: '1', start: '08:00', end: '09:00' }], cells: { Isniin: { '1': 'Xisaab' } } }),
    renderClassList({ schoolName, className: 'KG 1', students: [{ id: 'S1', name: 'Asha' }] })[0]
  ];
  assert.equal(outputs.length, 9);
  for (const html of outputs) {
    assert.match(html, /Dugsi &lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
  }
  assert.match(outputs[0], /GO’AANKA IMTIXAANKA/);
  assert.match(outputs[1], /Term 1/);
  assert.match(outputs[2], /XAADIRINTA ARDAYDA/);
  assert.match(outputs[3], /Shahaado/);
  assert.match(outputs[4], /KAARKA AQOONSIGA/);
  assert.match(outputs[5], /WARQAD RASMI AH/);
  assert.match(outputs[6], /RASIID LACAG-BIXIN/);
  assert.match(outputs[7], /JADWALKA FASALKA/);
  assert.match(outputs[8], /LIISKA ARDAYDA FASALKA/);
});

test('attendance and class-list outputs paginate into separate A4 sheets', () => {
  const students = Array.from({ length: 25 }, (_, index) => ({ id: String(index), name: 'Student ' + index }));
  const attendance = renderAttendanceSheet({ schoolName: 'School', className: 'KG', month: 1, year: 2026, students, entries: [], rowsPerPage: 20 });
  const classList = renderClassList({ schoolName: 'School', className: 'KG', students, rowsPerPage: 20 });
  assert.equal(attendance.length, 2);
  assert.equal(classList.length, 2);
  assert.match(attendance[0], /Bogga 1 \/ 2/);
  assert.match(classList[1], /Bogga 2 \/ 2/);
});

test('exam result layout uses configured pass threshold and outcome counts', () => {
  const html = renderExamResultList({ schoolName: 'School', examTitle: 'Exam', academicYear: '2026', subjects: Array.from({ length: 7 }, (_, index) => ({ id: String(index), name: 'S' + index, maxMark: 100 })), students: [{ id: '1', name: 'A', marks: {}, outcome: 'Gudub' }, { id: '2', name: 'B', marks: {}, outcome: 'Aan Gudbin' }], passRule: { mode: 'percent', percent: 40 } });
  assert.match(html, /Xadka gudbidda: 280 dhibco/);
  assert.match(html, /Gudub: 1/);
  assert.match(html, /Aan Gudbin: 1/);
});

test('exam results and ID cards continue across A4 pages', () => {
  const students=Array.from({length:25},(_,index)=>({id:String(index+1),name:'Arday '+index,marks:{m:50},outcome:'Gudub' as const}));
  const results=renderExamResultList({schoolName:'School',examTitle:'Exam',academicYear:'2026',subjects:[{id:'m',name:'Xisaab',maxMark:100}],students,passRule:{mode:'percent',percent:40},rowsPerPage:20});
  const cards=renderStudentIdCards({schoolName:'School',year:'2026',cards:students.map(student=>({id:student.id,name:student.name,className:'KG'}))});
  assert.match(results,/Bogga 1 \/ 2/);
  assert.match(results,/Bogga 2 \/ 2/);
  assert.match(cards,/Bogga 1 \/ 4/);
  assert.match(cards,/Bogga 4 \/ 4/);
});
