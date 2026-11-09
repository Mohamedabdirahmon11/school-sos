import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isSessionExpiryValid, passwordPolicyError } from '../src/server/auth-security.ts';

test('session expiry accepts only a valid future ISO timestamp', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  assert.equal(isSessionExpiryValid('2026-11-03T12:01:00.000Z', now), true);
  assert.equal(isSessionExpiryValid('2026-11-03T11:59:59.999Z', now), false);
});

test('session expiry fails closed for malformed or missing database timestamps', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  for (const value of [null, undefined, '', 'not-a-date', 'NaN', 0, {}, []]) {
    assert.equal(isSessionExpiryValid(value, now), false, `rejected ${String(value)}`);
  }
});

test('Super Admin routes require an authenticated Super Admin', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const routePattern = /apiRouter\.(get|post|put|patch|delete)\(\s*'([^']+)'([\s\S]{0,260}?)=>/gi;
  const routes = [...apiSource.matchAll(routePattern)];
  const publicRoutes = routes
    .filter(match => !match[3].includes('requireAuth'))
    .map(match => `${match[1].toUpperCase()} ${match[2]}`)
    .sort();
  assert.deepEqual(publicRoutes, ['POST /auth/login', 'POST /auth/logout']);
  const superAdminRoutes = routes.filter(match => match[2].startsWith('/superadmin/'));
  assert.ok(superAdminRoutes.length > 0, 'Super Admin route list is discoverable');
  for (const route of superAdminRoutes) {
    assert.match(route[3], /requireAuth/, `${route[1].toUpperCase()} ${route[2]} requires authentication`);
    assert.match(route[3], /requireSuperAdmin/, `${route[1].toUpperCase()} ${route[2]} requires Super Admin role`);
  }
});

test('password policy requires 8 characters, mixed case, and a number', () => {
  assert.equal(passwordPolicyError('Abcdef12'), null);
  assert.match(passwordPolicyError('Short1A') || '', /8 characters/);
  assert.match(passwordPolicyError('alllowercase123') || '', /uppercase and lowercase/);
  assert.match(passwordPolicyError('ALLUPPERCASE123') || '', /uppercase and lowercase/);
  assert.match(passwordPolicyError('NoDigitsAtAllAA') || '', /at least one number/);
  assert.match(passwordPolicyError('Abcdefghij123'.repeat(10)) || '', /128 characters/);
  assert.match(passwordPolicyError(undefined) || '', /8 characters/);
});


test('new school administrator temporary passwords are hashed and changed on first sign-in', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const schoolsSource = readFileSync(new URL('../src/components/superadmin/SchoolsView.tsx', import.meta.url), 'utf8');
  assert.match(apiSource, /const temporaryPassword = String\(randomInt\(100000, 1_000_000\)\)/);
  assert.match(apiSource, /passwordHash: hashPassword\(temporaryPassword\)/);
  assert.match(apiSource, /admin: sanitizeUser\(adminUser\), temporaryPassword, mustChangePassword: true/);
  assert.doesNotMatch(apiSource, /passwordHash: adminPassword/);
  assert.match(schoolsSource, /res\.temporaryPassword/);
  assert.doesNotMatch(schoolsSource, /addAdminPass/);
});
