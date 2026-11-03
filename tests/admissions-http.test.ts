import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'admissions-test@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
const storage = await import('../src/server/storage.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();
const today = new Date().toISOString().slice(0, 10);
const school = storage.db.createSchool({ name: 'Admissions Test', code: 'ADMIT', address: '', city: '', phone: '', email: 'admissions-school@example.test', currency: 'USD', academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false, subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: today, validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false } } as any);
const admin = storage.db.createUser({ schoolId: school.id, role: 'school_admin', fullName: 'Admissions Admin', email: 'admissions-admin@example.test', passwordHash: '', isBlocked: false } as any);
const klass = storage.db.createClass({ schoolId: school.id, name: 'Grade 1', gradeLevel: 1, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
await storage.db.flush();

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Admissions HTTP test server failed to bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const token = (await import('../src/server/auth-security.ts')).createSignedSessionToken({ sessionId: 'admissions-session', userId: admin.id, role: 'school_admin', schoolId: school.id, createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
memory.rows('user_sessions').push({ id: 'admissions-session', userId: admin.id, userRole: 'school_admin', schoolId: school.id, ipAddress: '127.0.0.1', userAgent: 'test', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), lastActivityAt: new Date().toISOString() });
const headers = { Cookie: `schoolos_session=${token}`, 'Content-Type': 'application/json' };
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('admissions create, reject and approve flows persist; approval enrolls once and is audited', async () => {
  const post = (body: Record<string, unknown>) => fetch(`${baseUrl}/school/admissions`, { method: 'POST', headers, body: JSON.stringify(body) });
  const first = await post({ firstName: 'Pending', lastName: 'Applicant', gender: 'female', gradeApplying: 'Grade 1', classId: klass.id, fatherPhone: '+15550007001', motherPhone: '' });
  assert.equal(first.status, 201);
  const firstRow = await first.json();
  const rejected = await fetch(`${baseUrl}/school/admissions/${firstRow.id}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'rejected' }) });
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).status, 'rejected');

  const second = await post({ firstName: 'Approved', lastName: 'Applicant', gender: 'male', gradeApplying: 'Grade 1', classId: klass.id, fatherPhone: '+15550007002', motherPhone: '' });
  assert.equal(second.status, 201, await second.clone().text());
  const secondRow = await second.json();
  assert.ok(secondRow.id);
  const approved = await fetch(`${baseUrl}/school/admissions/${secondRow.id}/approve`, { method: 'POST', headers });
  assert.equal(approved.status, 200);
  const result = await approved.json();
  assert.equal(memory.rows('admission_applications').length, 2);
  assert.equal(memory.rows('admission_applications').some(row => row.id === secondRow.id), true);
  assert.equal(result.application.status, 'approved');
  assert.match(result.student.studentId, /^STD-ADMIT-/);
  assert.ok(result.student.initialPin);
  assert.equal(memory.rows('students').filter(row => row.school_id === school.id || row.schoolId === school.id).length, 1);
  assert.equal((await fetch(`${baseUrl}/school/admissions`, { headers }).then(response => response.json())).length, 2);
  const duplicateApproval = await fetch(`${baseUrl}/school/admissions/${secondRow.id}/approve`, { method: 'POST', headers });
  assert.equal(duplicateApproval.status, 409, `${await duplicateApproval.text()} rows=${JSON.stringify(memory.rows('admission_applications').map(row => ({ id: row.id, schoolId: row.school_id, status: row.status })))}`);
  assert.equal(memory.rows('audit_logs').filter(row => String(row.action).startsWith('ADMISSION_APPLICATION_')).length, 4);

  const concurrent = await post({ firstName: 'Concurrent', lastName: 'Applicant', gender: 'female', gradeApplying: 'Grade 1', classId: klass.id, fatherPhone: '+15550007003', motherPhone: '' });
  assert.equal(concurrent.status, 201);
  const concurrentRow = await concurrent.json();
  const attempts = await Promise.all([
    fetch(`${baseUrl}/school/admissions/${concurrentRow.id}/approve`, { method: 'POST', headers }),
    fetch(`${baseUrl}/school/admissions/${concurrentRow.id}/approve`, { method: 'POST', headers })
  ]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409]);
  assert.equal(memory.rows('students').filter(row => row.student_id === `STD-${school.code}-${concurrentRow.id.slice(-8).toUpperCase()}` || row.studentId === `STD-${school.code}-${concurrentRow.id.slice(-8).toUpperCase()}`).length, 1);
});
