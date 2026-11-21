import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { STAFF_PERMISSION_REGISTRY, staffHasPermission } from '../src/lib/staff-permissions.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('staff permission registry is the single source for every supported work area', () => {
  const ids = STAFF_PERMISSION_REGISTRY.map(permission => permission.id);
  assert.equal(new Set(ids).size, ids.length, 'permission IDs must be unique');
  assert.deepEqual(ids, [
    'fees_manage',
    'admissions_manage',
    'attendance_manage',
    'grades_manage',
    'library_manage',
    'transport_manage',
    'inventory_manage',
    'reports_export',
    'payroll_manage'
  ]);
});

test('staff access editor and sidebar consume the shared permission registry and type', () => {
  const editor = read('../src/components/schooladmin/StaffAccessView.tsx');
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  assert.match(editor, /import \{ STAFF_PERMISSION_REGISTRY \} from '..\/..\/lib\/staff-permissions\.ts'/);
  assert.match(editor, /const AVAILABLE_PERMISSIONS = STAFF_PERMISSION_REGISTRY/);
  assert.match(sidebar, /type StaffPermission/);
  assert.match(sidebar, /permission\?: StaffPermission/);
  assert.doesNotMatch(sidebar, /permission\?: 'fees_manage'/);
});

test('backend staff authorization still requires active status and an explicit registry permission', () => {
  assert.equal(staffHasPermission({ status: 'active', permissions: ['fees_manage'] }, 'fees_manage'), true);
  assert.equal(staffHasPermission({ status: 'inactive', permissions: ['fees_manage'] }, 'fees_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: [] }, 'fees_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: 'fees_manage' }, 'fees_manage'), false);
});
