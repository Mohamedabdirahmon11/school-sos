import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const view = readFileSync(new URL('../src/components/schooladmin/ClassesView.tsx', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/components/schooladmin/AcademicSetupHeader.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/schooladmin/academic-setup.css', import.meta.url), 'utf8');

test('Classes & Sections uses live school classes and real active teachers', () => {
  assert.ok(view.includes("fetchAllPages<SchoolClass>('/classes')"));
  assert.ok(view.includes("fetchAllPages<Teacher>('/teachers')"));
  assert.match(view, /teacher\.status === 'active'/);
  assert.doesNotMatch(view, /const TEACH\s*=|localStorage|demo data/i);
});

test('Grade 1–8 standard creates only missing Section A classes for the configured school year', () => {
  assert.match(view, /for \(let level = 1; level <= 8; level \+= 1\)/);
  assert.match(view, /createClass\(level, 'A'/);
  assert.match(view, /row\.section\.trim\(\)\.toUpperCase\(\) === 'A'/);
  assert.match(view, /school\.academicYear/);
});

test('Form Teacher dropdown excludes teachers assigned to another class', () => {
  assert.match(view, /usedTeacherIds/);
  assert.match(view, /!usedTeacherIds\.has\(teacher\.userId!\)/);
  assert.match(view, /ApiClient\.updateClass\(row\.id, updates\)/);
});

test('Class removal uses safe archive API and shows dependency protection', () => {
  assert.match(view, /ApiClient\.deleteClass\(row\.id\)/);
  assert.match(view, /students, marks, attendance and fee records are protected/);
});

test('Academic setup header preserves the four exact tabs and hash routes', () => {
  for (const hash of ['#classes', '#subjects', '#curriculum', '#assignment']) assert.ok(header.includes(hash));
  for (const label of ['Classes & Sections', 'Subjects', 'Class Curriculum', 'Teacher Assignment']) assert.ok(header.includes(label));
});

test('Academic setup CSS preserves the reference design tokens and responsive table behavior', () => {
  for (const token of ['#f6f4ee', '#1c2b26', '#d9d6cb', '#1f4d3f', '#121a17', '#1a2420', '#34453d', 'Georgia', 'Source Sans 3', 'max-width:1320px']) assert.ok(css.includes(token));
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /:focus-visible/);
});

test('Class table capacity edits persist on blur instead of remaining local-only', () => {
  assert.match(view, /capacityDrafts\[row\.id\]/);
  assert.match(view, /onBlur=\{\(\) => void saveCapacity\(row\)\}/);
  assert.match(view, /ApiClient\.updateClass\(row\.id, updates\)/);
});
