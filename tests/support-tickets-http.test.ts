import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'support-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();
const school = storage.db.createSchool({
  name: 'Support Test School', code: 'SUPPORT', address: '', city: '', phone: '',
  email: 'support@example.test', currency: 'ETB', academicYear: '2026-2027',
  currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
  subscription: { plan: 'basic', cadence: 'yearly', status: 'read_only', startDate: new Date().toISOString(), validUntil: '2026-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
} as any);
const admin = storage.db.createUser({ schoolId: school.id, role: 'school_admin', fullName: 'Support Admin', email: 'support-admin@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
const teacherA = storage.db.createUser({ schoolId: school.id, role: 'teacher', fullName: 'Teacher A', email: 'teacher-a-support@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
const teacherB = storage.db.createUser({ schoolId: school.id, role: 'teacher', fullName: 'Teacher B', email: 'teacher-b-support@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
const superAdmin = storage.db.createUser({ role: 'super_admin', fullName: 'Platform Admin', email: 'platform-support@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
const otherSchool = storage.db.createSchool({
  name: 'Other Support School', code: 'SUPPORT-OTHER', address: '', city: '', phone: '',
  email: 'other-support@example.test', currency: 'ETB', academicYear: '2026-2027',
  currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
  subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: new Date().toISOString(), validUntil: '2027-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
} as any);
const teacherOtherSchool = storage.db.createUser({ schoolId: otherSchool.id, role: 'teacher', fullName: 'Other School Teacher', email: 'teacher-other-support@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);

function cookieFor(user: any, sessionId: string) {
  const expiresAt = Date.now() + 60_000;
  const sessionSchoolId = user.schoolId;
  storage.db.createSession({ id: sessionId, userId: user.id, userRole: user.role, schoolId: sessionSchoolId, ipAddress: '127.0.0.1', userAgent: 'support-test', createdAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString() });
  return `schoolos_session=${auth.createSignedSessionToken({ sessionId, userId: user.id, role: user.role, schoolId: sessionSchoolId, createdAt: Date.now(), expiresAt })}`;
}
const adminCookie = cookieFor(admin, 'support-admin-session');
const teacherACookie = cookieFor(teacherA, 'support-teacher-a-session');
const teacherBCookie = cookieFor(teacherB, 'support-teacher-b-session');
const superAdminCookie = cookieFor(superAdmin, 'support-platform-admin-session');
const teacherOtherSchoolCookie = cookieFor(teacherOtherSchool, 'support-other-school-teacher-session');
const app = express(); app.use(express.json()); app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts'); app.use('/api', apiRouter);
const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Support test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const headers = (cookie: string) => ({ Cookie: cookie, 'Content-Type': 'application/json' });
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('support tickets validate content, bind author metadata, and remain available in read-only schools', async () => {
  const invalid = await fetch(`${baseUrl}/support/tickets`, {
    method: 'POST', headers: headers(teacherACookie),
    body: JSON.stringify({ subject: 'x'.repeat(256), description: 'Help', priority: 'medium' })
  });
  assert.equal(invalid.status, 400);

  const crossSchool = await fetch(`${baseUrl}/support/tickets`, {
    method: 'POST', headers: headers(teacherACookie),
    body: JSON.stringify({ schoolId: 'another-school', subject: 'Help', description: 'Need support', priority: 'medium' })
  });
  assert.equal(crossSchool.status, 403);

  const created = await fetch(`${baseUrl}/support/tickets`, {
    method: 'POST', headers: headers(teacherACookie),
    body: JSON.stringify({
      subject: 'Login support', description: 'Unable to sign in', priority: 'high',
      createdByUserId: 'forged-user', createdByName: 'Fake',
      createdByRole: 'super_admin', status: 'closed', messages: [{ content: 'forged' }]
    })
  });
  assert.equal(created.status, 201);
  const ticketA = await created.json() as any;
  assert.equal(ticketA.schoolId, school.id);
  assert.equal(ticketA.createdByUserId, teacherA.id);
  assert.equal(ticketA.createdByName, teacherA.fullName);
  assert.equal(ticketA.createdByRole, 'teacher');
  assert.equal(ticketA.status, 'open');
  assert.equal(ticketA.messages.length, 1);
  assert.equal(ticketA.messages[0].content, 'Unable to sign in');

  const createdB = await fetch(`${baseUrl}/support/tickets`, {
    method: 'POST', headers: headers(teacherBCookie),
    body: JSON.stringify({ subject: 'Second ticket', description: 'Another issue', priority: 'medium' })
  });
  assert.equal(createdB.status, 201);
  const ticketB = await createdB.json() as any;

  const foreignCreated = await fetch(`${baseUrl}/support/tickets`, {
    method: 'POST', headers: headers(teacherOtherSchoolCookie),
    body: JSON.stringify({ subject: 'Foreign school ticket', description: 'Separate tenant request', priority: 'low' })
  });
  assert.equal(foreignCreated.status, 201);
  const foreignTicket = await foreignCreated.json() as any;

  const ownTickets = await fetch(`${baseUrl}/support/tickets`, { headers: { Cookie: teacherACookie } });
  const ownList = await ownTickets.json() as any[];
  assert.equal(ownList.length, 1);
  assert.equal(ownList[0].id, ticketA.id);
  assert.equal(ownTickets.headers.get('cache-control'), 'no-store');

  const forbiddenStatusChange = await fetch(`${baseUrl}/support/tickets/${ticketA.id}/reply`, {
    method: 'POST', headers: headers(adminCookie), body: JSON.stringify({ content: 'Trying to change status', status: 'closed' })
  });
  assert.equal(forbiddenStatusChange.status, 403);

  const resolved = await fetch(`${baseUrl}/support/tickets/${ticketA.id}/reply`, {
    method: 'POST', headers: headers(superAdminCookie), body: JSON.stringify({ content: 'Issue resolved.', status: 'resolved' })
  });
  assert.equal(resolved.status, 200);
  const resolvedTicket = await resolved.json() as any;
  assert.equal(resolvedTicket.status, 'resolved');

  const invalidStatus = await fetch(`${baseUrl}/support/tickets/${ticketA.id}/reply`, {
    method: 'POST', headers: headers(superAdminCookie), body: JSON.stringify({ content: 'Bad status.', status: 'archived' })
  });
  assert.equal(invalidStatus.status, 400);

  const otherReply = await fetch(`${baseUrl}/support/tickets/${ticketB.id}/reply`, {
    method: 'POST', headers: headers(teacherACookie), body: JSON.stringify({ content: 'Not my ticket' })
  });
  assert.equal(otherReply.status, 404);

  const crossSchoolReply = await fetch(`${baseUrl}/support/tickets/${foreignTicket.id}/reply`, {
    method: 'POST', headers: headers(teacherACookie), body: JSON.stringify({ content: 'Cross-school attempt' })
  });
  assert.equal(crossSchoolReply.status, 404);

  const adminReply = await fetch(`${baseUrl}/support/tickets/${ticketB.id}/reply`, {
    method: 'POST', headers: headers(adminCookie), body: JSON.stringify({ content: 'We are investigating.' })
  });
  assert.equal(adminReply.status, 200);
  const replied = await adminReply.json() as any;
  assert.equal(replied.messages.length, 2);
  assert.equal(replied.messages[1].senderId, admin.id);
});
