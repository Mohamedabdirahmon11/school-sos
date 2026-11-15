import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { formatSomaliExamDate, isExamTimetableFriday } from '../src/components/common/ExamTimetablePrint.tsx';

const print = readFileSync(new URL('../src/components/common/ExamTimetablePrint.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/components/schooladmin/ExamsResultsView.tsx', import.meta.url), 'utf8');
const student = readFileSync(new URL('../src/components/student/StudentPortalView.tsx', import.meta.url), 'utf8');
const parent = readFileSync(new URL('../src/components/parent/ParentPortalView.tsx', import.meta.url), 'utf8');
const teacher = readFileSync(new URL('../src/components/teacher/TeacherPortalView.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/server/school-settings.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261115123000_exam_timetable_print_settings.sql', import.meta.url), 'utf8');

test('formats Somali weekday and dd/mm/yyyy', () => {
  assert.equal(formatSomaliExamDate('2026-11-16'), 'Isniin 16/11/2026');
  assert.equal(formatSomaliExamDate('2026-11-20'), 'Jimce 20/11/2026');
});

test('Friday is omitted by default and can be enabled', () => {
  assert.equal(isExamTimetableFriday('2026-11-20'), true);
  assert.equal(isExamTimetableFriday('2026-11-19'), false);
  assert.match(print, /school\?\.examTimetableIncludeFriday\s*===\s*true/);
  assert.match(print, /!isExamTimetableFriday/);
  assert.match(admin, /Include Friday exam sessions/);
});

test('uses three columns, date row spans, gold header and A4 print', () => {
  for (const label of ['TAARIIKHDA', 'MAADADA', 'WAQTIGA']) assert.ok(print.includes(label));
  assert.match(print, /rowSpan=\{dayGroups\.length\}/);
  assert.ok(print.includes('#D9A425'));
  assert.ok(print.includes('size:A4 portrait'));
});

test('all role portals use the shared read-only timetable', () => {
  for (const source of [student, parent, teacher]) {
    assert.match(source, /<ExamTimetablePrint schedules=\{publishedExamSchedules\} school=\{school\} \/>/);
  }
});

test('school settings validate editable headings and Arabic school identity', () => {
  assert.match(admin, /handleSaveExamTimetablePrintSettings/);
  assert.match(settings, /nameArabic: z\.string/);
  assert.match(settings, /examTimetableIncludeFriday: z\.boolean/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS name_arabic/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS exam_timetable_include_friday/);
  assert.doesNotMatch(migration, /DROP COLUMN|DELETE FROM/i);
});
