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

import { staffHasPermission } from '../src/lib/staff-permissions.ts';

test('staff permissions require an active staff record and an explicit grant', () => {
  assert.equal(staffHasPermission({ status: 'active', permissions: ['library_manage'] }, 'library_manage'), true);
  assert.equal(staffHasPermission({ status: 'inactive', permissions: ['library_manage'] }, 'library_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: ['fees_manage'] }, 'library_manage'), false);
  assert.equal(staffHasPermission(null, 'library_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: 'library_manage' }, 'library_manage'), false);
});
