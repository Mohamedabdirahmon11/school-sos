import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'payroll-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();
const school = storage.db.createSchool({ name: 'Payroll Test School', code: 'PAYROLL', address: '', city: '', phone: '', email: 'payroll@example.test', currency: 'ETB', academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false, subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: new Date().toISOString(), validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false } } as any);
const accountant = storage.db.createUser({ schoolId: school.id, role: 'accountant', fullName: 'Test Accountant', email: 'payroll-accountant@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
storage.db.createStaffMember({ schoolId: school.id, staffId: 'PAY-ACCT', userId: accountant.id, fullName: accountant.fullName, roleTitle: 'Accountant', email: accountant.email!, phone: '', monthlySalary: 800, permissions: [], status: 'active' });
const teacherUser = storage.db.createUser({ schoolId: school.id, role: 'teacher', fullName: 'Test Teacher', email: 'payroll-teacher@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
const teacher = storage.db.createTeacher({ schoolId: school.id, userId: teacherUser.id, staffId: 'PAY-TEACHER', fullName: teacherUser.fullName, email: teacherUser.email!, phone: '+15550009900', gender: 'female', qualification: 'B.Ed', department: 'Science', assignedClasses: [], assignedSubjects: [], status: 'active', joinedDate: '2026-09-01', monthlySalary: 1200 });
const admin = storage.db.createUser({ schoolId: school.id, role: 'school_admin', fullName: 'Test School Admin', email: 'payroll-school-admin@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);

function cookieFor(user: any, sessionId: string) {
  const expiresAt = Date.now() + 60_000;
  storage.db.createSession({ id: sessionId, userId: user.id, userRole: user.role, schoolId: school.id, ipAddress: '127.0.0.1', userAgent: 'payroll-test', createdAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString() });
  return `schoolos_session=${auth.createSignedSessionToken({ sessionId, userId: user.id, role: user.role, schoolId: school.id, createdAt: Date.now(), expiresAt })}`;
}
const accountantCookie = cookieFor(accountant, 'payroll-accountant-session');
const teacherCookie = cookieFor(teacherUser, 'payroll-teacher-session');
const adminCookie = cookieFor(admin, 'payroll-admin-session');
const app = express(); app.use(express.json()); app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts'); app.use('/api', apiRouter);
const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Payroll test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const accountantHeaders = { Cookie: accountantCookie, 'Content-Type': 'application/json' };
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('accountant payroll runs are unique per staff and month, progress through approval/payment, and protect payslips', async () => {
  const month = '2026-11';
  const create = await fetch(`${baseUrl}/payroll`, { method: 'POST', headers: accountantHeaders, body: JSON.stringify({ month, staff: [{ staffId: teacher.id, allowances: [{ label: 'Transport', amount: 100 }], deductions: [{ label: 'Tax', amount: 50 }] }] }) });
  const createBody = await create.text();
  assert.equal(create.status, 201, createBody);
  const [record] = JSON.parse(createBody) as any[];
  assert.equal(record.status, 'draft'); assert.equal(record.baseSalary, 1200); assert.equal(record.netSalary, 1250);
  const duplicate = await fetch(`${baseUrl}/payroll`, { method: 'POST', headers: accountantHeaders, body: JSON.stringify({ month, staff: [{ staffId: teacher.id, allowances: [], deductions: [] }] }) });
  assert.equal(duplicate.status, 409); assert.match((await duplicate.json() as any).error, /already has a payroll record/);

  const ownRecords = await fetch(`${baseUrl}/payroll/mine`, { headers: { Cookie: teacherCookie } });
  assert.equal(ownRecords.status, 200); assert.equal((await ownRecords.json() as any[])[0].id, record.id);
  const otherPayslip = await fetch(`${baseUrl}/payroll/${record.id}/payslip.pdf`, { headers: { Cookie: adminCookie } });
  assert.equal(otherPayslip.status, 403);
  const adminCreate = await fetch(`${baseUrl}/payroll`, { method: 'POST', headers: { Cookie: adminCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ month: '2026-12', staff: [{ staffId: teacher.id }] }) });
  assert.equal(adminCreate.status, 403);

  const approve = await fetch(`${baseUrl}/payroll/${record.id}/approve`, { method: 'POST', headers: accountantHeaders });
  assert.equal(approve.status, 200); assert.equal((await approve.json() as any).status, 'approved');
  const approveAgain = await fetch(`${baseUrl}/payroll/${record.id}/approve`, { method: 'POST', headers: accountantHeaders });
  assert.equal(approveAgain.status, 409);
  const paid = await fetch(`${baseUrl}/payroll/${record.id}/pay`, { method: 'POST', headers: accountantHeaders });
  assert.equal(paid.status, 200); assert.equal((await paid.json() as any).status, 'paid');
  const payslip = await fetch(`${baseUrl}/payroll/${record.id}/payslip.pdf`, { headers: { Cookie: teacherCookie } });
  assert.equal(payslip.status, 200); assert.equal(payslip.headers.get('content-type'), 'application/pdf');
  assert.ok(Buffer.from(await payslip.arrayBuffer()).toString('latin1').includes('ETB'));
});
