import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/064_school_wide_exam_subject_sessions.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExamsResultsView.tsx', import.meta.url), 'utf8');

test('shared subject exam sessions require explicit mixed cohorts and keep room guards', () => {
  assert.match(migration, /ALTER TABLE public\.exam_schedules ALTER COLUMN class_id DROP NOT NULL/);
  assert.match(migration, /Select participating students before publishing a school-wide subject session/);
  assert.match(migration, /Assign an active Exam Room before publishing this session/);
  assert.match(api, /cohortStudentIds/);
  assert.match(api, /db\.setExamScheduleCohort\(school\.id, schedule\.id, cohortStudentIds\)/);
  assert.match(storage, /class_id: schedule\.classId \|\| null/);
  assert.match(client, /classId\?: string/);
});

test('exam generator creates one shared schedule per unique subject with an editable daily limit', () => {
  assert.match(ui, /subjectPlans = new Map/);
  assert.match(ui, /setAutoSubjectsPerDay\(Math\.max\(1, Math\.min\(6/);
  assert.match(ui, /All classes assigned to this subject/);
  assert.match(ui, /Generate school timetable/);
});

test('printed room seating roster identifies the class for each mixed student', () => {
  assert.match(storage, /className: student \? \(classNames\.get\(student\.classId\)/);
  assert.match(ui, /Room roster for display at the examination-room entrance/);
  assert.match(ui, /seat\.className/);
});
