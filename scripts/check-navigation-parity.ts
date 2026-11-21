import fs from 'node:fs';
import { NAVIGATION_REGISTRY } from '../src/lib/navigation-registry.ts';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');
const mobile = read('src/components/layout/MobileBottomNav.tsx');
const ids = NAVIGATION_REGISTRY.map(route => route.id);
const errors: string[] = [];

if (new Set(ids).size !== ids.length) errors.push('Duplicate route IDs exist in NAVIGATION_REGISTRY.');
for (const route of NAVIGATION_REGISTRY) {
  if (!route.label.trim()) errors.push(`Route ${route.id} has no label.`);
  if (!route.roles.length) errors.push(`Route ${route.id} has no allowed roles.`);
  if (typeof route.icon !== 'function') errors.push(`Route ${route.id} has no icon component.`);
  const rolePrefixRoute = /^(t_|p_|st_)/.test(route.id);
  if (!app.includes(`'${route.id}'`) && !rolePrefixRoute) {
    errors.push(`Route ${route.id} is registered but not explicitly referenced by App routing.`);
  }
}
const sidebarIds = [...sidebar.matchAll(/item\(\s*'([a-z][a-z0-9_]+)'/g)].map(match => match[1]);
for (const id of new Set(sidebarIds)) if (!ids.includes(id)) errors.push(`Sidebar route ${id} is missing from NAVIGATION_REGISTRY.`);
if (!sidebar.includes('getNavigationRoute') || !sidebar.includes('route.roles.includes')) {
  errors.push('Sidebar is not consuming registry route metadata and role policy.');
}
if (!mobile.includes('getMobileNavigation') || !mobile.includes('route.icon')) {
  errors.push('MobileBottomNav is not consuming registry routes and icons.');
}
if (!app.includes('getNavigationRoute(view)')) errors.push('App does not validate requested views against NAVIGATION_REGISTRY.');

console.log(`Navigation registry: ${ids.length} routes; Sidebar: ${new Set(sidebarIds).size} entries; errors: ${errors.length}`);
for (const error of errors) console.error(`ERROR ${error}`);
if (errors.length) process.exitCode = 1;
