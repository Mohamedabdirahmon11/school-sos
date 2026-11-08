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


test('users update RLS policy prevents authenticated self-promotion', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261108090000_fix_auth_user_update_rls_and_fk_indexes.sql', import.meta.url), 'utf8');
  assert.match(migration, /DROP POLICY IF EXISTS users_update_scope/i);
  assert.match(migration, /USING \(\(private\.auth_user_role\(\)\)::text = 'super_admin'\)/i);
  assert.match(migration, /WITH CHECK \(\(private\.auth_user_role\(\)\)::text = 'super_admin'\)/i);
  assert.doesNotMatch(migration, /id::text = private\.auth_user_id\(\)/i);
  assert.doesNotMatch(migration, /GRANT UPDATE ON public\.users TO authenticated/i);
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
  assert.match(storageSource, /user\.role === 'accountant' \|\| user\.role === 'teacher'/);
  assert.match(storageSource, /isActiveStaffLoginAccount\(direct\)/);
  assert.match(storageSource, /record\.status !== 'active'/);
  assert.match(storageSource, /queryRows<Teacher>\('teachers', \{ school_id: user\.schoolId, user_id: user\.id \}\)/);
  assert.match(storageSource, /teacherProfiles\.length !== 1 \|\| teacherProfiles\[0\]\.status !== 'active'/);
  assert.match(storageSource, /!\['teacher', 'accountant'\]\.includes\(account\.role\)/);
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


test('teacher login UI clearly requests the school-issued Teacher ID', () => {
  const loginSource = readFileSync(new URL('../src/components/auth/LoginView.tsx', import.meta.url), 'utf8');
  assert.match(loginSource, /activeTab === 'teacher' \? 'Teacher ID' : 'Email or phone'/);
  assert.match(loginSource, /Enter the Teacher ID provided by your School Admin/);
});


test('teacher accounts cannot bypass Teacher ID login by omitting the requested role', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /normalizedRole === 'teacher' && normalizeStaffId\(storedUser\.staffId\) !== normalizeStaffId\(identifier\)/);
});


test('existing teacher sessions are rejected when the linked teacher profile is inactive or missing', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /if \(user\.role === 'teacher'\)[\s\S]*teacherProfiles\.items\.length !== 1 \|\| teacherProfiles\.items\[0\]\.status !== 'active'/);
});


test('first-login password form mirrors the backend password policy', () => {
  const modalSource = readFileSync(new URL('../src/components/auth/ForcePasswordChangeModal.tsx', import.meta.url), 'utf8');
  assert.match(modalSource, /password\.length < 12 \|\| password\.length > 128/);
  assert.match(modalSource, /minLength=\{12\} maxLength=\{128\}/);
  assert.match(modalSource, /uppercase, lowercase, and a number/);
});


test('bootstrap password form mirrors the backend password policy', () => {
  const loginSource = readFileSync(new URL('../src/components/auth/LoginView.tsx', import.meta.url), 'utf8');
  assert.match(loginSource, /newAdminPassword\.length < 12 \|\| newAdminPassword\.length > 128/);
  assert.match(loginSource, /minLength=\{12\} maxLength=\{128\}/);
  assert.match(loginSource, /uppercase, lowercase, and a number/);
});


test('profile password form mirrors policy and lets teachers verify their current PIN', () => {
  const profileSource = readFileSync(new URL('../src/components/common/ProfileModal.tsx', import.meta.url), 'utf8');
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(profileSource, /newPassword\.length < 12 \|\| newPassword\.length > 128/);
  assert.equal((profileSource.match(/minLength=\{12\} maxLength=\{128\}/g) || []).length, 2);
  assert.match(profileSource, /Current password or PIN/);
  assert.match(apiSource, /user\.role === 'teacher'[\s\S]*verifyPin\(currentPassword, String\(user\.pin \|\| ''\)\)/);
});


test('PIN-only parent and student accounts cannot enter the password-change flow', () => {
  const profileSource = readFileSync(new URL('../src/components/common/ProfileModal.tsx', import.meta.url), 'utf8');
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(profileSource, /Parent and student accounts sign in with a PIN/);
  assert.match(apiSource, /if \(\['parent', 'student'\]\.includes\(user\.role\)\)[\s\S]*Parent and student accounts use PIN sign-in/);
});


test('force-password endpoint only accepts accounts flagged for a required password change', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /if \(!user\.mustChangePassword\)[\s\S]*Use your profile settings to change an existing password/);
});


test('teacher legacy assignments are resolved only against the authenticated school', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /assigned_classes/);
  assert.match(apiSource, /assigned_subjects/);
  assert.match(apiSource, /school_id: school\.id, id: legacySubjectIds/);
  assert.match(apiSource, /school_id: school\.id, id: legacyClassIds, is_archived: 'false'/);
  assert.match(apiSource, /legacy-\$\{teacher\.id\}-\$\{klass\.id\}-\$\{subject\.id\}/);
});


test('users UPDATE RLS does not retain the older permissive non-parent policy', () => {
  const migrationSource = readFileSync(new URL('../supabase/migrations/20261108090000_fix_auth_user_update_rls_and_fk_indexes.sql', import.meta.url), 'utf8');
  assert.match(migrationSource, /DROP POLICY IF EXISTS parent_student_block_update ON public\.users/);
  assert.match(migrationSource, /CREATE POLICY users_update_scope[\s\S]*private\.auth_user_role\(\).*super_admin/);
});


test('bulk academic year routes require Super Admin authorization and explicit confirmation', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /apiRouter\.post\('\/superadmin\/academic-year\/preview', requireAuth, requireSuperAdmin/);
  assert.match(apiSource, /apiRouter\.post\('\/superadmin\/academic-year\/apply', requireAuth, requireSuperAdmin/);
  assert.match(apiSource, /parsed\.data\.confirm !== 'CONFIRM'/);
  assert.match(apiSource, /if \(!updated\)[\s\S]*School no longer exists/);
  assert.match(apiSource, /await db\.flush\(\);[\s\S]*res\.json\(\{ academicYear: targetYear, applied, skipped \}\)/);
});
