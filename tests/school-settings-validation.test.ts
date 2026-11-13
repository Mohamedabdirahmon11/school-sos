import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSchoolSettings } from '../src/server/school-settings.ts';

test('school class-level settings allow KG alongside numeric grades', () => {
  assert.deepEqual(sanitizeSchoolSettings({ classLevels: [0, 1, 2, 8] }).classLevels, [0, 1, 2, 8]);
  assert.deepEqual(sanitizeSchoolSettings({ classLevels: [0] }).classLevels, [0]);
});

test('school class-level settings reject values outside KG through Grade 12', () => {
  assert.throws(() => sanitizeSchoolSettings({ classLevels: [-1, 1] }), /between KG/);
  assert.throws(() => sanitizeSchoolSettings({ classLevels: [1, 13] }), /between KG/);
  assert.throws(() => sanitizeSchoolSettings({ classLevels: [] }), /at least one class level/);
});
