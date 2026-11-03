import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'communication-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();
const school = storage.db.createSchool({
  name: 'Communication Test School', code: 'COMMS', address: '', city: '', phone: '',
  email: 'communication@example.test', currency: 'ETB', academicYear: '2026-2027',
  currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
  subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: new Date().toISOString(), validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
} as any);
const admin = storage.db.createUser({ schoolId: school.id, role: 'school_admin', fullName: 'Test School Admin', email: 'communication-admin@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);
const teacher = storage.db.createUser({ schoolId: school.id, role: 'teacher', fullName: 'Test Teacher', email: 'communication-teacher@example.test', passwordHash: '', isBlocked: false, failedLoginAttempts: 0 } as any);

function cookieFor(user: any, sessionId: string) {
  const expiresAt = Date.now() + 60_000;
  storage.db.createSession({ id: sessionId, userId: user.id, userRole: user.role, schoolId: school.id, ipAddress: '127.0.0.1', userAgent: 'communication-test', createdAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString() });
  return `schoolos_session=${auth.createSignedSessionToken({ sessionId, userId: user.id, role: user.role, schoolId: school.id, createdAt: Date.now(), expiresAt })}`;
}
const adminCookie = cookieFor(admin, 'communication-admin-session');
const teacherCookie = cookieFor(teacher, 'communication-teacher-session');
const app = express(); app.use(express.json()); app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts'); app.use('/api', apiRouter);
const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('Communication test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const adminHeaders = { Cookie: adminCookie, 'Content-Type': 'application/json' };
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('communication gateway secrets are never returned and tenant identity cannot be overridden', async () => {
  const saved = await fetch(`${baseUrl}/communication/settings`, { headers: { Cookie: adminCookie } });
  assert.equal(saved.status, 200);
  const initial = await saved.json() as any;
  assert.equal(Object.hasOwn(initial, 'apiKey'), false);
  assert.equal(Object.hasOwn(initial, 'apiSecret'), false);

  const update = await fetch(`${baseUrl}/communication/settings`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({
      id: 'forged-id', schoolId: 'another-school', updatedAt: '2000-01-01T00:00:00Z',
      provider: 'twilio', isActive: true, apiKey: 'private-account-key',
      apiSecret: 'private-auth-token', senderId: 'SCHOOL'
    })
  });
  assert.equal(update.status, 200);
  const result = await update.json() as any;
  assert.equal(result.schoolId, school.id);
  assert.equal(result.id, initial.id);
  assert.equal(result.apiKeyConfigured, true);
  assert.equal(result.apiSecretConfigured, true);
  assert.equal(Object.hasOwn(result, 'apiKey'), false);
  assert.equal(Object.hasOwn(result, 'apiSecret'), false);

  const stored = await storage.db.getCommunicationSettings(school.id);
  assert.equal(stored.apiKey, 'private-account-key');
  assert.equal(stored.apiSecret, 'private-auth-token');
  const reread = await fetch(`${baseUrl}/communication/settings`, { headers: { Cookie: adminCookie } });
  const rereadBody = await reread.json() as any;
  assert.equal(Object.hasOwn(rereadBody, 'apiKey'), false);
  assert.equal(Object.hasOwn(rereadBody, 'apiSecret'), false);
});

test('only school administrators can read gateway settings and recipient queue', async () => {
  const settings = await fetch(`${baseUrl}/communication/settings`, { headers: { Cookie: teacherCookie } });
  const queue = await fetch(`${baseUrl}/communication/queue`, { headers: { Cookie: teacherCookie } });
  assert.equal(settings.status, 403);
  assert.equal(queue.status, 403);
});

test('notification requests are validated and never marked sent without a delivery worker', async () => {
  const invalid = await fetch(`${baseUrl}/communication/send`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ recipientPhone: 'bad', recipientName: 'Parent', messageType: 'custom', channel: 'sms', content: 'Hello' })
  });
  assert.equal(invalid.status, 400);

  const queued = await fetch(`${baseUrl}/communication/send`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      schoolId: 'another-school', status: 'sent', sentAt: new Date().toISOString(),
      recipientPhone: '+251911234567', recipientName: 'Parent',
      messageType: 'custom', channel: 'sms', content: 'School notice'
    })
  });
  assert.equal(queued.status, 201);
  const item = await queued.json() as any;
  assert.equal(item.schoolId, school.id);
  assert.equal(item.status, 'queued');
  assert.equal(item.sentAt, undefined);
  assert.match(item.errorMessage, /has not been sent/i);
});
