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


test('new school administrator temporary PINs are hashed and changed on first sign-in', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const schoolsSource = readFileSync(new URL('../src/components/superadmin/SchoolsView.tsx', import.meta.url), 'utf8');
  assert.match(apiSource, /const temporaryPin = String\(adminPin\)/);
  assert.match(apiSource, /adminPin \(required: use a 4–6 digit PIN\)/);
  assert.match(apiSource, /const cleanSchoolId = String\(schoolId\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(schoolsSource, /School ID \*/);
  assert.match(schoolsSource, /School Admin PIN \*/);
  assert.match(schoolsSource, /type="text" required inputMode="numeric"/);
  assert.match(apiSource, /passwordHash: hashPassword\(temporaryPin\)/);
  assert.match(apiSource, /adminUsername: adminUser\.staffId/);
  assert.match(apiSource, /mustChangePassword: Boolean\(adminUser\.mustChangePassword\)/);
  assert.doesNotMatch(apiSource, /passwordHash: adminPassword/);
  assert.match(schoolsSource, /res\.temporaryPin/);
  assert.match(schoolsSource, /addAdminPin/);
  assert.match(apiSource, /use a 4–6 digit PIN/);
  const resetStart = apiSource.indexOf("apiRouter.post('/users/:id/reset-password'");
  const resetEnd = apiSource.indexOf('const createSuperAdminSchema', resetStart);
  const resetRoute = apiSource.slice(resetStart, resetEnd);
  assert.match(resetRoute, /targetUser\.role === 'school_admin'/);
  assert.match(resetRoute, /Only Super Admin can reset a School Admin PIN/);
  assert.match(resetRoute, /temporaryPin/);
  assert.match(schoolsSource, /ApiClient\.resetUserPassword\(adminId, temporaryPin\.trim\(\)\)/);
});


test('Super Admin, School Admin, and Accountant share one staff login and resolve dashboard role from the account', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /const sharedAdminLogin = requestedRole === 'school_admin'\s*&& \(normalizedRole === 'super_admin' \|\| normalizedRole === 'school_admin' \|\| normalizedRole === 'accountant'\)/);
  assert.doesNotMatch(apiSource, /const sharedAdminLogin[\s\S]{0,180}identifier\.includes\('@'\)/);
  const loginSource = readFileSync(new URL('../src/components/auth/LoginView.tsx', import.meta.url), 'utf8');
  assert.match(loginSource, /Super Admin, School Admin, and Accountant use this same sign-in/);
});


test('Super Admin cannot block their own account or the last active Super Admin', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const routeStart = apiSource.indexOf("apiRouter.post('/users/:id/toggle-block'");
  const routeEnd = apiSource.indexOf('// Batch Invoices Generation (Super Admin)', routeStart);
  const route = apiSource.slice(routeStart, routeEnd);
  assert.match(route, /if \(newStatus && targetUser\.role === 'super_admin'\)/);
  assert.match(route, /targetUser\.id === actor\.id/);
  assert.match(route, /You cannot block your own Super Admin account\./);
  assert.match(route, /db\.getUsers\(undefined, 'super_admin'\)/);
  assert.match(route, /otherActiveSuperAdmins\.length === 0/);
  assert.match(route, /At least one active Super Admin must remain\./);
});


test('backup Super Admin creation is protected, audited, persisted, and requires a password change', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const storageSource = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const uiSource = readFileSync(new URL('../src/components/superadmin/GlobalUsersView.tsx', import.meta.url), 'utf8');
  const panelSource = readFileSync(new URL('../src/components/superadmin/CreateSuperAdminPanel.tsx', import.meta.url), 'utf8');
  const routeStart = apiSource.indexOf("apiRouter.post('/superadmin/admins'");
  const routeEnd = apiSource.indexOf("apiRouter.post('/users/:id/toggle-block'", routeStart);
  const route = apiSource.slice(routeStart, routeEnd);
  assert.match(route, /requireAuth, requireSuperAdmin/);
  assert.match(route, /db\.findUserForLogin\(email\)/);
  assert.match(route, /randomBytes\(12\)/);
  assert.match(route, /passwordHash: temporaryPassword/);
  assert.match(route, /mustChangePassword: true/);
  assert.match(route, /action: 'SUPER_ADMIN_CREATED'/);
  assert.match(route, /await db\.flush\(\)/);
  assert.match(storageSource, /if \(passwordHash && !passwordHash\.startsWith\('scrypt:'\)\)\s*\{\s*passwordHash = hashPassword\(passwordHash\)/);
  assert.match(uiSource, /<CreateSuperAdminPanel \/>/);
  assert.match(panelSource, /result\.temporaryPassword/);
  assert.match(panelSource, /Hide temporary password/);
});


test('password changes and Super Admin resets synchronize linked Supabase Auth credentials', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const helperStart = apiSource.indexOf('async function syncLinkedSupabaseAuthCredentials');
  const helperEnd = apiSource.indexOf("apiRouter.post('/auth/login'", helperStart);
  const helper = apiSource.slice(helperStart, helperEnd);
  assert.match(helper, /user\.authUserId/);
  assert.match(helper, /auth\.admin\.updateUserById\(authUserId, attributes\)/);
  assert.match(helper, /attributes\.email = updates\.email/);
  assert.match(helper, /attributes\.email_confirm = true/);

  const changeStart = apiSource.indexOf("apiRouter.post('/auth/change-password'");
  const changeEnd = apiSource.indexOf('// Current User Profile', changeStart);
  const changeRoute = apiSource.slice(changeStart, changeEnd);
  assert.match(changeRoute, /syncLinkedSupabaseAuthCredentials\(user, \{ password: newPassword \}\)/);
  assert.match(changeRoute, /mustChangePassword: false/);

  const resetStart = apiSource.indexOf("apiRouter.post('/users/:id/reset-password'");
  const resetEnd = apiSource.indexOf('const createSuperAdminSchema', resetStart);
  const resetRoute = apiSource.slice(resetStart, resetEnd);
  assert.match(resetRoute, /randomBytes\(12\)/);
  assert.match(resetRoute, /syncLinkedSupabaseAuthCredentials\(targetUser, \{ password: temporaryPassword \}\)/);
  assert.match(resetRoute, /mustChangePassword: true/);

  const profileStart = apiSource.indexOf("apiRouter.put('/auth/profile'");
  const profileEnd = apiSource.indexOf("apiRouter.get('/superadmin/sessions'", profileStart);
  const profileRoute = apiSource.slice(profileStart, profileEnd);
  assert.match(profileRoute, /syncLinkedSupabaseAuthCredentials\(user, \{/);
  assert.match(profileRoute, /email: cleanEmail/);
  assert.match(profileRoute, /await db\.flush\(\)/);
});


test('profile password input enforces the same eight-character minimum as the backend', () => {
  const profileSource = readFileSync(new URL('../src/components/common/ProfileModal.tsx', import.meta.url), 'utf8');
  const securitySource = readFileSync(new URL('../src/server/auth-security.ts', import.meta.url), 'utf8');
  assert.match(profileSource, /minLength=\{8\}/);
  assert.match(profileSource, /New password \(min 8 characters\)/);
  assert.match(securitySource, /password\.length < 8/);
});
