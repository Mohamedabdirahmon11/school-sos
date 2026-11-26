import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAVIGATION_REGISTRY, getMobileNavigation, getNavigationRoute } from '../src/lib/navigation-registry.ts';

test('navigation registry contains unique routes with labels, icons and role policies', () => {
  const ids = NAVIGATION_REGISTRY.map(route => route.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const route of NAVIGATION_REGISTRY) {
    assert.ok(route.label.trim(), route.id);
    assert.ok(route.roles.length, route.id);
    assert.ok(route.icon, route.id);
  }
});

test('role quick navigation is a filtered projection of the shared registry', () => {
  for (const role of ['super_admin', 'school_admin', 'accountant', 'teacher', 'parent', 'student'] as const) {
    for (const route of getMobileNavigation(role)) {
      assert.ok(route.mobile);
      assert.ok(route.roles.includes(role));
      assert.equal(getNavigationRoute(route.id), route);
    }
  }
});

test('mobile quick links preserve role-specific shortcuts without exposing school admin fees', () => {
  const schoolAdminIds = getMobileNavigation('school_admin').map(route => route.id);
  const accountantIds = getMobileNavigation('accountant').map(route => route.id);
  assert.ok(schoolAdminIds.includes('sch_attendance'));
  assert.ok(!schoolAdminIds.includes('sch_fees'));
  assert.ok(accountantIds.includes('sch_fees'));
});

test('registry metadata has no duplicate route keys and role routes remain scoped', () => {
  assert.equal(getNavigationRoute('not-a-route'), undefined);
  assert.ok(getNavigationRoute('sa_dashboard')?.roles.includes('super_admin'));
  assert.ok(getNavigationRoute('t_dashboard')?.roles.includes('teacher'));
  assert.ok(getNavigationRoute('p_overview')?.roles.includes('parent'));
  assert.ok(getNavigationRoute('st_dashboard')?.roles.includes('student'));
});


test('Parents & Contacts navigation is available to Form Teachers as well as school admins', () => {
  const route = NAVIGATION_REGISTRY.find(item => item.id === 'sch_parents');
  assert.ok(route);
  assert.deepEqual(route.roles, ['school_admin', 'super_admin', 'teacher']);
});

test('School Admin mobile navigation presents exactly five quick actions; the header Menu remains separate', () => {
  assert.deepEqual(getMobileNavigation('school_admin').map(route => route.id), [
    'sch_dashboard', 'sch_students', 'sch_teachers', 'sch_attendance', 'sch_classes'
  ]);
});
