import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const storage = read('../src/server/storage.ts');
const loginView = read('../src/components/auth/LoginView.tsx');

test('School Admin can use School ID and issued PIN on the shared login page', () => {
  const routeStart = api.indexOf("apiRouter.post('/auth/login'");
  const routeEnd = api.indexOf("apiRouter.post('/auth/logout'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.ok(route.includes("const submittedPin = typeof pin === 'string' ? pin.trim() : ''"));
  assert.ok(route.includes('verifyPin(submittedPin'));
  assert.ok(route.includes("!user.pin && verifyPassword(submittedPin, user.passwordHash)"));
  assert.ok(route.includes("db.updateUser(user.id, { pin: hashPin(submittedPin) })"));
  assert.ok(route.includes('await db.flush()'));
  assert.ok(storage.includes('const school = await this.getSchoolById(normalizedStaffId)'));
  assert.ok(storage.includes('schoolAdmins.length === 1'));
  assert.ok(api.includes('pin: hashPin(temporaryPin)'));
});

test('shared login sends email passwords and ID-based PINs to the correct credential fields', () => {
  assert.ok(loginView.includes("pin: email.trim().includes('@') ? pin : (password || pin)"));
  assert.ok(loginView.includes('Super Admin email, School ID / School Admin ID, or Teacher ID'));
  assert.ok(loginView.includes('Password (Super Admin) or PIN (School Admin / Teacher)'));
});
