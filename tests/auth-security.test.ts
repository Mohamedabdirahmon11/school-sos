import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isSessionExpiryValid, passwordPolicyError, sanitizeUser } from '../src/server/auth-security.ts';
import { mapStorageRowToDatabase } from '../src/server/storage.ts';

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
  assert.deepEqual(publicRoutes, ['POST /auth/forgot-password', 'POST /auth/login', 'POST /auth/logout', 'POST /auth/reset-password']);
  const superAdminRoutes = routes.filter(match => match[2].startsWith('/superadmin/'));
  assert.ok(superAdminRoutes.length > 0, 'Super Admin route list is discoverable');
  for (const route of superAdminRoutes) {
    assert.match(route[3], /requireAuth/, `${route[1].toUpperCase()} ${route[2]} requires authentication`);
    assert.match(route[3], /requireSuperAdmin/, `${route[1].toUpperCase()} ${route[2]} requires Super Admin role`);
  }
});

test('password policy requires 12 characters, mixed case, and a number', () => {
  assert.equal(passwordPolicyError('Abcdefghij12'), null);
  assert.match(passwordPolicyError('Short1A') || '', /12 characters/);
  assert.match(passwordPolicyError('alllowercase123') || '', /uppercase and lowercase/);
  assert.match(passwordPolicyError('ALLUPPERCASE123') || '', /uppercase and lowercase/);
  assert.match(passwordPolicyError('NoDigitsAtAllAA') || '', /at least one number/);
  assert.match(passwordPolicyError('Abcdefghij123'.repeat(10)) || '', /128 characters/);
  assert.match(passwordPolicyError(undefined) || '', /12 characters/);
});

test('Supabase Auth UUID mapping is persisted and loaded with SchoolOS sessions', () => {
  const authUserId = '69607ab2-57ae-4a99-b348-aec1465bdb26';
  assert.deepEqual(
    mapStorageRowToDatabase('users', { id: 'schoolos-user-1', authUserId }),
    { id: 'schoolos-user-1', auth_user_id: authUserId }
  );
  const storageSource = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storageSource, /const userColumns = 'id,auth_user_id,/);
});

test('public user responses never expose the linked Supabase Auth UUID', () => {
  const safeUser = sanitizeUser({
    id: 'schoolos-user-1',
    role: 'school_admin',
    authUserId: '69607ab2-57ae-4a99-b348-aec1465bdb26',
    passwordHash: 'scrypt:private',
    pin: 'pin_scrypt:private'
  });
  assert.equal(safeUser.authUserId, undefined);
  assert.equal(safeUser.passwordHash, undefined);
  assert.equal(safeUser.pin, undefined);
});

test('Supabase Auth mapping migration preserves SchoolOS IDs and only links exact UUID matches', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261108072315_link_schoolos_users_to_supabase_auth.sql', import.meta.url), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS auth_user_id uuid/i);
  assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE SET NULL/i);
  assert.match(migration, /WHERE u\.id = a\.id::text/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uidx/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE TABLE/i);
});
