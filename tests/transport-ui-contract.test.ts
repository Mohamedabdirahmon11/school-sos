import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const view = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');

test('transport uses one student register for both assignment and current bus passengers', () => {
  assert.match(view, /Student bus register/);
  assert.match(view, /All students/);
  assert.match(view, /On a bus/);
  assert.match(view, /Not assigned/);
  assert.match(view, /Assign \/ move/);
  assert.match(view, /activeBusAssignments\.find\(item => item\.studentId === student\.id\)/);
  assert.match(view, /Bus ma raaco/);
});

test('transport dashboard shows route capacity, available seats and saved monthly fees', () => {
  assert.match(view, /Seats available/);
  assert.match(view, /Monthly bus fees/);
  assert.match(view, /Bus occupancy/);
  assert.match(view, /seats remaining/);
  assert.match(view, /formatMoney\(assignment\.feeAmount, school\?\.currency\)/);
});

test('transport student register supports class and text search while preserving bulk assignment', () => {
  assert.match(view, /assignmentClassId === 'all' \|\| student\.classId === assignmentClassId/);
  assert.match(view, /busStudentSearch\.trim\(\)\.toLowerCase\(\)/);
  assert.match(view, /handleAssignBus/);
  assert.match(view, /selectedBusStudentIds/);
});
