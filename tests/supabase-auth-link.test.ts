import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const storage = read('../src/server/storage.ts');
const types = read('../src/types/index.ts');
const authSecurity = read('../src/server/auth-security.ts');

const helperStart = api.indexOf('async function linkLegacyLoginToSupabaseAuth');
const helperEnd = api.indexOf("apiRouter.post('/auth/login'", helperStart);
const helper = api.slice(helperStart, helperEnd);

test('legacy account migration requires a verified stored password', () => {
  const routeStart = api.indexOf("apiRouter.post('/auth/login'");
  const routeEnd = api.indexOf("apiRouter.post('/auth/logout'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  const staffStart = route.indexOf('// B. SUPER ADMIN, SCHOOL ADMIN, TEACHER, ACCOUNTANT');
  const staffRoute = route.slice(staffStart);
  const failedPassword = staffRoute.indexOf('if (!isPasswordValid)');
  const migration = staffRoute.indexOf('linkLegacyLoginToSupabaseAuth(user, password)');
  const session = staffRoute.indexOf('await issueSessionCookie(res, user, req)');
  assert.ok(failedPassword >= 0 && migration > failedPassword && session > migration);
  assert.ok(staffRoute.includes('verifiedLegacyPassword = verifyPassword(legacyCredential, user.passwordHash)'));
  assert.ok(staffRoute.includes("if (!authUserId && verifiedLegacyPassword && ['super_admin', 'school_admin', 'accountant'].includes(user.role))"));
  assert.ok(staffRoute.includes("['school_admin', 'teacher'].includes(user.role) && verifyPin"));
  assert.equal(staffRoute.slice(migration - 100, migration + 160).includes('verifyPin'), false);
});

test('migration creates a new Auth identity and keeps the SchoolOS row link consistent', () => {
  assert.ok(helper.includes("!['super_admin', 'school_admin', 'accountant'].includes(user.role)"));
  assert.ok(helper.includes('auth.admin.createUser'));
  assert.ok(helper.includes('email_confirm: true'));
  assert.ok(helper.includes(".is('auth_user_id', null)"));
  assert.ok(helper.includes('auth.admin.deleteUser(authUserId)'));
  assert.ok(helper.includes('db.updateUser(user.id, { authUserId })'));
  assert.ok(helper.includes('if (!linkedToSchoolOSUser)'));
  assert.ok(helper.includes('try { await db.flush(); } catch'));
  assert.equal(helper.includes('auth.admin.updateUserById'), false);
  assert.equal(/console\.(log|error).*password/i.test(helper), false);
});

test('teachers always keep school-issued Teacher ID and PIN authentication', () => {
  const routeStart = api.indexOf("apiRouter.post('/auth/login'");
  const routeEnd = api.indexOf("apiRouter.post('/auth/logout'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.ok(route.includes("['super_admin', 'school_admin', 'accountant'].includes(user.role)"));
  assert.ok(route.includes("user.role === 'teacher' && verifyPin"));
});

test('student and parent PIN login remains separate from Supabase Auth migration', () => {
  const routeStart = api.indexOf("apiRouter.post('/auth/login'");
  const routeEnd = api.indexOf('// B. SUPER ADMIN, SCHOOL ADMIN, TEACHER, ACCOUNTANT', routeStart);
  const studentRoute = api.slice(routeStart, routeEnd);
  assert.ok(studentRoute.includes('STUDENT & PARENT LOGIN'));
  assert.ok(studentRoute.includes('verifyPin('));
  assert.equal(studentRoute.includes('linkLegacyLoginToSupabaseAuth'), false);
  assert.ok(helper.includes('!user.email'));
});

test('Supabase Auth identity is mapped to the stable SchoolOS user ID and hidden from clients', () => {
  assert.ok(storage.includes("users: { authUserId: 'auth_user_id'"));
  assert.ok(storage.includes("const userColumns = 'id,auth_user_id,"));
  assert.ok(types.includes('authUserId?: string'));
  assert.ok(authSecurity.includes('delete copy.authUserId'));
});

test('Auth migration preserves stable SchoolOS IDs and only backfills exact UUID matches', () => {
  const migration = read('../supabase/migrations/20261108072315_link_schoolos_users_to_supabase_auth.sql');
  assert.ok(migration.includes('REFERENCES auth.users(id)'));
  assert.ok(migration.includes('WHERE u.id = a.id::text'));
  assert.equal(/UPDATE public\.users[\s\S]{0,250}SET id =/.test(migration), false);
});
