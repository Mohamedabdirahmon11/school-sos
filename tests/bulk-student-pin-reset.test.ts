import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { createHttpTestStorage, InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');

const memory = new InMemorySupabase();
const { hashPassword, hashPin, createSignedSessionToken } = await import('../src/server/auth-security.ts');
const admin = {
  id: 'pin-reset-admin', role: 'school_admin', schoolId: 'pin-reset-school',
  fullName: 'PIN Reset Admin', email: 'pin-reset@example.test',
  passwordHash: hashPassword('test-password'), isBlocked: false, failedLoginAttempts: 0
};
const teacher = {
  id: 'pin-reset-teacher', role: 'teacher', schoolId: 'pin-reset-school',
  fullName: 'PIN Reset Teacher', email: 'pin-teacher@example.test',
  passwordHash: hashPassword('test-password'), isBlocked: false, failedLoginAttempts: 0
};
await memory.from('users').insert([
  admin,
  teacher,
  { id: 'usr-student-std-pin-1', schoolId: admin.schoolId, role: 'student', fullName: 'Ayaan Ali', studentId: 'STD-PIN-001', pinHash: hashPin('1111'), failedLoginAttempts: 3, lockedUntil: new Date(Date.now() + 60_000).toISOString() },
  { id: 'usr-student-std-pin-2', schoolId: admin.schoolId, role: 'student', fullName: 'Omar Ali', studentId: 'STD-PIN-002', pinHash: hashPin('2222'), failedLoginAttempts: 0 },
  { id: 'usr-parent-pin-1', schoolId: admin.schoolId, role: 'parent', fullName: 'Parent Ali', phone: '+252611111111', linkedStudentIds: ['std-pin-1'], pinHash: hashPin('3333') }
]);
await memory.from('schools').insert([
  { id: admin.schoolId, code: 'PIN', name: 'PIN Reset School', subscription: { status: 'active' } },
  { id: 'other-school', code: 'OTH', name: 'Other School', subscription: { status: 'active' } }
]);
await memory.from('school_subscriptions').insert([
  { id: admin.schoolId, schoolId: admin.schoolId, plan: 'basic', cadence: 'yearly', status: 'active', startDate: new Date().toISOString(), validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
]);
await memory.from('students').insert([
  { id: 'std-pin-1', schoolId: admin.schoolId, studentId: 'STD-PIN-001', firstName: 'Ayaan', middleName: '', lastName: 'Ali', pinHash: hashPin('1111'), status: 'active' },
  { id: 'std-pin-2', schoolId: admin.schoolId, studentId: 'STD-PIN-002', firstName: 'Omar', middleName: '', lastName: 'Ali', pinHash: hashPin('2222'), status: 'active' },
  { id: 'std-other-1', schoolId: 'other-school', studentId: 'STD-OTHER-001', firstName: 'Other', lastName: 'Student', pinHash: hashPin('4444'), status: 'active' }
]);

createHttpTestStorage(memory);
const { apiRouter } = await import('../src/server/api.ts');
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', apiRouter);
let server: ReturnType<typeof app.listen>;
let baseUrl = '';

before(async () => {
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP test server did not bind.');
  baseUrl = `http://127.0.0.1:${address.port}/api`;
});
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

function tokenFor(user: typeof admin | typeof teacher) {
  const sessionId = `session-${user.id}`;
  memory.rows('user_sessions').push({
    id: sessionId, userId: user.id, userRole: user.role, schoolId: user.schoolId,
    ipAddress: '', userAgent: '', createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), lastActivityAt: new Date().toISOString()
  });
  return createSignedSessionToken({
    sessionId, userId: user.id, role: user.role, schoolId: user.schoolId,
    createdAt: Date.now(), expiresAt: Date.now() + 60_000
  });
}

async function reset(user: typeof admin | typeof teacher, rows: any[], headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/students/bulk-reset-pin`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${tokenFor(user)}`, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ rows })
  });
  return { response, body: await response.json() as any };
}

test('bulk reset assigns unique four-digit PINs atomically and updates student accounts only', async () => {
  const parentPinBefore = memory.rows('users').find(row => row.id === 'usr-parent-pin-1')?.pinHash;
  const { response, body } = await reset(admin, [
    { studentId: 'STD-PIN-001', pin: '2468' },
    { studentId: 'STD-PIN-002' }
  ]);
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.updatedCount, 2);
  assert.equal(body.pinSlips.length, 2);
  assert.equal(body.pinSlips[0].newPin, '2468');
  assert.match(body.pinSlips[1].newPin, /^\\d{4}$/);
  assert.notEqual(body.pinSlips[0].newPin, body.pinSlips[1].newPin);
  const studentOne = memory.rows('students').find(row => row.studentId === 'STD-PIN-001');
  const studentTwo = memory.rows('students').find(row => row.studentId === 'STD-PIN-002');
  assert.equal(studentOne?.pinHash, hashPin('2468'));
  assert.equal(studentTwo?.pinHash, hashPin(body.pinSlips[1].newPin));
  const studentUser = memory.rows('users').find(row => row.id === 'usr-student-std-pin-1');
  assert.equal(studentUser?.pinHash, hashPin('2468'));
  assert.equal(studentUser?.failedLoginAttempts, 0);
  assert.equal(studentUser?.lockedUntil, null);
  assert.equal(memory.rows('users').find(row => row.id === 'usr-parent-pin-1')?.pinHash, parentPinBefore);
  assert.equal(memory.rows('audit_logs').filter(row => row.action === 'STUDENT_BULK_PIN_RESET').length, 1);
  assert.equal(JSON.stringify(memory.rows('students')).includes(body.pinSlips[0].newPin), false);
});

test('bulk reset rejects invalid PINs, duplicate IDs, and students from another school without partial changes', async () => {
  const before = memory.rows('students').find(row => row.studentId === 'STD-PIN-001')?.pinHash;
  const invalid = await reset(admin, [{ studentId: 'STD-PIN-001', pin: '12' }]);
  assert.equal(invalid.response.status, 400);
  const duplicate = await reset(admin, [
    { studentId: 'STD-PIN-001', pin: '1234' },
    { studentId: 'STD-PIN-001', pin: '5678' }
  ]);
  assert.equal(duplicate.response.status, 400);
  const crossSchool = await reset(admin, [{ studentId: 'STD-OTHER-001', pin: '5678' }]);
  assert.equal(crossSchool.response.status, 400);
  assert.equal(memory.rows('students').find(row => row.studentId === 'STD-PIN-001')?.pinHash, before);
  assert.equal(memory.rows('students').find(row => row.studentId === 'STD-OTHER-001')?.pinHash, hashPin('4444'));
});

test('teachers cannot bulk reset student PINs', async () => {
  const { response } = await reset(teacher, [{ studentId: 'STD-PIN-001' }]);
  assert.equal(response.status, 403);
});
