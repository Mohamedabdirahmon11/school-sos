import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { NAVIGATION_REGISTRY, getNavigationRoute } from '../src/lib/navigation-registry.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const routeIds = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map(match => match[1]);

test('navigation registry defines each route once with a display name, icon and role', () => {
  const routes = NAVIGATION_REGISTRY.map(item => item.route);
  assert.equal(new Set(routes).size, routes.length, 'navigation routes must be unique');
  for (const item of NAVIGATION_REGISTRY) {
    assert.ok(item.name.trim(), `route ${item.route} needs a name`);
    assert.ok(item.icon, `route ${item.route} needs an icon`);
    assert.ok(item.roles.length > 0, `route ${item.route} needs an allowed role`);
  }
});

test('Sidebar and MobileBottomNav only reference registered routes', () => {
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  const mobile = read('../src/components/layout/MobileBottomNav.tsx');
  const used = [
    ...routeIds(sidebar, /item\\('([^']+)'/g),
    ...routeIds(mobile, /quickTab\\('([^']+)'/g)
  ];
  for (const route of new Set(used)) {
    assert.ok(getNavigationRoute(route), `navigation route ${route} is missing from the shared registry`);
  }
});

test('every registered route has an App route handler or an explicit portal prefix handler', () => {
  const app = read('../src/App.tsx');
  for (const item of NAVIGATION_REGISTRY) {
    const portalHandled = ['t_', 'p_', 'st_'].some(prefix =>
      item.route.startsWith(prefix) && app.includes(`startsWith('${prefix}')`)
    );
    assert.ok(app.includes(`'${item.route}'`) || portalHandled,
      `registered route ${item.route} has no App route handler`);
  }
});
