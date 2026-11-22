import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('teacher portal uses the supplied design tokens and bounded reference layout', () => {
  const portal = read('../src/components/teacher/TeacherPortalView.tsx');
  const css = read('../src/components/teacher/teacher-portal-design.css');
  assert.match(portal, /teacher-portal-design mx-auto w-full max-w-\[1140px\]/);
  assert.match(portal, /teacher-portal-design\.css/);
  for (const token of ['#f2f5f8', '#ffffff', '#13202d', '#5a6878', '#dbe2ea', '#0e6a62', '#e3f1ef', '#b8302a', '#1d7a4a', '#8a5a00']) {
    assert.ok(css.toLowerCase().includes(token), `missing reference token ${token}`);
  }
});

test('teacher portal design supports dark mode, responsive navigation and keyboard focus', () => {
  const css = read('../src/components/teacher/teacher-portal-design.css');
  assert.match(css, /data-theme="dark"/);
  assert.match(css, /max-width:\s*860px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /overflow-x:\s*auto/);
});

test('teacher portal production component contains no HTML reference demo identities or fixtures', () => {
  const portal = read('../src/components/teacher/TeacherPortalView.tsx');
  for (const fixture of ['Mohamed Muuse', 'Axmed Cabdi', 'Ayaan Maxamed', 'BUS10', 'Nov 2026']) {
    assert.doesNotMatch(portal, new RegExp(fixture.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(portal, /localStorage\.getItem\(['"]teacher-portal/);
});

test('teacher portal continues to load school-scoped live assignments, timetable, students, attendance and marks via API', () => {
  const portal = read('../src/components/teacher/TeacherPortalView.tsx');
  for (const api of ['getTeacherSubjectAssignments', 'getTimetable', 'getMyFormTeacherClasses', 'getAllStudents', 'getDailyAttendance', 'getMarks', 'recordDailyAttendance', 'saveMarks']) {
    assert.ok(portal.includes(api), `expected live API call ${api}`);
  }
});
