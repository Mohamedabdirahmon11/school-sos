import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildTimetableGrid } from '../src/lib/teacher-timetable.ts';

const slot = (id: string, dayOfWeek: string, periodNumber: number, startTime = '08:00') => ({
  id, schoolId: 's', classId: 'c1', dayOfWeek, periodNumber, startTime, endTime: '08:40', subjectId: 'sub', teacherId: 't', roomNumber: 'R1'
}) as any;

test('weekly grid has Monday-Friday columns and one row per period', () => {
  const grid = buildTimetableGrid([slot('a', 'Monday', 1), slot('b', 'Friday', 5), slot('c', 'Monday', 3)]);
  assert.deepEqual(grid.days, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  assert.deepEqual(grid.periods, [1, 2, 3, 4, 5]);
  assert.equal(grid.cells.get('Monday:1')?.length, 1);
  assert.equal(grid.cells.get('Tuesday:2'), undefined);
});

test('Saturday appears only when used and shifts sharing a cell are ordered by time', () => {
  const grid = buildTimetableGrid([slot('a', 'Saturday', 1), slot('b', 'Monday', 1, '13:00'), slot('c', 'Monday', 1, '08:00')]);
  assert.ok(grid.days.includes('Saturday'));
  assert.deepEqual(grid.cells.get('Monday:1')?.map((item: any) => item.id), ['c', 'b']);
});

test('an empty timetable builds an empty grid', () => {
  assert.deepEqual(buildTimetableGrid([]).periods, []);
});

test('teacher portal renders the weekly grid with a my-lessons filter and print', () => {
  const portal = readFileSync(new URL('../src/components/teacher/TeacherPortalView.tsx', import.meta.url), 'utf8');
  const grid = readFileSync(new URL('../src/components/teacher/TeacherTimetableGrid.tsx', import.meta.url), 'utf8');
  assert.match(portal, /<TeacherTimetableGrid/);
  assert.match(grid, /Jadwalkayga/);
  assert.match(grid, /window\.print\(\)/);
});
