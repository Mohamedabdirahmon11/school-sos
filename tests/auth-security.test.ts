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
  assert.match(migration, /REFERENCES auth\.users\(id\)[\s\S]*?ON DELETE SET NULL/i);
  assert.match(migration, /WHERE u\.id = a\.id::text/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uidx/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE TABLE/i);
});

test('all password and email update paths synchronize linked Supabase Auth accounts', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const resetSource = readFileSync(new URL('../src/server/password-reset-service.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /updateSupabaseAuthPassword\(targetUser\.authUserId, temporaryPassword\)/);
  assert.match(apiSource, /updateSupabaseAuthEmail\(user\.authUserId/);
  assert.match(resetSource, /supabase\.auth\.admin\.updateUserById\(user\.authUserId, \{ password: newPassword \}\)/);
});

test('password changes version signed sessions and revoke old SchoolOS sessions', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /passwordChangedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(apiSource, /async function revokeUserSessions\(userId: string/);
  assert.match(apiSource, /await revokeUserSessions\(user\.id, user\.schoolId\)/);
  assert.match(apiSource, /await revokeUserSessions\(targetUser\.id, targetUser\.schoolId\)/);
});


test('Auth-linked users update their own SchoolOS profile through the stable auth mapping', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261108090000_fix_auth_user_update_rls_and_fk_indexes.sql', import.meta.url), 'utf8');
  assert.match(migration, /DROP POLICY IF EXISTS users_update_scope/i);
  assert.match(migration, /id::text = private\.auth_user_id\(\)/i);
  assert.match(migration, /WITH CHECK[\s\S]*private\.auth_user_id\(\)/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.users/i);
});

test('missing composite foreign-key indexes are added without dropping existing indexes', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261108090000_fix_auth_user_update_rls_and_fk_indexes.sql', import.meta.url), 'utf8');
  for (const indexName of [
    'idx_exam_schedules_class_school_fk',
    'idx_exam_schedules_subject_school_fk',
    'idx_exam_seats_schedule_school_fk',
    'idx_exam_seats_student_school_fk',
    'idx_school_health_visits_recorded_by_fk'
  ]) assert.match(migration, new RegExp('CREATE INDEX IF NOT EXISTS ' + indexName));
  assert.doesNotMatch(migration, /DROP INDEX/i);
});

test('Teacher ID lookup resolves linked active teacher staff records and rejects inactive staff', () => {
  const storageSource = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storageSource, /direct\.role === 'accountant' \|\| direct\.role === 'teacher'/);
  assert.match(storageSource, /record\.status !== 'active'/);
  assert.match(storageSource, /account\.role === 'accountant' \|\| account\.role === 'teacher'/);
  assert.match(storageSource, /account\.role === 'teacher' \|\| account\.role === 'accountant'/);
  assert.match(storageSource, /staffId: account\.staffId \|\| staff\.staffId/);
});


test('existing Supabase Auth identities require an exact SchoolOS metadata mapping before linking', () => {
  const authSource = readFileSync(new URL('../src/server/supabase-auth.ts', import.meta.url), 'utf8');
  assert.match(authSource, /app_metadata: \{ schoolos_user_id: user\.id, schoolos_role: user\.role \}/);
  assert.match(authSource, /candidate\.app_metadata\?\.schoolos_user_id === user\.id/);
  assert.match(authSource, /candidate\.email\?\.toLowerCase\(\) === email/);
  assert.match(authSource, /admin\.updateUserById\(authUserId, \{/);
  assert.match(authSource, /app_metadata: \{[\s\S]*schoolos_user_id: user\.id/);
  assert.doesNotMatch(authSource, /signInWithPassword\(\{ email, password: authPassword \}\);\s*if \(existingAuth\.error/);
});
