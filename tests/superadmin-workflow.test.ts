import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const client = read('../src/services/api.ts');
const schools = read('../src/components/superadmin/SchoolsView.tsx');
const users = read('../src/components/superadmin/GlobalUsersView.tsx');
const sessions = read('../src/components/superadmin/SessionsModal.tsx');
const billing = read('../src/components/superadmin/PlansBillingView.tsx');
const settings = read('../src/components/superadmin/PlatformSettingsView.tsx');
const storage = read('../src/server/storage.ts');

test('school onboarding requires complete school and first administrator contact details', () => {
  for (const field of ['name', 'code', 'address', 'city', 'phone', 'whatsappPhone', 'email', 'adminName', 'adminEmail', 'adminPhone']) {
    assert.match(api, new RegExp(`'${field}'`), `missing onboarding validation for ${field}`);
  }
  assert.match(schools, /whatsappPhone: addWhatsappPhone/);
  assert.match(schools, /address: addAddress/);
  assert.match(api, /whatsappPhone: String\(whatsappPhone\)\.trim\(\)/);
});

test('school details use a dedicated school-scoped admin query and a consistent admins array', () => {
  assert.match(api, /apiRouter\.get\('\/superadmin\/schools\/:id'/);
  assert.match(api, /role: 'school_admin'/);
  assert.match(api, /admins: sanitizeUsers\(admins\.items\)/);
  assert.match(client, /\/superadmin\/schools\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(schools, /Array\.isArray\(selectedSchool\.admins\)/);
});

test('school onboarding waits for Supabase persistence before returning success', () => {
  const routeStart = api.indexOf("apiRouter.post('/superadmin/schools'");
  const routeEnd = api.indexOf("apiRouter.patch('/superadmin/schools/:id/subscription'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.ok(route.indexOf('await db.flush()') > route.indexOf('db.createUser('));
  assert.ok(route.indexOf('await db.flush()') < route.indexOf('res.status(201)'));
});

test('global user management is server-paginated and includes accountant role filtering', () => {
  assert.match(api, /supportedRoles = \['super_admin', 'school_admin', 'accountant', 'teacher', 'parent'\]/);
  assert.match(api, /sendDatabasePage\(req, res, 'users', filters, orFilter, sanitizeUsers\)/);
  assert.match(client, /getGlobalUsers\(params\?: \{ page\?: number; pageSize\?: number; search\?: string; role\?: string \}\)/);
  assert.match(users, /pageSize: 50/);
  assert.match(users, /id: 'accountant', label: 'Accountant'/);
  assert.match(users, /totalPages/);
});

test('user block, password reset and session revocation persist before success responses', () => {
  assert.match(api, /await db\.flush\(\);\s*res\.json\(\{ success: true, temporaryPassword/);
  assert.match(api, /await db\.flush\(\);\s*res\.json\(\{ success: true, isBlocked: newStatus \}/);
  assert.match(api, /await db\.flush\(\);\s*res\.json\(\{ success: true \}\)/);
  assert.doesNotMatch(client, /toggleUserBlock[\s\S]{0,400}\.catch\(\(\) => \(\{ success: true \}\)\)/);
  assert.match(sessions, /setLoadError/);
  assert.match(sessions, /setActionError/);
});

test('billing actions guard duplicate plan saves and confirm manual payment reconciliation', () => {
  assert.match(billing, /if \(!editingPlan \|\| isSavingPlan\) return/);
  assert.match(billing, /disabled=\{isSavingPlan\}/);
  assert.match(billing, /Confirm that the school has already paid this invoice outside SchoolOS/);
  assert.match(storage, /schoolos_mark_subscription_invoice_paid/);
});

test('platform backup is checksum-verified in the browser before download', () => {
  assert.match(settings, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(settings, /actualChecksum !== res\.checksum\.value\.toLowerCase\(\)/);
  assert.match(settings, /Backup checksum verified/);
});
