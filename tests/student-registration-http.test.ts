import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { createHttpTestStorage, InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
const memory = new InMemorySupabase();
const { hashPassword, hashPin, verifyPin, createSignedSessionToken } = await import('../src/server/auth-security.ts');
const admin = {
  id: 'student-admin', role: 'school_admin', schoolId: 'student-school',
  fullName: 'Student Admin', email: 'student-admin@example.test',
  passwordHash: hashPassword('test-password'), isBlocked: false, failedLoginAttempts: 0
};
await memory.from('users').insert([admin]);
await memory.from('schools').insert([{ id: 'student-school', code: 'STU', name: 'Student School', subscription: { status: 'active' } }]);
await memory.from('school_subscriptions').insert([{
  id: 'student-school', schoolId: 'student-school', plan: 'basic', cadence: 'yearly',
  status: 'active', startDate: new Date().toISOString(), validUntil: '2099-12-31',
  graceDays: 7, pricePaid: 0, autoRenew: false
}]);
await memory.from('classes').insert([{
  id: 'student-class-1', school_id: 'student-school', schoolId: 'student-school',
  name: 'Grade 1', section: 'A', capacity: 20, is_archived: false, isArchived: false,
  branch_id: null, branchId: null
}]);
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

function adminCookie() {
  const sessionId = 'student-admin-session';
  memory.rows('user_sessions').push({
    id: sessionId, userId: admin.id, userRole: admin.role, schoolId: admin.schoolId,
    ipAddress: '', userAgent: '', createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(), lastActivityAt: new Date().toISOString()
  });
  return createSignedSessionToken({
    sessionId, userId: admin.id, role: admin.role, schoolId: admin.schoolId,
    createdAt: Date.now(), expiresAt: Date.now() + 60_000
  });
}

test('student registration generates IDs server-side and reuses one normalized guardian account', async () => {
  const cookie = adminCookie();
  const register = (studentName: string, guardianPhone: string, studentId: string, motherPhone = '') => fetch(`${baseUrl}/students`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${cookie}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: studentName.split(' ')[0], middleName: studentName.split(' ')[1],
      lastName: studentName.split(' ')[2], gender: 'female', admissionDate: '2026-11-14',
      classId: 'student-class-1', section: 'A', guardianName: 'Amina Yusuf',
      guardianPhone, motherPhone, address: 'Jijiga', studentId
    })
  });

  const firstResponse = await register('Hodan Amina Noor', '+251911234567', 'CLIENT-SUPPLIED-001', '+251912345678');
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json() as any;
  assert.match(first.studentId, /^S\d{3,}$/);
  assert.notEqual(first.studentId, 'CLIENT-SUPPLIED-001');
  assert.match(first.initialPin, /^\d{6}$/);
  const firstStudent = memory.rows('students').find(row => row.student_id === first.studentId);
  assert.ok(firstStudent);
  assert.equal(firstStudent.address, 'Jijiga');
  assert.equal(firstStudent.father_name, 'Amina Yusuf');
  assert.equal(firstStudent.mother_phone, '+251912345678');
  assert.equal(verifyPin(first.initialPin, firstStudent.pin_hash), true);
  assert.equal(String(firstStudent.pin_hash).includes(first.initialPin), false);

  const parent = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school' && String(row.phone || '').replace(/[^0-9]/g, '') === '251911234567');
  const motherParent = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school' && String(row.phone || '').replace(/[^0-9]/g, '') === '251912345678');
  assert.ok(parent && motherParent);
  const originalParentPinHash = parent.pin_hash;
  assert.equal(motherParent.linked_student_ids.length, 1);
  assert.equal(motherParent.linked_student_ids[0], firstStudent.id);

  const secondResponse = await register('Abdi Yusuf Noor', '+251-911-234-567', 'CLIENT-SUPPLIED-002');
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json() as any;
  assert.notEqual(second.studentId, first.studentId);
  const parents = memory.rows('users').filter(row => row.role === 'parent' && row.school_id === 'student-school');
  assert.equal(parents.length, 2);
  assert.equal(parent.pin_hash, originalParentPinHash);
  assert.equal(parent.linked_student_ids.length, 2);
  assert.equal(memory.rows('students').filter(row => row.school_id === 'student-school').length, 2);
});


test('bulk student PIN reset returns one-time PINs and stores hashes for the selected school students only', async () => {
  const studentId = 'PIN-RESET-TEST-001';
  const initialStudentHash = hashPin('1234');
  const initialUserHash = hashPin('5678');
  await memory.from('students').insert([{
    id: 'pin-reset-student-record', school_id: 'student-school', student_id: studentId,
    first_name: 'Muna', middle_name: 'Amina', last_name: 'Hassan',
    class_id: 'student-class-1', section: 'A', status: 'active', pin_hash: initialStudentHash
  }]);
  await memory.from('users').insert([{
    id: 'usr-student-pin-reset-test', school_id: 'student-school', role: 'student',
    full_name: 'Muna Amina Hassan', student_id: studentId, pin_hash: initialUserHash,
    failed_login_attempts: 4
  }]);
  const parent = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school');
  const parentPinHash = parent?.pin_hash;
  const cookie = adminCookie();

  const response = await fetch(`${baseUrl}/students/bulk-reset-pin`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${cookie}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: [{ studentId }] })
  });
  assert.equal(response.status, 200);
  const result = await response.json() as any;
  assert.equal(result.success, true);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.pinSlips.length, 1);
  assert.equal(result.pinSlips[0].studentId, studentId);
  assert.equal(result.pinSlips[0].studentName, 'Muna Amina Hassan');
  assert.match(result.pinSlips[0].newPin, /^[0-9]{6}$/);

  const student = memory.rows('students').find(row => row.student_id === studentId);
  const studentUser = memory.rows('users').find(row => row.student_id === studentId && row.role === 'student');
  assert.ok(student?.pin_hash);
  assert.ok(studentUser?.pin_hash);
  assert.equal(verifyPin(result.pinSlips[0].newPin, student.pin_hash), true);
  assert.equal(verifyPin(result.pinSlips[0].newPin, studentUser.pin_hash), true);
  assert.notEqual(student.pin_hash, initialStudentHash);
  assert.notEqual(studentUser.pin_hash, initialUserHash);
  assert.equal(parent?.pin_hash, parentPinHash);
  assert.equal(Object.hasOwn(student, 'pin'), false);
  assert.equal(Object.hasOwn(studentUser, 'pin'), false);
});


test('student ID and normalized parent phone logins are school-scoped and require temporary PIN rotation', async () => {
  const student = memory.rows('students').find(row => row.student_id === 'S001');
  const studentUser = memory.rows('users').find(row => row.role === 'student' && row.student_id === 'S001');
  const parentUser = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school');
  assert.ok(student && studentUser && parentUser);
  const temporaryPin = '654321';
  student.pin_hash = hashPin(temporaryPin);
  studentUser.pin_hash = hashPin(temporaryPin);
  parentUser.pin_hash = hashPin(temporaryPin);
  studentUser.must_change_password = true;
  parentUser.must_change_password = true;

  const login = (payload: Record<string, unknown>) => fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const studentLogin = await login({ role: 'student', schoolCode: 'STU', studentId: 's001', pin: temporaryPin });
  assert.equal(studentLogin.status, 200);
  const studentResult = await studentLogin.json() as any;
  assert.equal(studentResult.requirePinChange, true);
  assert.ok(studentResult.challengeToken);

  const parentLogin = await login({ role: 'parent', schoolCode: 'STU', phone: '+251-911-234-567', pin: temporaryPin });
  assert.equal(parentLogin.status, 200);
  const parentResult = await parentLogin.json() as any;
  assert.equal(parentResult.requirePinChange, true);
  assert.ok(parentResult.challengeToken);

  const changePin = (challengeToken: string, newPin: string) => fetch(`${baseUrl}/auth/change-pin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${challengeToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPin })
  });
  const weakPin = await changePin(studentResult.challengeToken, '123456');
  assert.equal(weakPin.status, 400);
  const unchangedPin = await changePin(studentResult.challengeToken, temporaryPin);
  assert.equal(unchangedPin.status, 400);
  const studentPinChanged = await changePin(studentResult.challengeToken, '765432');
  assert.equal(studentPinChanged.status, 200);
  assert.equal(studentUser.must_change_password, false);
  assert.equal(verifyPin('765432', studentUser.pin_hash), true);
  assert.equal(verifyPin('765432', student.pin_hash), true);

  const parentPinChanged = await changePin(parentResult.challengeToken, '876543');
  assert.equal(parentPinChanged.status, 200);
  assert.equal(parentUser.must_change_password, false);
  assert.equal(verifyPin('876543', parentUser.pin_hash), true);
  assert.equal(verifyPin('765432', parentUser.pin_hash), false);

  const wrongSchoolLogin = await login({ role: 'student', schoolCode: 'OTH', studentId: 'S001', pin: temporaryPin });
  assert.equal(wrongSchoolLogin.status, 401);
  const invalidPinLogin = await login({ role: 'student', schoolCode: 'STU', studentId: 'S001', pin: '000000' });
  assert.equal(invalidPinLogin.status, 401);
});


test('parent child selection is persisted in the signed session and rejects unlinked children and role mismatches', async () => {
  const parent = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school' && String(row.phone || '').replace(/[^0-9]/g, '') === '251911234567');
  const studentUser = memory.rows('users').find(row => row.role === 'student' && row.student_id === 'S001');
  const student = memory.rows('students').find(row => row.student_id === 'S001');
  assert.ok(parent && studentUser && student);
  parent.must_change_password = false;
  studentUser.must_change_password = false;

  const makeSession = (userId: string, role: 'student' | 'parent', id: string) => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    memory.rows('user_sessions').push({
      id, userId, userRole: role, schoolId: 'student-school',
      ipAddress: '', userAgent: '', createdAt: new Date().toISOString(),
      expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString()
    });
    return createSignedSessionToken({ sessionId: id, userId, role, schoolId: 'student-school', createdAt: Date.now(), expiresAt });
  };
  const parentToken = makeSession(parent.id, 'parent', 'parent-selection-session');
  const select = (token: string, studentId: string) => fetch(`${baseUrl}/parent/select-child`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId })
  });

  const selected = await select(parentToken, student.id);
  assert.equal(selected.status, 200);
  const selectedBody = await selected.json() as any;
  assert.equal(selectedBody.selectedStudentId, student.id);
  const setCookies = (selected.headers as any).getSetCookie?.() || [];
  const latestCookie = setCookies.at(-1) || '';
  const sessionToken = /schoolos_session=([^;]+)/.exec(latestCookie)?.[1];
  assert.ok(sessionToken);
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `schoolos_session=${sessionToken}` } });
  assert.equal(me.status, 200);
  const meBody = await me.json() as any;
  assert.equal(meBody.selectedStudentId, student.id);

  await memory.from('students').insert([{
    id: 'unlinked-student', school_id: 'student-school', student_id: 'ST-UNLINKED',
    first_name: 'Unlinked', last_name: 'Student', class_id: 'student-class-1', status: 'active'
  }]);
  const forbiddenChild = await select(parentToken, 'unlinked-student');
  assert.equal(forbiddenChild.status, 403);

  const studentToken = makeSession(studentUser.id, 'student', 'student-selection-session');
  const wrongRole = await select(studentToken, student.id);
  assert.equal(wrongRole.status, 403);
  const parentOnStudentEndpoint = await fetch(`${baseUrl}/student/me`, {
    headers: { Cookie: `schoolos_session=${parentToken}` }
  });
  assert.equal(parentOnStudentEndpoint.status, 403);
});


test('parent PIN reset and phone replacement are administrator-only and audited', async () => {
  const parent = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school' && String(row.phone || '').replace(/[^0-9]/g, '') === '251911234567');
  assert.ok(parent);
  const cookie = adminCookie();
  const reset = await fetch(`${baseUrl}/parents/${parent.id}/reset-pin`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${cookie}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(reset.status, 200);
  const resetBody = await reset.json() as any;
  assert.match(resetBody.newPin, /^\d{6}$/);
  assert.equal(parent.must_change_password, true);
  assert.equal(verifyPin(resetBody.newPin, parent.pin_hash), true);

  const duplicatePhone = await fetch(`${baseUrl}/parents/${parent.id}/phone`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${cookie}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+251912345678' })
  });
  assert.equal(duplicatePhone.status, 409);

  const changedPhone = await fetch(`${baseUrl}/parents/${parent.id}/phone`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${cookie}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+251913333333' })
  });
  assert.equal(changedPhone.status, 200);
  const updated = memory.rows('users').find(row => row.id === parent.id);
  assert.equal(updated?.phone, '+251913333333');
  assert.ok(memory.rows('audit_logs').some(row => row.action === 'PARENT_PHONE_CHANGED'));
  assert.ok(memory.rows('audit_logs').some(row => row.action === 'PARENT_PIN_RESET'));
});


test('legacy student and parent identifiers without administrator-provisioned accounts cannot auto-create portal users', async () => {
  await memory.from('students').insert([{
    id: 'legacy-no-portal-account',
    school_id: 'student-school',
    student_id: 'ST-LEGACY-NO-ACCOUNT',
    first_name: 'Legacy',
    last_name: 'Student',
    father_phone: '+251922222222',
    class_id: 'student-class-1',
    status: 'active',
    pin_hash: hashPin('654321')
  }]);
  const login = (payload: Record<string, unknown>) => fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const studentBefore = memory.rows('users').filter(row => row.role === 'student' && row.student_id === 'ST-LEGACY-NO-ACCOUNT').length;
  const studentLogin = await login({ role: 'student', schoolCode: 'STU', studentId: 'ST-LEGACY-NO-ACCOUNT', pin: '654321' });
  assert.equal(studentLogin.status, 401);
  assert.equal((await studentLogin.json() as any).error, 'ID or PIN is incorrect.');
  assert.equal(memory.rows('users').filter(row => row.role === 'student' && row.student_id === 'ST-LEGACY-NO-ACCOUNT').length, studentBefore);

  const parentBefore = memory.rows('users').filter(row => row.role === 'parent' && String(row.phone || '').replace(/[^0-9]/g, '') === '251922222222').length;
  const parentLogin = await login({ role: 'parent', schoolCode: 'STU', phone: '+251-922-222-222', pin: '654321' });
  assert.equal(parentLogin.status, 401);
  assert.equal((await parentLogin.json() as any).error, 'ID or PIN is incorrect.');
  assert.equal(memory.rows('users').filter(row => row.role === 'parent' && String(row.phone || '').replace(/[^0-9]/g, '') === '251922222222').length, parentBefore);
});
