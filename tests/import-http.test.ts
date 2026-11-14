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
const admin = { id: 'import-admin', role: 'school_admin', schoolId: 'import-school', fullName: 'Import Admin', email: 'import@example.test', passwordHash: hashPassword('test-password'), isBlocked: false, failedLoginAttempts: 0 };
const teacher = { id: 'import-teacher', role: 'teacher', schoolId: 'import-school', fullName: 'Import Teacher', email: 'teacher-import@example.test', passwordHash: hashPassword('test-password'), isBlocked: false, failedLoginAttempts: 0 };
const readonlyAdmin = { ...admin, id: 'import-readonly-admin', schoolId: 'import-readonly', email: 'readonly-import@example.test' };
await memory.from('users').insert([admin, teacher, readonlyAdmin]);
await memory.from('schools').insert([
  { id: 'import-school', code: 'IMP', name: 'Import School', subscription: { status: 'active' } },
  { id: 'import-readonly', code: 'IMR', name: 'Import Read Only', subscription: { status: 'read_only' } },
  { id: 'import-other', code: 'IMO', name: 'Other School', subscription: { status: 'active' } }
]);
await memory.from('school_subscriptions').insert([
  { id: 'import-school', schoolId: 'import-school', plan: 'basic', cadence: 'yearly', status: 'active', startDate: new Date().toISOString(), validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false },
  { id: 'import-readonly', schoolId: 'import-readonly', plan: 'basic', cadence: 'yearly', status: 'read_only', startDate: new Date().toISOString(), validUntil: '2020-01-01', graceDays: 7, pricePaid: 0, autoRenew: false }
]);
const storage = await import('../src/server/storage.ts');
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

function tokenFor(user: typeof admin) {
  const sessionId = `session-${user.id}`;
  memory.rows('user_sessions').push({ id: sessionId, userId: user.id, userRole: user.role, schoolId: user.schoolId, ipAddress: '', userAgent: '', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), lastActivityAt: new Date().toISOString() });
  return createSignedSessionToken({ sessionId, userId: user.id, role: user.role, schoolId: user.schoolId, createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
}
const csv = (...rows: string[][]) => [
  'className,section,studentName,gender,admissionDate,address,parentName,parentPhone,studentPhone,branch',
  ...rows.map(row => [row[0],row[1],row[2],row[3],row[4],'',row[5],row[6],row[7],row[8]].join(','))
].join('\n');
const csvWithGuardians = (...rows: string[][]) => [
  'className,section,studentName,gender,admissionDate,address,parentName,parentPhone,studentPhone,branch',
  ...rows.map(row => [row[0],row[1],row[2],row[3],row[4],'',row[5],row[7] || row[6],row[10],row[11]].join(','))
].join('\n');

async function preview(user: typeof admin, text: string, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([text], { type: 'text/csv' }), 'school-import.csv');
  const response = await fetch(`${baseUrl}/import/preview`, { method: 'POST', headers: { Cookie: `schoolos_session=${tokenFor(user)}`, ...headers }, body: form });
  return { response, body: await response.json() as any };
}
async function confirm(user: typeof admin, rows: any[]) {
  return fetch(`${baseUrl}/import/confirm`, { method: 'POST', headers: { Cookie: `schoolos_session=${tokenFor(user)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) });
}

test('CSV import creates one missing class, students, linked parent and one-time PIN slips', async () => {
  const { response, body } = await preview(admin, csv(
    ['Grade 2', 'A', 'Amal Amina Noor', 'female', '2017-02-04', 'Amina Noor', '+252611234567', '', ''],
    ['Grade 2', 'A', 'Ibrahim Yusuf Noor', 'male', '2017-08-09', 'Amina Noor', '+252611234567', '+252622234567', '']
  ));
  assert.equal(response.status, 200);
  assert.equal(body.totals.valid, 2);
  const imported = await confirm(admin, body.rows.map((row: any) => row.data));
  assert.equal(imported.status, 200);
  const result = await imported.json() as any;
  assert.deepEqual(result.counts, { classes: 1, students: 2, parents: 1, skipped: 0 });
  assert.equal(result.pinSlips.length, 3);
  assert.equal(memory.rows('classes').filter(row => row.schoolId === admin.schoolId && row.name === 'Grade 2').length, 1);
  const students = memory.rows('students').filter(row => row.schoolId === admin.schoolId);
  assert.equal(students.length, 2);
  assert.ok(students.every(row => row.pinHash?.startsWith('pin_scrypt:')));
  assert.ok(students.every(row => row.status === 'active'));
  assert.ok(students.every(row => /^S\d{3,}$/.test(row.studentId)), 'new students get simple S001-style IDs');
  assert.equal(new Set(students.map(row => row.studentId)).size, students.length);
  assert.equal(memory.rows('users').filter(row => row.schoolId === admin.schoolId && row.role === 'parent' && row.phone === '+252611234567').length, 1);
  assert.equal(memory.rows('audit_logs').filter(row => row.schoolId === admin.schoolId && row.action === 'SCHOOL_BULK_IMPORT').length, 1);
  assert.equal(JSON.stringify(students).includes(result.pinSlips[0].pin), false);
});

test('bulk import links the existing guardian account and never resets its PIN', async () => {
  const existingPinHash = hashPin('2468');
  await memory.from('users').insert([{
    id: 'existing-father-parent',
    schoolId: admin.schoolId,
    role: 'parent',
    fullName: 'Existing Father',
    phone: '+252611199991',
    parentPhone: '+252611199991',
    pinHash: existingPinHash,
    linkedStudentIds: [],
    isBlocked: false,
    failedLoginAttempts: 0
  }]);
  const { response, body } = await preview(admin, csvWithGuardians([
    'Grade 8', 'A', 'Ayaan Hodan Hassan', 'female', '2015-05-04',
    'Existing Father', '', '+252611199991', 'Hodan Hassan', '+252622299992', '', ''
  ]));
  assert.equal(response.status, 200);
  assert.equal(body.totals.valid, 1);
  const imported = await confirm(admin, body.rows.map((row: any) => row.data));
  assert.equal(imported.status, 200);
  const result = await imported.json() as any;
  assert.equal(result.counts.parents, 1);
  assert.equal(result.pinSlips.length, 1);
  const studentSlip = result.pinSlips.find((slip: any) => slip.type === 'student');
  const student = memory.rows('students').find(row => row.studentId === studentSlip?.studentId);
  assert.equal(student?.fatherPhone, '+252611199991');
  assert.equal(student?.motherPhone, undefined);
  const father = memory.rows('users').find(row => row.id === 'existing-father-parent');
  assert.equal(father?.pinHash, existingPinHash);
  assert.ok(father?.linkedStudentIds?.includes(student.id));
});

test('preview rejects duplicate rows and invalid parent phone with row reasons', async () => {
  const { response, body } = await preview(admin, csv(
    ['Grade 3', 'A', 'Hodan Amina Ali', 'female', '2017-02-04', 'Parent Ali', '+252611234568', '', ''],
    ['Grade 3', 'A', 'Hodan Amina Ali', 'female', '2017-02-04', 'Parent Ali', '+252611234568', '', ''],
    ['Grade 3', 'A', 'Bad Phone Student', 'male', '2016-11-10', 'Parent Bad', 'not-a-phone', '', '']
  ));
  assert.equal(response.status, 200);
  assert.equal(body.totals.valid, 1);
  assert.equal(body.totals.errors, 2);
  assert.match(body.rows[1].reasons.join(' '), /Duplicate student/);
  assert.match(body.rows[2].reasons.join(' '), /parentPhone must be a valid/);
});

test('import scope rejects cross-school attempts; read-only schools and teacher role are blocked', async () => {
  const crossing = await preview(admin, csv(['Grade 4', 'A', 'Cross School', 'male', '2016-01-01', 'Parent Cross', '+252611234569', '', '']), { 'x-school-id': 'import-other' });
  assert.equal(crossing.response.status, 403);
  const readonly = await preview(readonlyAdmin, csv(['Grade 4', 'A', 'Read Only', 'male', '2016-01-01', 'Parent Read', '+252611234570', '', '']));
  assert.equal(readonly.response.status, 403);
  const forbidden = await preview(teacher as typeof admin, csv(['Grade 4', 'A', 'Teacher Import', 'male', '2016-01-01', 'Parent Teacher', '+252611234571', '', '']));
  assert.equal(forbidden.response.status, 403);
});

test('mid-transaction failure leaves classes, students, users and audit rows unchanged', async () => {
  const { body } = await preview(admin, csv(['Grade 5', 'A', 'Rollback Test', 'female', '2016-01-01', 'Parent Rollback', '+252611234572', '', '']));
  const before = ['classes', 'students', 'users', 'audit_logs'].map(table => memory.rows(table).length);
  memory.failNextBulkImport();
  const failed = await confirm(admin, body.rows.map((row: any) => row.data));
  assert.equal(failed.status, 500);
  assert.deepEqual(['classes', 'students', 'users', 'audit_logs'].map(table => memory.rows(table).length), before);
});

test('template contains required headers and explicitly skipped examples', async () => {
  const response = await fetch(`${baseUrl}/import/template`, { headers: { Cookie: `schoolos_session=${tokenFor(admin)}` } });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /className.*section.*studentName.*admissionDate.*address.*parentName.*parentPhone/);
  assert.equal((text.match(/EXAMPLE/g) || []).length, 9);
  assert.match(text, /Grade 5/);
});

test('a selected class returns every student at once, sorted by Student ID', async () => {
  const { body } = await preview(admin, csv(
    ['Grade 7', 'A', 'Zeinab Ali Noor', 'female', '2013-01-02', 'Ali Noor', '+252611777001', '', ''],
    ['Grade 7', 'A', 'Abdi Hassan Ali', 'male', '2013-02-03', 'Hassan Ali', '+252611777002', '', ''],
    ['Grade 7', 'A', 'Mahad Omar Yusuf', 'male', '2013-03-04', 'Omar Yusuf', '+252611777003', '', '']
  ));
  assert.equal(body.totals.valid, 3);
  assert.equal((await confirm(admin, body.rows.map((row: any) => row.data))).status, 200);
  const klass = memory.rows('classes').find(row => row.schoolId === admin.schoolId && row.name === 'Grade 7');
  assert.ok(klass, 'class was created');
  const response = await fetch(`${baseUrl}/students?classId=${encodeURIComponent(klass.id)}&pageSize=50`, { headers: { Cookie: `schoolos_session=${tokenFor(admin)}` } });
  assert.equal(response.status, 200);
  const rows = await response.json() as any[];
  const expectedByStudentId = [...rows]
    .sort((left, right) => String(left.studentId).localeCompare(String(right.studentId), undefined, { numeric: true, sensitivity: 'base' }))
    .map(row => row.firstName);
  assert.deepEqual(rows.map(row => row.firstName), expectedByStudentId);
  assert.equal(response.headers.get('x-total-count'), '3');
  assert.equal(response.headers.get('x-total-pages'), '1');
});

test('student import template has no Status or Reason column', async () => {
  const response = await fetch(`${baseUrl}/import/template`, { headers: { Cookie: `schoolos_session=${tokenFor(admin)}` } });
  assert.equal(response.status, 200);
  const header = (await response.text()).split(/\r?\n/)[0].split(',').map(value => value.replace(/"/g, '').trim().toLowerCase());
  assert.ok(header.includes('studentname'));
  assert.equal(header.includes('status'), false);
  assert.equal(header.includes('reason'), false);
});

test('CSV without a Status column imports and every new student is active', async () => {
  const text = csv(['Grade 6', 'A', 'Hodan Amina Ali', 'female', '2014-03-02', 'Ali Warsame', '+252611555101', '', '']);
  assert.equal(text.split('\n')[0].toLowerCase().includes('status'), false);
  const { response, body } = await preview(admin, text);
  assert.equal(response.status, 200);
  assert.equal(body.totals.valid, 1);
  assert.equal(body.totals.errors, 0);
  const imported = await confirm(admin, body.rows.map((row: any) => row.data));
  assert.equal(imported.status, 200);
  const student = memory.rows('students').find(row => row.schoolId === admin.schoolId && row.firstName === 'Hodan');
  assert.ok(student, 'student was created');
  assert.equal(student.status, 'active');
});

test('an unexpected Status column in an uploaded file is ignored and does not change the active default', async () => {
  const text = [
    'className,section,studentName,gender,admissionDate,address,parentName,parentPhone,studentPhone,branch,Status',
    'Grade 6,A,Farah Amina Ali,male,2026-11-14,Jijiga,Ali Warsame,+252611555102,,,inactive'
  ].join('\n');
  const { response, body } = await preview(admin, text);
  assert.equal(response.status, 200);
  assert.equal(body.totals.valid, 1);
  const imported = await confirm(admin, body.rows.map((row: any) => row.data));
  assert.equal(imported.status, 200);
  const student = memory.rows('students').find(row => row.schoolId === admin.schoolId && row.firstName === 'Farah');
  assert.ok(student, 'student was created');
  assert.equal(student.status, 'active');
});

test('preview exposes Status and Reason only as result fields, not imported student data', async () => {
  const { response, body } = await preview(admin, csv(['Grade 6', 'A', 'OnlyOneName', 'female', '2014-03-02', 'Ali Warsame', '+252611555103', '', '']));
  assert.equal(response.status, 200);
  assert.ok(body.rows.length > 0);
  for (const row of body.rows) {
    assert.ok(['valid', 'error', 'skipped'].includes(row.status));
    assert.ok(Array.isArray(row.reasons));
    assert.equal('status' in row.data, false);
    assert.equal('reason' in row.data, false);
  }
});
