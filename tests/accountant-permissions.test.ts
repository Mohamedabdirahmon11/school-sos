import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { hasStaffNavigationPermission, staffHasPermission } from '../src/lib/staff-permissions.ts';

test('accountant navigation only exposes views granted to the staff account', () => {
  const permissions = ['fees_manage', 'library_manage', 'transport_manage'];
  assert.equal(hasStaffNavigationPermission(permissions, 'fees_manage'), true);
  assert.equal(hasStaffNavigationPermission(permissions, 'payroll_manage'), false);
  assert.equal(hasStaffNavigationPermission(permissions, 'reports_export'), false);
  assert.equal(hasStaffNavigationPermission(undefined, 'fees_manage'), false);
  assert.equal(hasStaffNavigationPermission('fees_manage', 'fees_manage'), false);
});

test('server permission check requires an active staff record and explicit permission', () => {
  assert.equal(staffHasPermission({ status: 'active', permissions: ['payroll_manage'] }, 'payroll_manage'), true);
  assert.equal(staffHasPermission({ status: 'inactive', permissions: ['payroll_manage'] }, 'payroll_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: ['fees_manage'] }, 'payroll_manage'), false);
});

test('accountant session hydrates permissions from the active school staff record', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(api, /user\.role === 'accountant' && school \? await getStaffForRequest/);
  assert.match(api, /staff\?\.status === 'active'[\s\S]*?staff\.permissions/);
  assert.match(api, /sanitizeUser\(sessionUser\)/);
  assert.match(api, /accountantStaff\?\.status === 'active'[\\s\\S]*?sanitizeUser\(sessionUser\)/);
});
