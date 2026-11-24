import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { calculateSubscriptionGraceEnd, lockoutAttemptCountFromRow, shouldTouchSession, shouldReuseCachedAuthSession } from '../src/server/storage.ts';

test('session refresh persistence is throttled to at most once per minute', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  const currentExpiry = new Date(now + 60 * 60 * 1000).toISOString();

  assert.equal(
    shouldTouchSession(currentExpiry, new Date(now + 60 * 60 * 1000 + 59_999).toISOString(), now),
    false
  );
  assert.equal(
    shouldTouchSession(currentExpiry, new Date(now + 60 * 60 * 1000 + 60_000).toISOString(), now),
    true
  );
});

test('short session timeouts use a proportionate refresh window', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  const currentExpiry = new Date(now + 57_000).toISOString();

  assert.equal(shouldTouchSession(currentExpiry, new Date(now + 60_000 - 1).toISOString(), now), false);
  assert.equal(shouldTouchSession(currentExpiry, new Date(now + 60_000).toISOString(), now), true);
});

test('session expiry reductions and invalid stored expiries are persisted immediately', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  assert.equal(
    shouldTouchSession(new Date(now + 60_000).toISOString(), new Date(now + 30_000).toISOString(), now),
    true
  );
  assert.equal(shouldTouchSession('invalid', new Date(now + 60_000).toISOString(), now), true);
});

test('subscription grace periods preserve an explicitly configured zero days', () => {
  const validUntil = '2026-11-03T00:00:00.000Z';
  assert.equal(calculateSubscriptionGraceEnd(validUntil, 0, 7).toISOString(), validUntil);
});

test('subscription grace periods use platform defaults only when school setting is absent', () => {
  const validUntil = '2026-11-03T00:00:00.000Z';
  assert.equal(calculateSubscriptionGraceEnd(validUntil, undefined, 3).toISOString(), '2026-11-06T00:00:00.000Z');
});

test('lockout counter rows read the canonical attempt_count alias without producing NaN', () => {
  assert.equal(lockoutAttemptCountFromRow({ count: 3 }), 3);
  assert.equal(lockoutAttemptCountFromRow({ attemptCount: 4 }), 4);
  assert.equal(lockoutAttemptCountFromRow({ attempt_count: 5 }), 5);
  assert.equal(lockoutAttemptCountFromRow({ count: undefined }), 0);
  assert.equal(lockoutAttemptCountFromRow({ count: Number.NaN }), 0);
});

test('cached session validation is reused only inside its short TTL and while the session is unexpired', () => {
  const now = Date.UTC(2026, 10, 22, 12, 0, 0);
  const sessionExpiry = new Date(now + 60_000).toISOString();

  assert.equal(shouldReuseCachedAuthSession(now + 1_999, sessionExpiry, now), true);
  assert.equal(shouldReuseCachedAuthSession(now, sessionExpiry, now), false);
  assert.equal(shouldReuseCachedAuthSession(now + 2_000, sessionExpiry, now + 2_000), false);
  assert.equal(shouldReuseCachedAuthSession(now + 1_000, new Date(now - 1).toISOString(), now), false);
});

test('class attendance reads avoid exact-count pagination and select only register fields', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async getAttendance(');
  const end = storage.indexOf('public async getSchoolAttendance(', start);
  const method = storage.slice(start, end);
  assert.match(method, /select\('id,school_id,class_id,student_id,date,status,note,recorded_by,recorded_at'\)/);
  assert.match(method, /\.eq\('school_id', schoolId\)[\s\S]*?\.eq\('class_id', classId\)[\s\S]*?\.eq\('date', date\)/);
  assert.match(method, /\.range\(offset, offset \+ 999\)/);
  assert.doesNotMatch(method, /count:\s*'exact'/);
});

test('bulk attendance returns only the register columns from one conflict-safe upsert', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async recordDailyAttendance(');
  const end = storage.indexOf('// EXAMS & RESULTS', start);
  const method = storage.slice(start, end);
  assert.match(method, /\.upsert\(payload, \{ onConflict: 'school_id,class_id,student_id,date' \}\)/);
  assert.match(method, /\.select\('id,school_id,class_id,student_id,date,status,note,recorded_by,recorded_at'\)/);
  assert.doesNotMatch(method, /\.select\('\*'\)/);
});

test('production mark-as-read uses one school and conversation scoped idempotent update', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async markMessagesRead(');
  const end = storage.indexOf('public async getBroadcasts(', start);
  const method = storage.slice(start, end);
  const production = method.slice(method.indexOf('const client = supabase'));
  assert.match(production, /from\('direct_messages'\)[\s\S]*?update\(\{ is_read: true \}\)/);
  assert.match(production, /\.eq\('school_id', schoolId\)/);
  assert.match(production, /\.eq\('sender_id', contactId\)/);
  assert.match(production, /\.eq\('recipient_id', userId\)/);
  assert.match(production, /\.eq\('is_read', false\)/);
  assert.doesNotMatch(production, /getMessages\(/);
});

test('message inbox combines sent and received rows in one school-scoped OR query', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async getMessages(');
  const end = storage.indexOf('public async sendMessage(', start);
  const method = storage.slice(start, end);
  assert.match(method, /queryRows<DirectMessage>\([\s\S]*?'direct_messages',[\s\S]*?\{ school_id: schoolId \},[\s\S]*?sender_id\.eq\.\$\{userId\},recipient_id\.eq\.\$\{userId\}/);
  assert.doesNotMatch(method, /Promise\.all|const \[sent, received\]/);
  assert.match(method, /id,school_id,sender_id,sender_name,sender_role,recipient_id,recipient_name,recipient_role,content,timestamp,is_read/);
  assert.match(storage, /private async queryRows<[\s\S]*?orFilter\?: string[\s\S]*?queryPage<T>\(table, filters, page, 100, orFilter, columns\)/);
});



test('concurrent request contexts coalesce cold settings and plans reads', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storage, /private settingsLoadPromise: Promise<SuperAdminSettings> \| null = null/);
  assert.match(storage, /private plansLoadPromise: Promise<PlanConfig\[\]> \| null = null/);
  assert.match(storage, /if \(!this\.settingsLoadPromise\)\s*\{[\s\S]*?this\.settingsLoadPromise =/);
  assert.match(storage, /if \(!this\.plansLoadPromise\)\s*\{[\s\S]*?this\.plansLoadPromise =/);
  assert.match(storage, /finally\(\(\) => \{ this\.settingsLoadPromise = null; \}\)/);
  assert.match(storage, /finally\(\(\) => \{ this\.plansLoadPromise = null; \}\)/);
});

test('plan configuration is loaded only for Super Admin plan and invoice routes', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(api, /const includePlans = req\.path === '\/superadmin\/plans'/);
  assert.match(api, /req\.path\.startsWith\('\/superadmin\/plans\/'\)/);
  assert.match(api, /req\.method === 'POST' && req\.path === '\/superadmin\/invoices\/generate'/);
  assert.match(api, /prepareRequestContext\(req\.path === '\/auth\/login', `\$\{req\.method\} \$\{req\.path\}`, includePlans\)/);
});
