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
});

test('admission approval is idempotent under concurrent requests and rolls back partial writes', async () => {
  const isolatedClass = storage.db.createClass({
    schoolId: school.id, name: 'Admission Atomic Class', gradeLevel: 3,
    section: 'A', roomNumber: '', capacity: 3, monthlyFee: 0
  });
  await storage.db.flush();
  const createApplication = async (firstName: string) => {
    const response = await fetch(`${baseUrl}/school/admissions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        firstName, lastName: 'Atomic', gender: 'female',
        gradeApplying: 'Grade 3', classId: isolatedClass.id,
        fatherPhone: '+15550007801', motherPhone: ''
      })
    });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };

  const concurrentApplication = await createApplication('Concurrent');
  const approve = () => fetch(`${baseUrl}/school/admissions/${concurrentApplication.id}/approve`, {
    method: 'POST', headers
  });
  const [first, second] = await Promise.all([approve(), approve()]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  const enrolled = memory.rows('students').filter(row =>
    (row.schoolId ?? row.school_id) === school.id
    && (row.classId ?? row.class_id) === isolatedClass.id
  );
  assert.equal(enrolled.length, 1);

  const rollbackApplication = await createApplication('Rollback');
  memory.failNextAdmissionApproval();
  const failed = await fetch(`${baseUrl}/school/admissions/${rollbackApplication.id}/approve`, {
    method: 'POST', headers
  });
  assert.equal(failed.status, 500);
  const rollbackRows = memory.rows('admission_applications').filter(row => row.id === rollbackApplication.id);
  assert.equal(rollbackRows[0]?.status, 'pending');
  assert.equal(memory.rows('students').filter(row =>
    (row.schoolId ?? row.school_id) === school.id
    && (row.classId ?? row.class_id) === isolatedClass.id
  ).length, 1, 'A failed transaction must not leave a partial student row.');
  assert.equal(memory.rows('users').filter(row =>
    String(row.id).startsWith('usr-student-')
    && (row.schoolId ?? row.school_id) === school.id
    && row.studentId === 'STD-ADMIT-' + rollbackApplication.id.slice(-8).toUpperCase()
  ).length, 0, 'A failed transaction must not leave a student login.');
  const capacityClass = storage.db.createClass({
    schoolId: school.id, name: 'Admissions Capacity Class', gradeLevel: 4,
    section: 'A', roomNumber: '', capacity: 1, monthlyFee: 0
  });
  storage.db.createStudent({
    schoolId: school.id, studentId: 'CAPACITY-EXISTING',
    firstName: 'Existing', middleName: '', lastName: 'Pupil', gender: 'male',
    admissionDate: today, fatherPhone: '+15550007811', motherPhone: '',
    classId: capacityClass.id, section: 'A', status: 'active'
  } as any);
  await storage.db.flush();
  const capacityApplication = await createApplication('Capacity');
  // Move this pending application to the deliberately full class in the
  // in-memory fixture; the RPC must re-check capacity under the class lock.
  const capacityRow = memory.rows('admission_applications').find(row => row.id === capacityApplication.id);
  assert.ok(capacityRow);
  capacityRow.classId = capacityClass.id;
  capacityRow.class_id = capacityClass.id;
  const fullClassApproval = await fetch(`${baseUrl}/school/admissions/${capacityApplication.id}/approve`, {
    method: 'POST', headers
  });
  assert.equal(fullClassApproval.status, 409);
  assert.equal(capacityRow.status, 'pending');
  assert.equal(memory.rows('students').filter(row =>
    (row.schoolId ?? row.school_id) === school.id
    && (row.classId ?? row.class_id) === capacityClass.id
  ).length, 1, 'A full class must not receive another admission.');
  const otherSchool = storage.db.createSchool({
    name: 'Admissions Other Tenant', code: 'OTHERADM', address: '', city: '', phone: '',
    email: 'other-admissions@example.test', currency: 'USD', academicYear: '2026-2027',
    currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: today, validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const otherClass = storage.db.createClass({
    schoolId: otherSchool.id, name: 'Foreign Class', gradeLevel: 5,
    section: 'A', roomNumber: '', capacity: 20, monthlyFee: 0
  });
  await storage.db.flush();
  memory.rows('admission_applications').push({
    id: 'cross-school-admission', school_id: school.id,
    first_name: 'Cross', middle_name: '', last_name: 'Tenant',
    gender: 'male', grade_applying: 'Grade 5', class_id: otherClass.id,
    father_phone: '+15550007899', mother_phone: '',
    applied_date: today, status: 'pending', student_id: null,
    created_at: new Date().toISOString()
  });
  const crossSchoolApproval = await fetch(`${baseUrl}/school/admissions/cross-school-admission/approve`, {
    method: 'POST', headers
  });
  assert.equal(crossSchoolApproval.status, 400);
  assert.equal(memory.rows('students').some(row => (row.schoolId ?? row.school_id) === school.id && (row.firstName ?? row.first_name) === 'Cross'), false);
});

test('student creation whitelists profile fields, enforces capacity and protects other-school parent PINs', async () => {
  const create = (body: Record<string, unknown>) => fetch(`${baseUrl}/students`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const created = await create({
    id: 'attacker-controlled-id',
    schoolId: school.id,
    role: 'super_admin',
    passwordHash: 'attacker-password',
    twoFactorSecret: 'attacker-secret',
    recoveryCodes: ['attacker-recovery'],
    pinHash: 'attacker-pin-hash',
    firstName: 'Clean',
    middleName: 'Profile',
    lastName: 'Student',
    gender: 'female',
    classId: klass.id,
    studentId: 'STU-CLEAN-001',
    fatherPhone: '+15550007111',
    motherPhone: '+15550007112',
    pin: '1234'
  });
  assert.equal(created.status, 201, await created.clone().text());
  const response = await created.json();
  assert.equal(response.id === 'attacker-controlled-id', false);
  assert.equal(response.schoolId, school.id);
  assert.equal(response.initialPin, '1234');
  assert.equal('passwordHash' in response, false);
  assert.equal('twoFactorSecret' in response, false);
  const storedStudent = memory.rows('students').find(row => row.id === response.id);
  assert.ok(String(storedStudent?.pin_hash || storedStudent?.pinHash || '').startsWith('pin_scrypt:'));
  assert.equal('pin' in (storedStudent as any), false, 'Plaintext student PIN must never be persisted.');
  assert.equal('password_hash' in (storedStudent as any), false);
  assert.equal('two_factor_secret' in (storedStudent as any), false);
  const parent = (await storage.db.getUsers(school.id, 'parent')).find(user => user.phone === '+15550007111');
  assert.ok(parent?.linkedStudentIds?.includes(response.id));
  assert.ok(parent?.pin?.startsWith('pin_scrypt:'));

  const secondSchool = storage.db.createSchool({
    name: 'Other School', code: 'OTHER', address: '', city: '', phone: '',
    email: 'other-school@example.test', currency: 'USD', academicYear: '2026-2027',
    currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
    subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: today, validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
  } as any);
  const otherSchoolParent = storage.db.createUser({
    schoolId: secondSchool.id, role: 'parent', fullName: 'Other School Parent',
    phone: '+15550007111', parentPhone: '+15550007111', passwordHash: '',
    pin: '4321', isBlocked: false, failedLoginAttempts: 0
  } as any);
  await storage.db.flush();
  const { verifyPin } = await import('../src/server/auth-security.ts');
  const reset = await storage.db.resetStudentPin(response.id, school.id, '5678');
  assert.equal(reset?.newPin, '5678');
  await storage.db.flush();
  const unchangedParent = await storage.db.getUserById(otherSchoolParent.id, secondSchool.id);
  assert.ok(unchangedParent?.pin && verifyPin('4321', unchangedParent.pin));

  const fullClass = storage.db.createClass({
    schoolId: school.id, name: 'Full Class', gradeLevel: 2, section: 'A',
    roomNumber: '', capacity: 1, monthlyFee: 0
  });
  await storage.db.flush();
  const first = await create({
    firstName: 'First', middleName: 'Full', lastName: 'Student', gender: 'male',
    classId: fullClass.id, studentId: 'FULL-CLASS-01', fatherPhone: '+15550007113'
  });
  assert.equal(first.status, 201, await first.clone().text());
  const second = await create({
    firstName: 'Second', middleName: 'Full', lastName: 'Student', gender: 'male',
    classId: fullClass.id, studentId: 'FULL-CLASS-02', fatherPhone: '+15550007114'
  });
  assert.equal(second.status, 409);

  const duplicate = await create({
    firstName: 'Duplicate', middleName: 'Student', lastName: 'ID', gender: 'male',
    classId: klass.id, studentId: 'STU-CLEAN-001', fatherPhone: '+15550007115'
  });
  assert.equal(duplicate.status, 409);

  const invalidPin = await create({
    firstName: 'Invalid', middleName: 'PIN', lastName: 'Student', gender: 'male',
    classId: klass.id, studentId: 'STU-INVALID-PIN', fatherPhone: '+15550007116', pin: '12ab'
  });
  assert.equal(invalidPin.status, 400);
});

test('teacher creation ignores client-controlled identity and credential fields', async () => {
  const post = (body: Record<string, unknown>) => fetch(`${baseUrl}/teachers`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const response = await post({
    id: 'forged-teacher-id',
    schoolId: school.id,
    userId: 'forged-user',
    role: 'super_admin',
    passwordHash: 'forged-password',
    twoFactorSecret: 'forged-secret',
    recoveryCodes: ['forged-code'],
    pin: '9999',
    staffId: 'STF-SEC-001',
    fullName: 'Scoped Teacher',
    phone: '+15550007201',
    gender: 'male',
    qualification: 'B.Ed',
    department: 'Science',
    assignedClasses: [klass.id],
    assignedSubjects: [],
    monthlySalary: 850
  });
  assert.equal(response.status, 201, await response.clone().text());
  const result = await response.json();
  assert.notEqual(result.id, 'forged-teacher-id');
  assert.equal(result.schoolId, school.id);
  assert.notEqual(result.userId, 'forged-user');
  assert.equal(result.initialPin.length, 4);
  assert.equal('passwordHash' in result, false);
  assert.equal('twoFactorSecret' in result, false);
  const storedTeacher = (await storage.db.getTeachers(school.id)).find(item => item.id === result.id);
  assert.ok(storedTeacher);
  assert.equal('passwordHash' in (storedTeacher as any), false);
  assert.equal('twoFactorSecret' in (storedTeacher as any), false);
  const teacherUser = await storage.db.getUserById(result.userId, school.id);
  assert.equal(teacherUser?.role, 'teacher');
  assert.ok(teacherUser?.pin?.startsWith('pin_scrypt:'));

  // Prime the shared list cache as an administrator, then request the same
  // list as a student to ensure salary fields cannot leak across cache roles.
  const adminTeacherList = await fetch(`${baseUrl}/teachers`, { headers });
  assert.equal(adminTeacherList.status, 200);
  const adminTeacherRows = await adminTeacherList.json();
  assert.equal(adminTeacherRows.find((item: any) => item.id === result.id)?.monthlySalary, 850);

  const studentUser = storage.db.createUser({
    schoolId: school.id, role: 'student', fullName: 'Teacher Directory Student',
    phone: '+15550007299', studentId: 'DIRECTORY-TEST', passwordHash: '',
    pin: '1234', isBlocked: false, failedLoginAttempts: 0
  } as any);
  const authSecurity = await import('../src/server/auth-security.ts');
  const studentSessionToken = authSecurity.createSignedSessionToken({
    sessionId: 'teacher-directory-student-session',
    userId: studentUser.id,
    role: 'student',
    schoolId: school.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000
  });
  memory.rows('user_sessions').push({
    id: 'teacher-directory-student-session', userId: studentUser.id, userRole: 'student',
    schoolId: school.id, ipAddress: '127.0.0.1', userAgent: 'test',
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    lastActivityAt: new Date().toISOString()
  });
  await storage.db.flush();
  const studentTeacherList = await fetch(`${baseUrl}/teachers`, {
    headers: { Cookie: `schoolos_session=${studentSessionToken}` }
  });
  assert.equal(studentTeacherList.status, 200);
  const studentTeacherRows = await studentTeacherList.json();
  const studentTeacher = studentTeacherRows.find((item: any) => item.id === result.id);
  assert.ok(studentTeacher);
  assert.equal('monthlySalary' in studentTeacher, false);

  const duplicate = await post({
    staffId: 'STF-SEC-001', fullName: 'Duplicate Staff ID',
    gender: 'female', assignedClasses: [], assignedSubjects: []
  });
  assert.equal(duplicate.status, 409);

  const invalidAssignments = await post({
    staffId: 'STF-SEC-002', fullName: 'Invalid Assignments',
    gender: 'female', assignedClasses: [klass.id, null], assignedSubjects: []
  });
  assert.equal(invalidAssignments.status, 400);
});

test('student profile updates validate phones and keep parent/student login links synchronized', async () => {
  const create = (body: Record<string, unknown>) => fetch(`${baseUrl}/students`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  const firstResponse = await create({
    firstName: 'Parent', middleName: 'Link', lastName: 'One', gender: 'female',
    classId: klass.id, studentId: 'PARENT-LINK-01',
    fatherPhone: '+15550007301', motherPhone: '+15550007302',
    studentPhone: '+15550007303'
  });
  assert.equal(firstResponse.status, 201, await firstResponse.clone().text());
  const first = await firstResponse.json();

  const siblingResponse = await create({
    firstName: 'Parent', middleName: 'Link', lastName: 'Sibling', gender: 'male',
    classId: klass.id, studentId: 'PARENT-LINK-02',
    fatherPhone: '+15550007301', motherPhone: '+15550007304'
  });
  assert.equal(siblingResponse.status, 201, await siblingResponse.clone().text());
  const sibling = await siblingResponse.json();

  const invalid = await fetch(`${baseUrl}/students/${first.id}`, {
    method: 'PUT', headers,
    body: JSON.stringify({ fatherPhone: 'not-a-phone' })
  });
  assert.equal(invalid.status, 400);

  const updatedResponse = await fetch(`${baseUrl}/students/${first.id}`, {
    method: 'PUT', headers,
    body: JSON.stringify({
      id: 'forged-student-id', schoolId: school.id,
      fatherPhone: '+15550007306', motherPhone: '+15550007307',
      studentPhone: '+15550007308'
    })
  });
  assert.equal(updatedResponse.status, 200, await updatedResponse.clone().text());
  const updated = await updatedResponse.json();
  assert.equal(updated.id, first.id);
  assert.equal(updated.schoolId, school.id);
  assert.equal(updated.fatherPhone, '+15550007306');
  assert.equal(updated.motherPhone, '+15550007307');

  const users = await storage.db.getUsers(school.id, 'parent');
  const oldFather = users.find(user => user.phone === '+15550007301');
  const oldMother = users.find(user => user.phone === '+15550007302');
  const newFather = users.find(user => user.phone === '+15550007306');
  const newMother = users.find(user => user.phone === '+15550007307');
  assert.ok(oldFather?.linkedStudentIds?.includes(sibling.id));
  assert.equal(oldFather?.linkedStudentIds?.includes(first.id), false);
  assert.equal(oldMother?.linkedStudentIds?.includes(first.id), false);
  assert.ok(newFather?.linkedStudentIds?.includes(first.id));
  assert.ok(newMother?.linkedStudentIds?.includes(first.id));

  const studentUser = await storage.db.getUserById(`usr-student-${first.id}`, school.id);
  assert.equal(studentUser?.phone, '+15550007308');
  const { verifyPin } = await import('../src/server/auth-security.ts');
  assert.ok(newFather?.pin && verifyPin(first.initialPin, newFather.pin));
  assert.ok(newMother?.pin && verifyPin(first.initialPin, newMother.pin));
});

test('concurrent attendance submissions converge on one daily row without automatic parent SMS', async () => {
  const created = await fetch(`${baseUrl}/students`, {
    method: 'POST', headers,
    body: JSON.stringify({
      firstName: 'Attendance', middleName: 'Concurrent', lastName: 'Pupil', gender: 'female',
      classId: klass.id, studentId: 'ATTENDANCE-CONCURRENT-01',
      fatherPhone: '+15550007401', motherPhone: '+15550007402'
    })
  });
  assert.equal(created.status, 201, await created.clone().text());
  const student = await created.json();
  const date = '2026-11-03';
  const invalidNote = await fetch(`${baseUrl}/attendance`, {
    method: 'POST', headers,
    body: JSON.stringify({ classId: klass.id, date, records: [{ studentId: student.id, status: 'absent', note: { unexpected: true } }] })
  });
  assert.equal(invalidNote.status, 400);
  const submit = () => fetch(`${baseUrl}/attendance`, {
    method: 'POST', headers,
    body: JSON.stringify({ classId: klass.id, date, records: [{ studentId: student.id, status: 'absent' }] })
  });
  const [first, retry] = await Promise.all([submit(), submit()]);
  assert.equal(first.status, 200, await first.clone().text());
  assert.equal(retry.status, 200, await retry.clone().text());

  const rows = memory.rows('attendance_records').filter(row =>
    row.school_id === school.id && row.class_id === klass.id &&
    row.student_id === student.id && row.date === date
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'absent');

  const alerts = memory.rows('communication_queue').filter(row =>
    row.school_id === school.id && row.student_id === student.id && row.message_type === 'attendance_absent'
  );
  assert.equal(alerts.length, 0, 'absence alerts are sent manually from the administrator WhatsApp session, not queued as SMS');

  const repeated = await submit();
  assert.equal(repeated.status, 200, await repeated.clone().text());
  assert.equal(memory.rows('communication_queue').filter(row =>
    row.school_id === school.id && row.student_id === student.id && row.message_type === 'attendance_absent'
  ).length, 0, 're-saving an absent status must not queue automatic alerts');
});


test('school backup restore previews tenant-scoped rows and requires explicit matching confirmation', async () => {
  const event = {
    id: 'backup-restore-event-1', school_id: school.id,
    title: 'Backup Event', description: 'Restore verification',
    start_date: '2026-11-04', end_date: '2026-11-04',
    type: 'event', created_at: new Date().toISOString()
  };
  memory.rows('school_events').push(event);
  memory.rows('communication_settings').push({
    id: 'legacy-provider-settings', school_id: school.id,
    provider: 'legacy', api_key: 'must-not-export', api_secret: 'must-not-export',
    webhook_url: 'https://example.invalid/secret', is_active: true
  });
  const backup = await storage.db.generateSchoolBackup(school.id);
  assert.ok(backup);
  assert.equal(backup.school.id, school.id);
  assert.equal(backup.tables.school_events.length, 1);
  for (const excludedTable of ['communication_settings', 'communication_queue', 'subscription_invoices', 'school_subscriptions']) {
    assert.equal((backup.tables as any)[excludedTable], undefined, `${excludedTable} must not be included in a school backup.`);
  }
  assert.ok(backup.tables.students.every((row: any) => !('pinHash' in row) && !('pin_hash' in row) && !('pin' in row)), 'Student PIN hashes must not be exported.');
  assert.ok(backup.tables.users.every((row: any) => !('passwordHash' in row) && !('password_hash' in row) && !('pinHash' in row) && !('pin_hash' in row) && !('pin' in row) && !('twoFactorSecret' in row) && !('two_factor_secret' in row) && !('recoveryCodes' in row) && !('recovery_codes' in row)), 'User credentials and 2FA secrets must not be exported.');
  const protectedStudentBackupRow = backup.tables.students[0];
  const protectedStudentId = protectedStudentBackupRow?.id;
  const protectedStudentLiveRow = memory.rows('students').find(row => row.id === protectedStudentId);
  const protectedPinHash = protectedStudentLiveRow?.pin_hash ?? protectedStudentLiveRow?.pinHash;
  if (protectedStudentBackupRow) {
    // A hand-crafted backup must not be able to inject credential material.
    protectedStudentBackupRow.pinHash = 'attacker-controlled-pin-hash';
    protectedStudentBackupRow.pin_hash = 'attacker-controlled-pin-hash';
  }
  memory.replaceRows('school_events', []);

  const previewResponse = await fetch(`${baseUrl}/school/backup/restore/preview`, {
    method: 'POST', headers, body: JSON.stringify({ backup })
  });
  assert.equal(previewResponse.status, 200, await previewResponse.clone().text());
  const preview = await previewResponse.json();
  assert.equal(preview.mode, 'merge');
  assert.equal(preview.counts.school_events, 1);
  assert.ok(preview.previewToken);
  assert.ok(preview.previewedAt);
  assert.ok(preview.excluded.includes('users and login credentials'));

  const noConfirmation = await fetch(`${baseUrl}/school/backup/restore`, {
    method: 'POST', headers, body: JSON.stringify({ backup, previewToken: preview.previewToken, previewedAt: preview.previewedAt })
  });
  assert.equal(noConfirmation.status, 400);

  const tampered = structuredClone(backup);
  tampered.tables.school_events[0].title = 'Tampered after preview';
  const staleConfirmation = await fetch(`${baseUrl}/school/backup/restore`, {
    method: 'POST', headers,
    body: JSON.stringify({ backup: tampered, previewToken: preview.previewToken, previewedAt: preview.previewedAt, confirm: true })
  });
  assert.equal(staleConfirmation.status, 409);

  const crossSchool = structuredClone(backup);
  crossSchool.school.id = 'another-school';
  const crossPreview = await fetch(`${baseUrl}/school/backup/restore/preview`, {
    method: 'POST', headers, body: JSON.stringify({ backup: crossSchool })
  });
  assert.equal(crossPreview.status, 400);

  memory.failNextBackupRestore();
  const failedRestore = await fetch(`${baseUrl}/school/backup/restore`, {
    method: 'POST', headers,
    body: JSON.stringify({ backup, previewToken: preview.previewToken, previewedAt: preview.previewedAt, confirm: true })
  });
  assert.equal(failedRestore.status, 500);
  assert.equal(memory.rows('school_events').some(row => row.id === event.id), false, 'Failed restore must roll back all earlier row writes.');

  const restoredResponse = await fetch(`${baseUrl}/school/backup/restore`, {
    method: 'POST', headers,
    body: JSON.stringify({ backup, previewToken: preview.previewToken, previewedAt: preview.previewedAt, confirm: true })
  });
  assert.equal(restoredResponse.status, 200, await restoredResponse.clone().text());
  const restored = await restoredResponse.json();
  assert.equal(restored.ok, true);
  assert.equal(restored.mode, 'merge');
  assert.equal(memory.rows('school_events').some(row => row.id === event.id), true);
  if (protectedStudentId) {
    const restoredStudent = memory.rows('students').find(row => row.id === protectedStudentId);
    assert.equal(restoredStudent?.pin_hash ?? restoredStudent?.pinHash, protectedPinHash, 'Restore must never overwrite or inject a student PIN hash.');
  }
  assert.equal(memory.rows('audit_logs').some(row => row.action === 'SCHOOL_BACKUP_RESTORED'), true);
});
