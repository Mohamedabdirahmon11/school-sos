import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isSessionExpiryValid } from '../src/server/auth-security.ts';

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

test('Super Admin 2FA policy is enforced at login and before protected routes', () => {
  const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const loginStart = apiSource.indexOf("apiRouter.post('/auth/login'");
  const loginEnd = apiSource.indexOf("// Logout endpoint", loginStart);
  const loginHandler = apiSource.slice(loginStart, loginEnd);
  assert.ok(loginHandler.includes('settings.requireSuperAdmin2FA'));
  assert.ok(loginHandler.includes('verify2FACode(twoFactorCode, user.twoFactorSecret)'));
  assert.ok(loginHandler.includes('requireTwoFactorSetup: true'));
  assert.ok(apiSource.includes('requiresTwoFactorSetup && !user.mustChangePassword && !twoFactorSetupRoutes.includes(req.path)'));
  assert.ok(apiSource.includes('await db.flush();'));
});
