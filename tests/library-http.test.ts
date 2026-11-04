import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'library-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();

function makeSchool(code: string, email: string) {
  return storage.db.createSchool({
    name: `Library ${code} School`, code, address: '', city: '', phone: '', email,
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
    ipAddress: '127.0.0.1', userAgent: 'library-test', createdAt: new Date().toISOString(),
    expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString()
  });
  return `schoolos_session=${auth.createSignedSessionToken({
    sessionId, userId: user.id, role: user.role, schoolId: user.schoolId, createdAt: Date.now(), expiresAt
  })}`;
}

const schoolA = makeSchool('LIBRARY-A', 'library-a@example.test');
const schoolB = makeSchool('LIBRARY-B', 'library-b@example.test');
const adminA = makeUser(schoolA.id, 'school_admin', 'library-admin-a@example.test');
const teacherA = makeUser(schoolA.id, 'teacher', 'library-teacher-a@example.test');
const adminB = makeUser(schoolB.id, 'school_admin', 'library-admin-b@example.test');
const adminACookie = cookieFor(adminA, 'library-admin-a-session');
const teacherACookie = cookieFor(teacherA, 'library-teacher-a-session');
const adminBCookie = cookieFor(adminB, 'library-admin-b-session');

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Library test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const headers = (cookie: string) => ({ Cookie: cookie, 'Content-Type': 'application/json' });
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('library catalogue reads persisted Supabase books and enforces school boundaries', async () => {
  const createdA = await fetch(`${baseUrl}/school/library`, {
    method: 'POST', headers: headers(adminACookie),
    body: JSON.stringify({ title: 'Mathematics Grade 8', author: 'A. Teacher', isbn: '978-0000000001', quantity: 4 })
  });
  assert.equal(createdA.status, 201);
  const bookA = await createdA.json() as any;
  assert.equal(bookA.schoolId, schoolA.id);

  const createdB = await fetch(`${baseUrl}/school/library`, {
    method: 'POST', headers: headers(adminBCookie),
    body: JSON.stringify({ title: 'Science Grade 9', author: 'B. Teacher', isbn: '978-0000000002', quantity: 2 })
  });
  assert.equal(createdB.status, 201);

  const listA = await fetch(`${baseUrl}/school/library`, { headers: { Cookie: adminACookie } });
  assert.equal(listA.status, 200);
  const booksA = await listA.json() as any[];
  assert.equal(booksA.length, 1);
  assert.equal(booksA[0].id, bookA.id);
  assert.equal(booksA[0].title, 'Mathematics Grade 8');

  const teacherList = await fetch(`${baseUrl}/school/library`, { headers: { Cookie: teacherACookie } });
  assert.equal(teacherList.status, 200);
  const teacherBooks = await teacherList.json() as any[];
  assert.equal(teacherBooks.length, 1);
  assert.equal(teacherBooks[0].schoolId, schoolA.id);

  const forbiddenWrite = await fetch(`${baseUrl}/school/library`, {
    method: 'POST', headers: headers(teacherACookie),
    body: JSON.stringify({ title: 'Unauthorized book', author: 'Teacher', quantity: 1 })
  });
  assert.equal(forbiddenWrite.status, 403);

  const crossSchoolRead = await fetch(`${baseUrl}/school/library?schoolId=${schoolB.id}`, {
    headers: { Cookie: adminACookie }
  });
  assert.equal(crossSchoolRead.status, 403);
});
