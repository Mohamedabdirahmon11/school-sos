import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'transport-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();

function makeSchool(code: string, email: string) {
  return storage.db.createSchool({
    name: `Transport ${code} School`, code, address: '', city: '', phone: '', email,
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
    ipAddress: '127.0.0.1', userAgent: 'transport-test', createdAt: new Date().toISOString(),
    expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString()
  });
  return `schoolos_session=${auth.createSignedSessionToken({
    sessionId, userId: user.id, role: user.role, schoolId: user.schoolId, createdAt: Date.now(), expiresAt
  })}`;
}

const schoolA = makeSchool('TRANSPORT-A', 'transport-a@example.test');
const schoolB = makeSchool('TRANSPORT-B', 'transport-b@example.test');
const adminA = makeUser(schoolA.id, 'school_admin', 'transport-admin-a@example.test');
const teacherA = makeUser(schoolA.id, 'teacher', 'transport-teacher-a@example.test');
const adminB = makeUser(schoolB.id, 'school_admin', 'transport-admin-b@example.test');
const adminACookie = cookieFor(adminA, 'transport-admin-a-session');
const teacherACookie = cookieFor(teacherA, 'transport-teacher-a-session');
const adminBCookie = cookieFor(adminB, 'transport-admin-b-session');

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Transport test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const headers = (cookie: string) => ({ Cookie: cookie, 'Content-Type': 'application/json' });
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('transport routes persist using schema columns and remain tenant-scoped', async () => {
  const createdA = await fetch(`${baseUrl}/school/transport`, {
    method: 'POST', headers: headers(adminACookie),
    body: JSON.stringify({
      name: 'North Route', routeNumber: 'BUS-01', vehicleNumber: 'ABC-123',
      driverName: 'Driver A', driverPhone: '0900000000', stops: ['Main Gate', 'Market'],
      feeAmount: 250, active: true
    })
  });
  assert.equal(createdA.status, 201);
  const routeA = await createdA.json() as any;
  assert.equal(routeA.schoolId, schoolA.id);
  assert.equal(routeA.createdAt, undefined);
  const persistedA = memory.rowsFor('transport_routes').find(row => row.id === routeA.id);
  assert.ok(persistedA);
  assert.equal(persistedA.created_at, undefined);

  const createdB = await fetch(`${baseUrl}/school/transport`, {
    method: 'POST', headers: headers(adminBCookie),
    body: JSON.stringify({
      name: 'South Route', routeNumber: 'BUS-02', vehicleNumber: 'XYZ-456',
      driverName: 'Driver B', driverPhone: '', stops: [], feeAmount: 300, active: true
    })
  });
  assert.equal(createdB.status, 201);

  const listA = await fetch(`${baseUrl}/school/transport`, { headers: { Cookie: adminACookie } });
  assert.equal(listA.status, 200);
  const routesA = await listA.json() as any[];
  assert.equal(routesA.length, 1);
  assert.equal(routesA[0].id, routeA.id);

  const teacherList = await fetch(`${baseUrl}/school/transport`, { headers: { Cookie: teacherACookie } });
  assert.equal(teacherList.status, 403);

  const teacherAssignments = await fetch(`${baseUrl}/bus/assignments`, { headers: { Cookie: teacherACookie } });
  assert.equal(teacherAssignments.status, 403);

  const forbiddenWrite = await fetch(`${baseUrl}/school/transport`, {
    method: 'POST', headers: headers(teacherACookie),
    body: JSON.stringify({ name: 'Unauthorized route', driverName: 'Teacher', stops: [], feeAmount: 0, active: true })
  });
  assert.equal(forbiddenWrite.status, 403);

  const crossSchoolRead = await fetch(`${baseUrl}/school/transport?schoolId=${schoolB.id}`, {
    headers: { Cookie: adminACookie }
  });
  assert.equal(crossSchoolRead.status, 403);
});
