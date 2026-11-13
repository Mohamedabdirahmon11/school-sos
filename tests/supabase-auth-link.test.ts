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
  assert.match(route, /verifiedLegacyPassword = verifyPassword\(password, user\.passwordHash\)/);
  assert.match(route, /if \(!authUserId && verifiedLegacyPassword\)/);
  assert.match(route, /user\.role === 'teacher' && verifyPin/);
  assert.doesNotMatch(route.slice(migration - 100, migration + 150), /verifyPin/);
});

test('migration creates only a new Auth identity and never changes an existing identity password', () => {
  const start = api.indexOf('async function linkLegacyLoginToSupabaseAuth');
  const end = api.indexOf('// ==============================================================================\n// 1. AUTHENTICATION', start);
  const helper = api.slice(start, end);
  assert.match(helper, /if \(!isSupabaseConfigured \|\| !user\.email \|\| user\.authUserId\) return/);
  assert.match(helper, /auth\.admin\.createUser/);
  assert.match(helper, /email_confirm: true/);
  assert.match(helper, /\.is\('auth_user_id', null\)/);
  assert.match(helper, /auth\.admin\.deleteUser\(authUserId\)/);
  assert.match(helper, /db\.updateUser\(user\.id, \{ authUserId \}\)/);
  assert.match(helper, /if \(!linkedToSchoolOSUser\)/);
  assert.match(helper, /try \{ await db\.flush\(\); \} catch/);
  assert.doesNotMatch(helper, /auth\.admin\.updateUserById/);
  assert.doesNotMatch(helper, /console\.(log|error).*password/i);
});

test('accounts without email retain their legacy PIN or staff-ID sign-in path', () => {
  const start = api.indexOf('async function linkLegacyLoginToSupabaseAuth');
  const end = api.indexOf('// ==============================================================================\n// 1. AUTHENTICATION', start);
  const helper = api.slice(start, end);
  assert.match(helper, /!user\.email/);
  const loginStart = api.indexOf("apiRouter.post('/auth/login'");
  const staffStart = api.indexOf('// B. SUPER ADMIN, SCHOOL ADMIN, TEACHER, ACCOUNTANT', loginStart);
  const studentLogin = api.slice(loginStart, staffStart);
  assert.match(studentLogin, /STUDENT & PARENT LOGIN/);
  assert.match(studentLogin, /verifyPin\(/);
  assert.doesNotMatch(studentLogin, /linkLegacyLoginToSupabaseAuth/);
});

test('Supabase Auth identity is selected into session context and mapped at the storage boundary', () => {
  assert.match(storage, /users: \{ authUserId: 'auth_user_id'/);
  assert.match(storage, /const userColumns = 'id,auth_user_id,/);
  assert.match(types, /authUserId\?: string/);
  assert.match(authSecurity, /delete copy\.authUserId/);
});

test('Auth migration preserves the stable SchoolOS user ID and only backfills exact UUID matches', () => {
  const migration = read('../supabase/migrations/20261108072315_link_schoolos_users_to_supabase_auth.sql');
  assert.match(migration, /REFERENCES auth\.users\(id\)/);
  assert.match(migration, /WHERE u\.id = a\.id::text/);
  assert.doesNotMatch(migration, /UPDATE public\.users[\s\S]{0,250}SET id =/);
});
