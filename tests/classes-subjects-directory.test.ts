import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const classesSource = readFileSync(new URL('../src/components/schooladmin/ClassesSubjectsView.tsx', import.meta.url), 'utf8');
const teachersSource = readFileSync(new URL('../src/components/schooladmin/TeachersView.tsx', import.meta.url), 'utf8');

test('Classes & Sections are grouped by grade, branch and shift with searchable section cards', () => {
  assert.match(classesSource, /const classGroups = visibleClasses\.reduce/);
  assert.match(classesSource, /const key = `\$\{klass\.branchId \|\| 'unassigned'\}:\$\{grade\}:\$\{klass\.shift \|\| 1\}`/);
  assert.match(classesSource, /aria-label="Search classes and sections"/);
  assert.match(classesSource, /aria-label="Filter classes by branch"/);
  assert.match(classesSource, /Section \{klass\.section \|\| '—'\}/);
});

test('Subjects remain editable with class-specific teacher, periods and exam assignments', () => {
  assert.match(classesSource, /Class Subject Assignment/);
  assert.match(classesSource, /Periods\/week/);
  assert.match(classesSource, /Teacher<select/);
  assert.match(classesSource, /smallExamEnabled/);
  assert.match(classesSource, /bigExamEnabled/);
  assert.match(classesSource, /Credit units and departments are not required/);
});

test('Teacher directory includes Form Teacher classes as well as profile class assignments', () => {
  assert.match(teachersSource, /classes\.filter\(klass => klass\.classTeacherId === t\.userId/);
  assert.match(teachersSource, /displayedClassIds = Array\.from\(new Set/);
  assert.match(teachersSource, /\(Form Teacher\)/);
});
