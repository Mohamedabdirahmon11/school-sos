import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeRole } from '../src/lib/roles.ts';

test('role labels normalize at the authentication boundary to the six canonical roles', () => {
  assert.equal(normalizeRole('Super Admin'), 'super_admin');
  assert.equal(normalizeRole('school-administrator'), 'school_admin');
  assert.equal(normalizeRole('Accountant'), 'accountant');
  assert.equal(normalizeRole('teacher'), 'teacher');
  assert.equal(normalizeRole('Guardian'), 'parent');
  assert.equal(normalizeRole('Pupil'), 'student');
  assert.equal(normalizeRole('unknown'), null);
});
