import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const client = read('../src/services/api.ts');
const view = read('../src/components/schooladmin/ParentsView.tsx');

test('parent contacts are derived from active students scoped to the current school and optional class', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.match(route, /requireSchoolAdminOrSuperAdmin, requireSchoolContext/);
  assert.match(route, /school_id: school\.id/);
  assert.match(route, /status: 'active'/);
  assert.match(route, /class_id: classId/);
});

test('guardian phone numbers are normalized and deduplicated per school', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.match(route, /phone\.replace\(\/\\D\/g, ''\)/);
  assert.match(route, /contacts\.get\(normalizedPhone\)/);
  assert.match(route, /contacts\.set\(normalizedPhone, contact\)/);
  assert.match(route, /contact\.students\.some\(item => item\.id === child\.id\)/);
});

test('unique contacts are searched, sorted, and paginated after deduplication', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.match(route, /\.filter\(contact => !query/);
  assert.match(route, /\.sort\(\(a, b\) => a\.phone\.localeCompare/);
  assert.match(route, /const total = filtered\.length/);
  assert.match(route, /filtered\.slice\(\(page - 1\) \* pageSize, page \* pageSize\)/);
});

test('Parents directory uses the unique contacts endpoint and exposes class All filter', () => {
  assert.match(client, /getParentContacts\(/);
  assert.match(client, /\/parents\/contacts\?/);
  assert.match(view, /ApiClient\.getParentContacts\(\{ page, pageSize: 50, search, classId: classFilter \}\)/);
  assert.match(view, /<option value="">All classes<\/option>/);
  assert.match(view, /contact\.students\.map/);
});
