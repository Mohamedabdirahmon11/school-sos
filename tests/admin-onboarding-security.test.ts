import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const schoolsView = readFileSync(new URL('../src/components/superadmin/SchoolsView.tsx', import.meta.url), 'utf8');

test('new school administrator receives a one-time temporary password stored as a hash', () => {
  assert.match(api, /const temporaryPassword = String\(randomInt\(100000, 1_000_000\)\)/);
  assert.match(api, /passwordHash: hashPassword\(temporaryPassword\)/);
  assert.match(api, /admin: sanitizeUser\(adminUser\), temporaryPassword, mustChangePassword: true/);
  assert.doesNotMatch(api, /passwordHash: adminPassword/);
  assert.match(schoolsView, /res\.temporaryPassword/);
  assert.doesNotMatch(schoolsView, /addAdminPass/);
});

test('first-login staff passwords are forced to change and are easy to type temporarily', () => {
  assert.match(api, /mustChangePassword: true/);
  assert.match(api, /const temporaryPassword = String\(randomInt\(100000, 1_000_000\)\)/);
  assert.match(api, /passwordHash: hashPassword\(temporaryPassword\)/);
});
