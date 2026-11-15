import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/schooladmin/TimetableView.tsx', import.meta.url), 'utf8');

test('timetable print dialog lets the admin choose 1 to 5 classes to print', () => {
  assert.match(source, /aria-label="Print timetables"/);
  assert.match(source, /printSelection\.length >= 5/);
  assert.match(source, /\.slice\(0, 5\)/);
  assert.match(source, /ids\.length === 1 \? 'single' : 'multiple'/);
  assert.match(source, /jadwal ma jiro/);
  assert.match(source, /disabled=\{!printSelection\.length\}/);
});
