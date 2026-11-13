import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const storage = read('../src/server/storage.ts');
const types = read('../src/types/index.ts');
const authSecurity = read('../src/server/auth-security.ts');

test('legacy account migration requires a verified password and never uses the teacher PIN fallback', () => {
  const routeStart = api.indexOf("apiRouter.post('/auth/login'");
  const routeEnd = api.indexOf("apiRouter.post('/auth/logout'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  const failedPassword = route.indexOf('if (!isPasswordValid)');
  const migration = route.indexOf('linkLegacyLoginToSupabaseAuth(user, password)');
  const session = route.indexOf('await issueSessionCookie(res, user, req)');
  assert.ok(failedPassword >= 0 && migration > failedPassword && session > migration);
  assert.ok(route.includes('verifiedLegacyPassword = verifyPassword(password, user.passwordHash)'));
  assert.ok(route.includes('if (!authUserId && verifiedLegacyPassword)'));
  assert.ok(route.includes("user.role === 'teacher' && verifyPin"));
  assert.equal(route.slice(migration - 100, migration + 150).includes('verifyPin'), false);
});

test('migration creates only a new Auth identity and keeps the existing SchoolOS account linked safely', () => {
  const start = api.indexOf('async function linkLegacyLoginToSupabaseAuth');
  const end = api.indexOf('// 1. AUTHENTICATION', start);
  const helper = api.slice(start, end);
  assert.ok(helper.includes('if (!isSupabaseConfigured || !user.email || user.authUserId) return;'));
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

test('accounts without email retain their legacy PIN or staff-ID sign-in path', () => {
  const start = api.indexOf('async function linkLegacyLoginToSupabaseAuth');
  const end = api.indexOf('// 1. AUTHENTICATION', start);
  const helper = api.slice(start, end);
  assert.ok(helper.includes('!user.email'));
  const loginStart = api.indexOf("apiRouter.post('/auth/login'");
  const staffStart = api.indexOf('// B. SUPER ADMIN, SCHOOL ADMIN, TEACHER, ACCOUNTANT', loginStart);
  const studentLogin = api.slice(loginStart, staffStart);
  assert.ok(studentLogin.includes('STUDENT & PARENT LOGIN'));
  assert.ok(studentLogin.includes('verifyPin('));
  assert.equal(studentLogin.includes('linkLegacyLoginToSupabaseAuth'), false);
});

test('Supabase Auth identity is selected into session context and never exposed to clients', () => {
  assert.ok(storage.includes("users: { authUserId: 'auth_user_id'"));
  assert.ok(storage.includes("const userColumns = 'id,auth_user_id,"));
  assert.ok(types.includes('authUserId?: string'));
  assert.ok(authSecurity.includes('delete copy.authUserId'));
});

test('Auth migration preserves the stable SchoolOS user ID and only backfills exact UUID matches', () => {
  const migration = read('../supabase/migrations/20261108072315_link_schoolos_users_to_supabase_auth.sql');
  assert.ok(migration.includes('REFERENCES auth.users(id)'));
  assert.ok(migration.includes('WHERE u.id = a.id::text'));
  assert.equal(/UPDATE public\.users[\s\S]{0,250}SET id =/.test(migration), false);
});
