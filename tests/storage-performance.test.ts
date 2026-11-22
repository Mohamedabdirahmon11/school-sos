import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { db, calculateSubscriptionGraceEnd, lockoutAttemptCountFromRow, shouldTouchSession, shouldReuseCachedAuthSession } from '../src/server/storage.ts';

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


test('request query metrics read the originating AsyncLocalStorage context', async () => {
  const requestContext = await db.createRequestContext('GET /metrics-test');
  requestContext.queryCount = 7;
  requestContext.queryDurationMs = 123.45;
  assert.deepEqual(db.getRequestQueryMetrics(requestContext), { count: 7, durationMs: 123.45 });
});


test('class report-card PDF student records are fetched in one school-scoped field-limited batch', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const methodStart = storage.indexOf('public async getStudentsByIds(');
  const methodEnd = storage.indexOf('public async getStudentById(', methodStart);
  const method = storage.slice(methodStart, methodEnd);
  assert.match(method, /id: uniqueIds, school_id: schoolId/);
  assert.match(method, /id,school_id,student_id,first_name,middle_name,last_name/);
  const queryRowsStart = storage.indexOf('private async queryRows<');
  const queryRowsEnd = storage.indexOf('private cacheQueryRows(', queryRowsStart);
  const queryRows = storage.slice(queryRowsStart, queryRowsEnd);
  assert.match(queryRows, /if \(columns === '\*'\) this\.cacheQueryRows\(table, rows\)/);
  const routeStart = api.indexOf("apiRouter.get('/term-marks/report-cards/classes/:classId/pdf'");
  const routeEnd = api.indexOf("forwardAsyncErrors(apiRouter)", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.match(route, /db\.getStudentsByIds\(cards\.map/);
  assert.doesNotMatch(route, /Promise\.all\(cards\.map[\s\S]*?db\.getStudentById/);
});


test('bulk document generation resolves up to 100 student identifiers with two school-scoped batch queries', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const methodStart = storage.indexOf('public async getStudentsByIdentifiers(');
  const methodEnd = storage.indexOf('public async getStudentById(', methodStart);
  const method = storage.slice(methodStart, methodEnd);
  assert.match(method, /Promise\.all\(/);
  assert.match(method, /school_id: schoolId, id: uniqueIdentifiers/);
  assert.match(method, /school_id', schoolId\)[\s\S]*?in\('student_id', uniqueIdentifiers\)/);
  assert.match(method, /select\('\*'\)/);
  assert.doesNotMatch(method, /count:\s*'exact'/);
  const routeStart = api.indexOf("apiRouter.post('/documents/generate'");
  const routeEnd = api.indexOf("apiRouter.", routeStart + 30);
  const route = api.slice(routeStart, routeEnd < 0 ? api.length : routeEnd);
  assert.match(route, /db\.getStudentsByIdentifiers\(identifiers, school\.id\)/);
  assert.doesNotMatch(route, /for \(const rawId of body\.studentIds\)[\s\S]*?await db\.getStudentById/);
});


test('bulk document generation batches class, marks, and form-teacher lookups for selected students', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const classMethod = storage.slice(storage.indexOf('public async getClassesByIds('), storage.indexOf('public async getClassById(', storage.indexOf('public async getClassesByIds(')));
  assert.match(classMethod, /id: uniqueIds, school_id: schoolId/);
  const marksMethod = storage.slice(storage.indexOf('public async getMarksForStudents('), storage.indexOf('public async getMarks(', storage.indexOf('public async getMarksForStudents(')));
  assert.match(marksMethod, /student_id: uniqueStudentIds, class_id: uniqueClassIds/);
  const routeStart = api.indexOf("apiRouter.post('/documents/generate'");
  const routeEnd = api.indexOf("apiRouter.", routeStart + 30);
  const route = api.slice(routeStart, routeEnd < 0 ? api.length : routeEnd);
  assert.match(route, /db\.getClassesByIds\(requestedClassIds,school\.id\)/);
  assert.match(route, /db\.getMarksForStudents\(school\.id,studentIds,classRows\.map/);
  assert.match(route, /id:teacherIds/);
  assert.doesNotMatch(route, /for \(const klass of classesById\.values\(\)\)[\s\S]*?await db\.getMarks/);
  assert.doesNotMatch(route, /for \(const klass of classesById\.values\(\)\)[\s\S]*?db\.queryPage<any>\('teachers'/);
});
