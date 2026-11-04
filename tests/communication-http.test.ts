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

  const crossSchoolUpdate = await fetch(`${baseUrl}/communication/settings`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ schoolId: 'another-school', provider: 'none' })
  });
  assert.equal(crossSchoolUpdate.status, 403);

  const update = await fetch(`${baseUrl}/communication/settings`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({
      id: 'forged-id', updatedAt: '2000-01-01T00:00:00Z',
      provider: 'twilio', isActive: true, apiKey: 'private-account-key',
      apiSecret: 'private-auth-token', senderId: 'SCHOOL'
    })
  });
  assert.equal(update.status, 200, await update.clone().text());
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

test('direct messages enforce role pairing, participant scope and bounded storage', async () => {
  const invalidRole = await fetch(`${baseUrl}/messages`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ recipientId: teacher.id, content: 'x'.repeat(5001) })
  });
  assert.equal(invalidRole.status, 400);

  const created = await fetch(`${baseUrl}/messages`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ recipientId: teacher.id, content: 'Please review the attendance report.' })
  });
  assert.equal(created.status, 201, await created.clone().text());
  const message = await created.json() as any;
  assert.equal(message.schoolId, school.id);
  assert.equal(message.senderId, admin.id);
  assert.equal(message.recipientId, teacher.id);
  assert.equal(message.isRead, false);
  assert.match(message.id, /^msg-[0-9a-f-]{36}$/i);

  const forbiddenPair = await fetch(`${baseUrl}/messages`, {
    method: 'POST', headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientId: admin.id, content: 'This role pairing is not allowed.' })
  });
  assert.equal(forbiddenPair.status, 403);

  const selfMessage = await fetch(`${baseUrl}/messages`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ recipientId: admin.id, content: 'Do not send to self.' })
  });
  assert.equal(selfMessage.status, 404);

  const read = await fetch(`${baseUrl}/messages/read`, {
    method: 'POST', headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId: admin.id })
  });
  assert.equal(read.status, 200);
  const teacherMessages = await storage.db.getMessages(school.id, teacher.id);
  assert.equal(teacherMessages.find((item: any) => item.id === message.id)?.isRead, true);

  assert.throws(() => storage.db.sendMessage({
    schoolId: school.id, senderId: admin.id, senderName: admin.fullName, senderRole: 'school_admin',
    recipientId: teacher.id, recipientName: teacher.fullName, recipientRole: 'teacher', content: 'x'.repeat(5001)
  } as any), /Direct message details are invalid/);
});

test('notices accept only bounded content and authenticated author metadata', async () => {
  const invalid = await fetch(`${baseUrl}/notices`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ title: 'x'.repeat(256), content: 'notice', audience: 'all' })
  });
  assert.equal(invalid.status, 400);

  const invalidDate = await fetch(`${baseUrl}/notices`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ title: 'Date format', content: 'Notice', audience: 'all', publishDate: new Date().toISOString() })
  });
  assert.equal(invalidDate.status, 400);

  const created = await fetch(`${baseUrl}/notices`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      id: 'forged-notice', schoolId: 'another-school', title: 'School meeting',
      content: 'Meeting at 9 AM', audience: 'all', authorName: 'Fake Author',
      authorRole: 'super_admin', isActive: false, isPinned: false,
      publishDate: new Date().toISOString().slice(0, 10)
    })
  });
  assert.equal(created.status, 403);
  const valid = await fetch(`${baseUrl}/notices`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      id: 'forged-notice', title: 'School meeting', content: 'Meeting at 9 AM',
      audience: 'all', authorName: 'Fake Author', authorRole: 'super_admin',
      isActive: false, isPinned: false, publishDate: new Date().toISOString().slice(0, 10)
    })
  });
  assert.equal(valid.status, 201);
  const notice = await valid.json() as any;
  assert.notEqual(notice.id, 'forged-notice');
  assert.equal(notice.schoolId, school.id);
  assert.equal(notice.authorName, admin.fullName);
  assert.equal(notice.authorRole, 'school_admin');
  assert.equal(notice.isActive, true);

  const invalidUpdate = await fetch(`${baseUrl}/notices/${notice.id}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ title: 'Updated', content: 'Updated content', audience: 'all', isPinned: 'false' })
  });
  assert.equal(invalidUpdate.status, 400);
  const update = await fetch(`${baseUrl}/notices/${notice.id}`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ title: 'Updated', content: 'Updated content', audience: 'all', isPinned: false, publishDate: new Date().toISOString().slice(0, 10) })
  });
  assert.equal(update.status, 200);
});

test('only school administrators can read gateway settings and recipient queue', async () => {
  const settings = await fetch(`${baseUrl}/communication/settings`, { headers: { Cookie: teacherCookie } });
  const queue = await fetch(`${baseUrl}/communication/queue`, { headers: { Cookie: teacherCookie } });
  assert.equal(settings.status, 403);
  assert.equal(queue.status, 403);
});

test('configured Twilio sends SMS and WhatsApp and records only provider acceptance', async () => {
  const accountSid = 'AC0123456789abcdef0123456789abcdef';
  const authToken = 'test-auth-token';
  const originalFetch = globalThis.fetch;
  const providerRequests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://api.twilio.com/')) {
      providerRequests.push({ url, init });
      const body = String(init?.body || '');
      if (body.includes('Body=provider-rejects')) {
        return new Response(JSON.stringify({ message: 'private provider response must not leak' }), {
          status: 400, headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ sid: 'SM0123456789abcdef0123456789abcdef', status: 'queued' }), {
        status: 201, headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const configured = await fetch(`${baseUrl}/communication/settings`, {
      method: 'PUT', headers: adminHeaders,
      body: JSON.stringify({
        provider: 'twilio', isActive: true, apiKey: accountSid,
        apiSecret: authToken, senderId: '+15005550006'
      })
    });
    assert.equal(configured.status, 200);

    const sms = await fetch(`${baseUrl}/communication/send`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        recipientPhone: '+251911234567', recipientName: 'Parent',
        messageType: 'custom', channel: 'sms', content: 'Attendance reminder'
      })
    });
    assert.equal(sms.status, 201, await sms.clone().text());
    const smsItem = await sms.json() as any;
    assert.equal(smsItem.status, 'sent');
    assert.ok(smsItem.sentAt);
    const smsForm = new URLSearchParams(String(providerRequests[0]?.init?.body));
    assert.equal(smsForm.get('To'), '+251911234567');
    assert.equal(smsForm.get('From'), '+15005550006');
    assert.equal(smsForm.get('Body'), 'Attendance reminder');
    assert.equal((providerRequests[0]?.init?.headers as any)?.Authorization,
      `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`);

    const whatsapp = await fetch(`${baseUrl}/communication/send`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        recipientPhone: '+251911234567', recipientName: 'Parent',
        messageType: 'custom', channel: 'whatsapp', content: 'WhatsApp reminder'
      })
    });
    assert.equal(whatsapp.status, 201, await whatsapp.clone().text());
    const whatsappForm = new URLSearchParams(String(providerRequests[1]?.init?.body));
    assert.equal(whatsappForm.get('To'), 'whatsapp:+251911234567');
    assert.equal(whatsappForm.get('From'), 'whatsapp:+15005550006');

    const rejected = await fetch(`${baseUrl}/communication/send`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        recipientPhone: '+251911234567', recipientName: 'Parent',
        messageType: 'custom', channel: 'sms', content: 'provider-rejects'
      })
    });
    assert.equal(rejected.status, 502);
    const failedItem = await rejected.json() as any;
    assert.equal(failedItem.status, 'failed');
    assert.match(failedItem.errorMessage, /HTTP 400/);
    assert.equal(failedItem.errorMessage.includes('private provider response'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('attendance queues and sends one parent alert on the first absent transition', async () => {
  const klass = storage.db.createClass({
    schoolId: school.id, name: 'Grade 1 A', gradeLevel: 1, section: 'A',
    roomNumber: '1', capacity: 30, monthlyFee: 0
  } as any);
  const student = storage.db.createStudent({
    schoolId: school.id, studentId: 'STD-COMMS-001', firstName: 'Amina',
    middleName: '', lastName: 'Test', gender: 'female', admissionDate: '2026-01-01',
    fatherPhone: '+251911234567', classId: klass.id, status: 'active'
  } as any);
  const configured = await fetch(`${baseUrl}/communication/settings`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({
      provider: 'twilio', defaultChannel: 'whatsapp', isActive: true,
      apiKey: 'AC0123456789abcdef0123456789abcdef',
      apiSecret: 'test-auth-token', senderId: '+15005550006'
    })
  });
  assert.equal(configured.status, 200);

  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  const providerBodies: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://api.twilio.com/')) {
      providerCalls += 1;
      providerBodies.push(String(init?.body || ''));
      return new Response(JSON.stringify({ sid: 'SM0123456789abcdef0123456789abcdef' }), {
        status: 201, headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const payload = {
      classId: klass.id, date: '2026-11-03',
      records: [{ studentId: student.id, status: 'absent', note: '' }]
    };
    const first = await fetch(`${baseUrl}/attendance`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(payload)
    });
    assert.equal(first.status, 200, await first.clone().text());
    const firstResult = await first.json() as any;
    assert.equal(firstResult.notifications.sent, 1);
    assert.equal(firstResult.notifications.queued, 0);
    assert.equal(firstResult.notifications.failed, 0);
    assert.equal(providerCalls, 1);
    const attendanceAlert = new URLSearchParams(providerBodies[0]);
    assert.equal(attendanceAlert.get('To'), 'whatsapp:+251911234567');
    assert.equal(attendanceAlert.get('From'), 'whatsapp:+15005550006');

    const second = await fetch(`${baseUrl}/attendance`, {
      method: 'POST', headers: adminHeaders, body: JSON.stringify(payload)
    });
    assert.equal(second.status, 200, await second.clone().text());
    const secondResult = await second.json() as any;
    assert.equal(secondResult.notifications.sent, 0);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notification requests remain queued when no provider is configured', async () => {
  const disabled = await fetch(`${baseUrl}/communication/settings`, {
    method: 'PUT', headers: adminHeaders,
    body: JSON.stringify({ provider: 'none', isActive: false })
  });
  assert.equal(disabled.status, 200);
  const invalid = await fetch(`${baseUrl}/communication/send`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ recipientPhone: 'bad', recipientName: 'Parent', messageType: 'custom', channel: 'sms', content: 'Hello' })
  });
  assert.equal(invalid.status, 400);

  const crossSchoolQueue = await fetch(`${baseUrl}/communication/send`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      schoolId: 'another-school', recipientPhone: '+251911234567', recipientName: 'Parent',
      messageType: 'custom', channel: 'sms', content: 'School notice'
    })
  });
  assert.equal(crossSchoolQueue.status, 403);

  const queued = await fetch(`${baseUrl}/communication/send`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      status: 'sent', sentAt: new Date().toISOString(),
      recipientPhone: '+251911234567', recipientName: 'Parent',
      messageType: 'custom', channel: 'sms', content: 'School notice'
    })
  });
  assert.equal(queued.status, 201, await queued.clone().text());
  const item = await queued.json() as any;
  assert.equal(item.schoolId, school.id);
  assert.equal(item.status, 'queued');
  assert.equal(item.sentAt, undefined);
  assert.match(item.errorMessage, /has not been sent/i);
});
