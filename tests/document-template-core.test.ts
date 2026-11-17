import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attendanceCounts, attendanceMarkFromStatus, markTotal, monthDays, nextAttendanceMark, paginate, parseMark,
  passThreshold, studentResultStatus, summarizeStatuses, validateLayoutConfig, DEFAULT_LAYOUT, type SubjectColumn
} from '../src/lib/documents/template-core.ts';

const subjects = (count: number): SubjectColumn[] => Array.from({ length: count }, (_u, i) => ({ id: 's' + i, name: 'S' + i, max: 100 }));

test('mark validation accepts 0..max, ABS and LB and rejects everything else', () => {
  assert.deepEqual(parseMark('85', 100), { ok: true, value: 85 });
  assert.deepEqual(parseMark('abs', 100), { ok: true, value: 'ABS' });
  assert.deepEqual(parseMark('lb', 100), { ok: true, value: 'LB' });
  assert.deepEqual(parseMark('', 100), { ok: true, value: null });
  for (const bad of ['101', '-1', 'abc', '<img onerror=x>', '1e3']) assert.equal(parseMark(bad, 100).ok, false, bad);
});

test('total ignores ABS and LB', () => {
  assert.equal(markTotal([50, 'ABS', 30, 'LB', null]), 80);
});

test('threshold: 40% of 7x100 is 280 and of 6x100 is 240; 280 passes and 279 fails', () => {
  const rule = { kind: 'percent' as const, value: 40 };
  assert.equal(passThreshold(rule, subjects(7)), 280);
  assert.equal(passThreshold(rule, subjects(6)), 240);
  assert.equal(passThreshold({ kind: 'average', value: 50 }, subjects(4)), 200);
  assert.equal(passThreshold({ kind: 'total', value: 150 }, subjects(4)), 150);
  const seven = subjects(7);
  assert.equal(studentResultStatus([40, 40, 40, 40, 40, 40, 40], seven, rule), 'pass');
  assert.equal(studentResultStatus([40, 40, 40, 40, 40, 40, 39], seven, rule), 'fail');
});

test('status and summary counts', () => {
  const rule = { kind: 'percent' as const, value: 40 };
  const two = subjects(2);
  const statuses = [
    studentResultStatus([90, 80], two, rule), studentResultStatus([10, 10], two, rule),
    studentResultStatus(['ABS', 'ABS'], two, rule), studentResultStatus([50, 'LB'], two, rule)
  ];
  assert.deepEqual(statuses, ['pass', 'fail', 'absent', 'cancelled']);
  assert.deepEqual(summarizeStatuses(statuses), { total: 4, pass: 1, fail: 1, absent: 1, cancelled: 1 });
});

test('pagination of 25 rows at 20 per page gives 2 pages with correct page numbers', () => {
  const pages = paginate(Array.from({ length: 25 }, (_u, i) => i), 20);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map(p => [p.page, p.pages, p.rows.length]), [[1, 2, 20], [2, 2, 5]]);
  assert.equal(paginate([], 20).length, 1);
});

test('month day generation covers 28, 29, 30 and 31 days and marks weekends', () => {
  assert.equal(monthDays(2027, 2).length, 28);
  assert.equal(monthDays(2028, 2).length, 29);
  assert.equal(monthDays(2026, 11).length, 30);
  assert.equal(monthDays(2026, 12).length, 31);
  const nov = monthDays(2026, 11); // 2026-11-13 is a Friday, 2026-11-15 is a Sunday
  assert.equal(nov[12].weekend, true);
  assert.equal(nov[14].weekend, true);
  assert.equal(nov[15].weekend, false);
});

test('attendance cycling and J/M counts', () => {
  assert.equal(nextAttendanceMark(''), 'J');
  assert.equal(nextAttendanceMark('J'), 'M');
  assert.equal(nextAttendanceMark('M'), '');
  assert.equal(attendanceMarkFromStatus('late'), 'J');
  assert.equal(attendanceMarkFromStatus('excused'), '');
  assert.deepEqual(attendanceCounts(['J', 'J', 'M', '']), { present: 2, absent: 1 });
});

test('layout config validation rejects invalid input and keeps only known fields', () => {
  assert.equal(validateLayoutConfig({ color: 'red' }).ok, false);
  assert.equal(validateLayoutConfig({ rowsPerPage: 40 }).ok, false);
  assert.equal(validateLayoutConfig({ subjects: subjects(13) }).ok, false);
  assert.equal(validateLayoutConfig({ passRule: { kind: 'percent', value: 120 } }).ok, false);
  assert.equal(validateLayoutConfig({ texts: { 'bad key!': 'x' } }).ok, false);
  const good = validateLayoutConfig({ ...DEFAULT_LAYOUT, extra: '<script>', texts: { title: '<script>alert(1)</script>' } });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal('extra' in good.config, false);
    assert.equal(good.config.texts.title, '<script>alert(1)</script>'); // stored as text; the UI renders it with textContent
    const again = validateLayoutConfig(JSON.parse(JSON.stringify(good.config)));
    assert.deepEqual(again.ok && again.config, good.config); // export then import restores it identically
  }
});
