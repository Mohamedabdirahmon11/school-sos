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
  const register = (studentName: string, guardianPhone: string, studentId: string) => fetch(`${baseUrl}/students`, {
    method: 'POST',
    headers: { Cookie: `schoolos_session=${cookie}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: studentName.split(' ')[0], middleName: studentName.split(' ')[1],
      lastName: studentName.split(' ')[2], gender: 'female', admissionDate: '2026-11-14',
      classId: 'student-class-1', section: 'A', guardianName: 'Amina Yusuf',
      guardianPhone, address: 'Jijiga', studentId
    })
  });

  const firstResponse = await register('Hodan Amina Noor', '+251911234567', 'CLIENT-SUPPLIED-001');
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json() as any;
  assert.match(first.studentId, /^S\d{3,}$/);
  assert.notEqual(first.studentId, 'CLIENT-SUPPLIED-001');
  assert.match(first.initialPin, /^\d{4}$/);
  const firstStudent = memory.rows('students').find(row => row.student_id === first.studentId);
  assert.ok(firstStudent);
  assert.equal(firstStudent.address, 'Jijiga');
  assert.equal(firstStudent.father_name, 'Amina Yusuf');
  assert.equal(verifyPin(first.initialPin, firstStudent.pin_hash), true);
  assert.equal(String(firstStudent.pin_hash).includes(first.initialPin), false);

  const parent = memory.rows('users').find(row => row.role === 'parent' && row.school_id === 'student-school');
  assert.ok(parent);
  const originalParentPinHash = parent.pin_hash;

  const secondResponse = await register('Abdi Yusuf Noor', '+251-911-234-567', 'CLIENT-SUPPLIED-002');
  assert.equal(secondResponse.status, 201);
  const second = await secondResponse.json() as any;
  assert.notEqual(second.studentId, first.studentId);
  const parents = memory.rows('users').filter(row => row.role === 'parent' && row.school_id === 'student-school');
  assert.equal(parents.length, 1);
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
  assert.match(result.pinSlips[0].newPin, /^[0-9]{4}$/);

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
