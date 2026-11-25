import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { calculateSubscriptionGraceEnd, lockoutAttemptCountFromRow, shouldTouchSession, shouldReuseCachedAuthSession } from '../src/server/storage.ts';

test('long-lived session last-seen persistence is throttled to at most once per five minutes', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0, 0);
  const timeoutMs = 30 * 24 * 60 * 60 * 1000;
  const currentExpiry = new Date(now + timeoutMs).toISOString();

  assert.equal(
    shouldTouchSession(currentExpiry, new Date(now + timeoutMs + 5 * 60_000 - 1).toISOString(), now),
    false
  );
  assert.equal(
    shouldTouchSession(currentExpiry, new Date(now + timeoutMs + 5 * 60_000).toISOString(), now),
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

  assert.equal(shouldReuseCachedAuthSession(now + 29_999, sessionExpiry, now), true);
  assert.equal(shouldReuseCachedAuthSession(now, sessionExpiry, now), false);
  assert.equal(shouldReuseCachedAuthSession(now + 30_000, sessionExpiry, now + 30_000), false);
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


test('unrelated request flushes never upsert built-in plans without a database baseline', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('private async persistSnapshot(');
  const end = storage.indexOf('public setTestClient(', start);
  const persist = storage.slice(start, end);
  assert.match(persist, /table === 'plans' && !knownIds\.has\('plans'\) && !knownRows\.has\('plans'\)/);
  assert.ok(persist.includes('continue;'));
  assert.ok(persist.includes('await this.persistTable(client, table, rows, toRows(table), knownIds, knownRows)'));
});


test('request query metrics expose per-table counts for duplicate-read detection', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storage, /queryTables: Map<string, number>/);
  assert.match(storage, /this\.state\.queryTables\.set\(table, \(this\.state\.queryTables\.get\(table\) \|\| 0\) \+ 1\)/);
  assert.match(storage, /tableCounts: Object\.fromEntries\(this\.state\.queryTables\)/);
  assert.match(storage, /queryTables: new Map\(\)/);
});

test('API request observability reports non-DB time and warns on slow or duplicate-table requests', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  assert.match(api, /const nonDbDurationMs = Math\.max\(0, Math\.round\(\(durationMs - dbDurationMs\) \* 100\) \/ 100\)/);
  assert.match(api, /event: 'slow-request'/);
  assert.match(api, /durationMs > 500 \|\| metrics\.count > 3/);
  assert.match(api, /event: 'duplicate-table-queries'/);
  assert.match(api, /Number\(count\) > 1/);
  assert.match(api, /poolWaitMs: null/);
});


test('yearly rankings load one class-year marks set and parallelize independent school reads', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async getClassYearlyRankings(');
  const end = storage.indexOf('// YEAR-END PROMOTION', start);
  const method = storage.slice(start, end);
  assert.match(method, /const klass = await this\.getClassById\(classId, schoolId\)/);
  assert.match(method, /const \[students, school, assignments, allSubjects, allMarks\] = await Promise\.all\(/);
  assert.match(method, /this\.queryRows<StudentMark>\('student_marks', \{[\s\S]*?school_id: schoolId,[\s\S]*?class_id: classId,[\s\S]*?academic_year: klass\?\.academicYear/);
  assert.match(method, /allMarks\.filter\(mark => mark\.status === 'approved' && mark\.semester === 'Semester 1'\)/);
  assert.match(method, /allMarks\.filter\(mark => mark\.status === 'approved' && mark\.semester === 'Semester 2'\)/);
  assert.doesNotMatch(method, /this\.getMarks\(/);
});


test('read-only exam configuration reads do not create or upsert missing defaults', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async getExamConfig(');
  const end = storage.indexOf('public async updateExamConfig(', start);
  const method = storage.slice(start, end);
  assert.match(method, /persistIfMissing = true/);
  assert.match(method, /if \(persistIfMissing\) \{[\s\S]*?this\.data\.examConfigs\.push\(conf\)[\s\S]*?this\.save\(\)/);
  assert.match(method, /return conf;/);
});


test('internal query page batching is capped at 1000 rows while public defaults remain 100', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storage, /ascending = true, maxPageSize = 100/);
  assert.match(storage, /Math\.min\(1_000, Math\.max\(1, Math\.floor\(maxPageSize\) \|\| 100\)\)/);
});


test('auth session and user context caches are 30 seconds and user updates invalidate local session entries', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storage, /const AUTH_CONTEXT_TTL_MS = 30_000/);
  assert.match(storage, /const AUTH_SESSION_VALIDATION_TTL_MS = 30_000/);
  assert.match(storage, /function invalidateAuthContextForUser\(userId: string\): void/);
  assert.match(storage, /for \(const \[sessionId, entry\] of authSessionValidationCache\)[\s\S]*?entry\.userId === userId/);
  const updateStart = storage.indexOf('public updateUser(');
  const updateEnd = storage.indexOf('public deleteUser(', updateStart);
  assert.match(storage.slice(updateStart, updateEnd), /invalidateAuthContextForUser\(id\)/);
});

test('school auth context invalidation clears cached sessions for that school', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('private invalidateAuthContextsForSchool(');
  const end = storage.indexOf('private invalidateNoticeCounts(', start);
  const method = storage.slice(start, end);
  assert.match(method, /invalidateAuthContextForUser\(userId\)/);
  assert.match(method, /entry\.schoolId === schoolId/);
});


test('session refresh reuses the session row already validated by authentication', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const start = storage.indexOf('public async touchSession(');
  const end = storage.indexOf('public async revokeSession(', start);
  const method = storage.slice(start, end);
  assert.match(method, /validatedSession\?: UserSession/);
  assert.match(method, /validatedSession\?\.id === id \? validatedSession : await this\.getSessionById\(id\)/);
  assert.match(api, /\(req as any\)\.validatedSession = session \|\| undefined/);
  assert.match(api, /refreshSessionCookie\(res, user, payload, \(req as any\)\.validatedSession\)/);
  assert.match(api, /db\.touchSession\(previous\.sessionId, new Date\(expiresAt\)\.toISOString\(\), validatedSession\)/);
});
