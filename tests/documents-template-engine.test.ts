import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeDocumentHtml } from '../src/lib/documents/sanitize-html.ts';
import {
  countAttendance, escapePlainText, exportTemplateConfig, hasPassed, importTemplateConfig, sumMarks,
  maximumMarks, monthDays, paginate, parseMark, passThreshold, removeSubjectAndMarks,
  summarizeOutcomes, type TemplateConfig, type TemplateSubject
} from '../src/lib/documents/template-engine.ts';

const subjects: TemplateSubject[] = Array.from({ length: 7 }, (_, index) => ({ id: String(index + 1), name: 'Maaddo ' + (index + 1), maxMark: 100 }));

test('marks accept numbers, ABS and LB, and reject invalid or out-of-range values', () => {
  for (const value of [101, -1, 'abc']) assert.equal(parseMark(value).valid, false);
  assert.deepEqual(parseMark('ABS'), { valid: true, value: 'ABS' });
  assert.deepEqual(parseMark('lb'), { valid: true, value: 'LB' });
  assert.deepEqual(parseMark('87').value, 87);
  assert.equal(parseMark(50, 40).valid, false);
});

test('ABS and LB do not contribute to totals', () => {
  assert.equal(maximumMarks(subjects), 700);
  assert.equal(sumMarks([87, 'ABS', 'LB', 0]), 87);
});

test('percentage pass thresholds recalculate from subject count', () => {
  assert.equal(passThreshold(subjects, { mode: 'percent', percent: 40 }), 280);
  assert.equal(passThreshold(subjects.slice(0, 6), { mode: 'percent', percent: 40 }), 240);
  assert.equal(hasPassed(280, subjects, { mode: 'percent', percent: 40 }), true);
  assert.equal(hasPassed(279, subjects, { mode: 'percent', percent: 40 }), false);
});

test('outcome summary counts every status and recalculates from the supplied rows', () => {
  assert.deepEqual(summarizeOutcomes(['Gudub', 'Aan Gudbin', 'Maqan', 'Laga Baabiyey', 'Gudub']), {
    total: 5, passed: 2, failed: 1, absent: 1, exempted: 1
  });
  assert.equal(summarizeOutcomes(['Gudub']).total, 1);
});

test('pagination keeps page size, total, and page count consistent', () => {
  const result = paginate(Array.from({ length: 25 }, (_, index) => index + 1), 1, 20);
  assert.equal(result.items.length, 20);
  assert.equal(result.pageCount, 2);
  assert.equal(result.page, 1);
  assert.equal(paginate(Array.from({ length: 25 }, (_, index) => index + 1), 2, 20).items.length, 5);
});

test('removing a subject also removes its saved marks', () => {
  const result = removeSubjectAndMarks(subjects, [{ subjectId: '1', mark: 90 }, { subjectId: '2', mark: 80 }], '1');
  assert.equal(result.subjects.length, 6);
  assert.deepEqual(result.marks, [{ subjectId: '2', mark: 80 }]);
});

test('attendance month generator supports 28, 29, 30 and 31 days', () => {
  assert.equal(monthDays(2025, 2).length, 28);
  assert.equal(monthDays(2024, 2).length, 29);
  assert.equal(monthDays(2026, 4).length, 30);
  assert.equal(monthDays(2026, 1).length, 31);
});

test('attendance counts J and M independently per student', () => {
  const entries = [
    { studentId: 's1', date: '2026-11-01', status: 'J' as const },
    { studentId: 's1', date: '2026-11-02', status: 'M' as const },
    { studentId: 's1', date: '2026-11-03', status: '' as const },
    { studentId: 's2', date: '2026-11-01', status: 'M' as const }
  ];
  assert.deepEqual(countAttendance(entries, 's1'), { present: 1, absent: 1 });
});

test('untrusted text is escaped and remains text, not executable markup', () => {
  assert.equal(escapePlainText('<script>alert(1)</script><img onerror=x>'), '&lt;script&gt;alert(1)&lt;/script&gt;&lt;img onerror=x&gt;');
});

test('template JSON export/import round-trips without changing the config', () => {
  const config: TemplateConfig = {
    version: 1, kind: 'exam_result_list', title: 'Go’aanka imtixaanka', direction: 'rtl',
    accentColor: '#176b5b', rowsPerPage: 20, subjects, passRule: { mode: 'percent', percent: 40 },
    showLogo: true, showQr: true, showSummary: true, showFooter: true, zebra: true, fontSize: 11, rowHeight: 28
  };
  assert.deepEqual(importTemplateConfig(exportTemplateConfig(config)), config);
  assert.throws(() => importTemplateConfig(JSON.stringify({ ...config, passRule:{mode:'percent',percent:140} })), /Template config-ku ma saxna/);
});

test('Ethiopian school calendar default treats Sunday, not Saturday, as weekly holiday', () => {
  const days = monthDays(2026, 11);
  assert.equal(days.find(day=>day.date==='2026-11-01')?.isWeekend,true);
  assert.equal(days.find(day=>day.date==='2026-11-07')?.isWeekend,false);
});

test('sanitizer rejects embedded data URLs but allows verified QR route and school-logo URLs', () => {
  const allowedQr='data:image/png;base64,iVBORw0KGgo=';
  const allowedLogo='https://rhpazlnjqsmzngxatnwd.supabase.co/storage/v1/object/public/school-logos/SCHOOL1/logo.jpg';
  const verifiedQr='/api/public/document-verification/123e4567-e89b-42d3-a456-426614174000/qr';
  const unsafeLogo='https://evil.example/logo.jpg';
  assert.doesNotMatch(sanitizeDocumentHtml(`<img src="${allowedQr}" alt="qr"/>`),/data:image\/png;base64/);
  assert.match(sanitizeDocumentHtml(`<img src="${verifiedQr}" alt="qr"/>`),/public\/document-verification/);
  assert.match(sanitizeDocumentHtml(`<img src="${allowedLogo}" alt="logo"/>`),/school-logos/);
  assert.doesNotMatch(sanitizeDocumentHtml(`<img src="${unsafeLogo}" alt="bad"/>`),/evil\.example/);
});
