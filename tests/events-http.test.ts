import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'events-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();

function makeSchool(code: string, email: string) {
  return storage.db.createSchool({
    name: `Events ${code} School`, code, address: '', city: '', phone: '', email,
    currency: 'ETB', academicYear: '2026-2027', currentSemester: 'Semester 1',
    defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: new Date().toISOString(), validUntil: '2027-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
}
function makeUser(schoolId: string, role: string, email: string) {
  return storage.db.createUser({ schoolId, role, fullName: email, email, passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
}
function cookieFor(user: any, sessionId: string) {
  const expiresAt = Date.now() + 60_000;
  storage.db.createSession({
    id: sessionId, userId: user.id, userRole: user.role, schoolId: user.schoolId,
    ipAddress: '127.0.0.1', userAgent: 'events-test', createdAt: new Date().toISOString(),
    expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString()
  });
  return `schoolos_session=${auth.createSignedSessionToken({
    sessionId, userId: user.id, role: user.role, schoolId: user.schoolId, createdAt: Date.now(), expiresAt
  })}`;
}

const schoolA = makeSchool('EVENTS-A', 'events-a@example.test');
const schoolB = makeSchool('EVENTS-B', 'events-b@example.test');
const adminA = makeUser(schoolA.id, 'school_admin', 'events-admin-a@example.test');
const teacherA = makeUser(schoolA.id, 'teacher', 'events-teacher-a@example.test');
const adminB = makeUser(schoolB.id, 'school_admin', 'events-admin-b@example.test');
const adminACookie = cookieFor(adminA, 'events-admin-a-session');
const teacherACookie = cookieFor(teacherA, 'events-teacher-a-session');
const adminBCookie = cookieFor(adminB, 'events-admin-b-session');

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Events test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const headers = (cookie: string) => ({ Cookie: cookie, 'Content-Type': 'application/json' });
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('school events persist, validate and remain isolated to their school', async () => {
  const invalid = await fetch(`${baseUrl}/school/events`, {
    method: 'POST', headers: headers(adminACookie),
    body: JSON.stringify({ title: 'Bad date', description: '', startDate: '2026-11-10', endDate: '2026-11-01', type: 'event' })
  });
  assert.equal(invalid.status, 400);

  const createdA = await fetch(`${baseUrl}/school/events`, {
    method: 'POST', headers: headers(adminACookie),
    body: JSON.stringify({ title: 'Sports Day', description: 'Annual school sports day', startDate: '2026-11-10', endDate: '2026-11-10', type: 'event' })
  });
  assert.equal(createdA.status, 201);
  const eventA = await createdA.json() as any;
  assert.equal(eventA.schoolId, schoolA.id);
  assert.equal(eventA.createdAt, undefined);

  const createdB = await fetch(`${baseUrl}/school/events`, {
    method: 'POST', headers: headers(adminBCookie),
    body: JSON.stringify({ title: 'Science Fair', description: '', startDate: '2026-11-12', endDate: '2026-11-13', type: 'meeting' })
  });
  assert.equal(createdB.status, 201);

  const listA = await fetch(`${baseUrl}/school/events`, { headers: { Cookie: adminACookie } });
  assert.equal(listA.status, 200);
  assert.equal(listA.headers.get('cache-control'), 'no-store');
  const eventsA = await listA.json() as any[];
  assert.equal(eventsA.length, 1);
  assert.equal(eventsA[0].id, eventA.id);

  const teacherList = await fetch(`${baseUrl}/school/events`, { headers: { Cookie: teacherACookie } });
  assert.equal(teacherList.status, 200);
  assert.equal((await teacherList.json() as any[]).length, 1);

  const forbiddenCreate = await fetch(`${baseUrl}/school/events`, {
    method: 'POST', headers: headers(teacherACookie),
    body: JSON.stringify({ title: 'Unauthorized', description: '', startDate: '2026-11-14', endDate: '2026-11-14', type: 'event' })
  });
  assert.equal(forbiddenCreate.status, 403);

  const crossSchoolRead = await fetch(`${baseUrl}/school/events?schoolId=${schoolB.id}`, {
    headers: { Cookie: adminACookie }
  });
  assert.equal(crossSchoolRead.status, 403);

  const forbiddenDelete = await fetch(`${baseUrl}/school/events/${eventA.id}`, {
    method: 'DELETE', headers: headers(teacherACookie)
  });
  assert.equal(forbiddenDelete.status, 403);

  const deleted = await fetch(`${baseUrl}/school/events/${eventA.id}`, {
    method: 'DELETE', headers: headers(adminACookie)
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json() as any).success, true);
  const afterDelete = await fetch(`${baseUrl}/school/events`, { headers: { Cookie: adminACookie } });
  assert.equal((await afterDelete.json() as any[]).length, 0);
});
