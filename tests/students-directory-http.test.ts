import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'students-row-test@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();

const today = new Date().toISOString().slice(0, 10);
const subscription = {
  plan: 'basic', cadence: 'yearly', status: 'active',
  startDate: today, validUntil: '2099-12-31', graceDays: 7,
  pricePaid: 0, autoRenew: false
};
const school = storage.db.createSchool({
  name: 'Student Row Test', code: 'STROW', address: '', city: 'Jijiga',
  phone: '', email: 'students-row-school@example.test', currency: 'ETB',
  academicYear: '2026-2027', currentSemester: 'Semester 1',
  defaultClassCapacity: 30, studentAccessEnabled: false, subscription
} as any);
const otherSchool = storage.db.createSchool({
  name: 'Other Student Row Test', code: 'STROW2', address: '', city: 'Jijiga',
  phone: '', email: 'students-row-school-2@example.test', currency: 'ETB',
  academicYear: '2026-2027', currentSemester: 'Semester 1',
  defaultClassCapacity: 30, studentAccessEnabled: false, subscription
} as any);
const admin = storage.db.createUser({
  schoolId: school.id, role: 'school_admin', fullName: 'Student Row Admin',
  email: 'students-row-admin@example.test', passwordHash: '',
  isBlocked: false, failedLoginAttempts: 0
} as any);
const teacher = storage.db.createUser({
  schoolId: school.id, role: 'teacher', fullName: 'Form Teacher',
  email: 'students-row-teacher@example.test', passwordHash: '',
  isBlocked: false, failedLoginAttempts: 0
} as any);
const ownClass = storage.db.createClass({
  schoolId: school.id, name: 'Grade 1', gradeLevel: 1, section: 'A',
  roomNumber: '', capacity: 30, monthlyFee: 0, classTeacherId: teacher.id,
  isArchived: false
} as any);
const otherClass = storage.db.createClass({
  schoolId: school.id, name: 'Grade 2', gradeLevel: 2, section: 'B',
  roomNumber: '', capacity: 30, monthlyFee: 0, isArchived: false
} as any);
const otherSchoolClass = storage.db.createClass({
  schoolId: otherSchool.id, name: 'Grade 1', gradeLevel: 1, section: 'A',
  roomNumber: '', capacity: 30, monthlyFee: 0, isArchived: false
} as any);
await storage.db.flush();

memory.rows('academic_years').push({
  id: 'student-row-current-year', school_id: school.id,
  name: '2026-2027', is_current: true, start_date: '2026-09-01',
  end_date: '2027-06-30', created_at: new Date().toISOString()
});

const noGuardian = storage.db.createStudent({
  schoolId: school.id, studentId: 'STROW-NOGUARD',
  firstName: 'No', middleName: '', lastName: 'Guardian',
  gender: 'male', admissionDate: today, fatherPhone: '',
  motherPhone: '', classId: otherClass.id, section: 'B', status: 'active'
} as any);
const formTeacherStudent = storage.db.createStudent({
  schoolId: school.id, studentId: 'STROW-FORM',
  firstName: 'Form', middleName: '', lastName: 'Student',
  gender: 'male', admissionDate: today, fatherPhone: '',
  motherPhone: '', classId: ownClass.id, section: 'A', status: 'active'
} as any);
const otherTenantStudent = storage.db.createStudent({
  schoolId: otherSchool.id, studentId: 'STROW-OTHER',
  firstName: 'Other', middleName: '', lastName: 'Tenant',
  gender: 'female', admissionDate: today, fatherPhone: '+251911111111',
  classId: otherSchoolClass.id, section: 'A', status: 'active'
} as any);
await storage.db.flush();

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Student row HTTP test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;

function sessionHeaders(user: any, sessionId: string) {
  const expiresAt = Date.now() + 60_000;
  const token = auth.createSignedSessionToken({
    sessionId, userId: user.id, role: user.role, schoolId: user.schoolId,
    createdAt: Date.now(), expiresAt
  });
  memory.rows('user_sessions').push({
    id: sessionId, userId: user.id, userRole: user.role, schoolId: user.schoolId,
    ipAddress: '127.0.0.1', userAgent: 'student-row-test',
    createdAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString(),
    lastActivityAt: new Date().toISOString()
  });
  return { Cookie: `schoolos_session=${token}`, 'Content-Type': 'application/json' };
}

const adminHeaders = sessionHeaders(admin, 'student-row-admin-session');
const teacherHeaders = sessionHeaders(teacher, 'student-row-teacher-session');
after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('new student POST persists gender, both parent phones, status and selected class', async () => {
  const response = await fetch(`${baseUrl}/students`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({
      firstName: 'Mohamed', middleName: 'Abdirahman', lastName: 'Warsame',
      gender: 'female', classId: ownClass.id, section: 'A',
      guardianName: 'Primary Parent', guardianPhone: '+251912345678',
      motherPhone: '+251911234567', admissionDate: today
    })
  });
  assert.equal(response.status, 201, await response.clone().text());
  const created = await response.json();
  assert.equal(created.gender, 'female');
  assert.equal(created.status, 'active');
  assert.equal(created.fatherPhone, '+251912345678');
  assert.equal(created.motherPhone, '+251911234567');
  assert.equal(created.classId, ownClass.id);

  // The production database trigger creates this enrollment atomically on INSERT.
  // The in-memory Supabase adapter does not execute PostgreSQL triggers, so mirror
  // the trigger result here to exercise the GET decoration and pagination contract.
  memory.rows('enrollments').push({
    id: 'student-row-created-enrollment', school_id: school.id,
    student_id: created.id, academic_year_id: 'student-row-current-year',
    class_id: ownClass.id, status: 'active', enrolled_at: new Date().toISOString()
  });

  const list = await fetch(`${baseUrl}/students?gender=female&status=active&page=1&pageSize=10`, { headers: adminHeaders });
  assert.equal(list.status, 200, await list.clone().text());
  const rows = await list.json();
  assert.ok(rows.some((row: any) => row.id === created.id));
  const row = rows.find((item: any) => item.id === created.id);
  assert.equal(row.className, 'Grade 1 · A');
  assert.equal(row.gender, 'female');
  assert.equal(row.status, 'active');
  assert.equal(row.fatherPhone, '+251912345678');
  assert.equal(row.motherPhone, '+251911234567');
  assert.equal(list.headers.get('X-Total-Count'), '1');
  assert.equal(list.headers.get('X-Total-Pages'), '1');
});

test('students without a guardian remain readable and another school stays isolated', async () => {
  memory.rows('enrollments').push({
    id: 'student-row-no-guardian-enrollment', school_id: school.id,
    student_id: noGuardian.id, academic_year_id: 'student-row-current-year',
    class_id: otherClass.id, status: 'active', enrolled_at: new Date().toISOString()
  });
  const response = await fetch(`${baseUrl}/students?classId=${otherClass.id}`, { headers: adminHeaders });
  assert.equal(response.status, 200, await response.clone().text());
  const rows = await response.json();
  assert.ok(rows.some((row: any) => row.id === noGuardian.id));
  assert.ok(!rows.some((row: any) => row.id === otherTenantStudent.id));
  assert.equal(rows.find((row: any) => row.id === noGuardian.id).fatherPhone, '');
});

test('Form Teacher reads only the homeroom class and receives 403 for another class', async () => {
  memory.rows('enrollments').push({
    id: 'student-row-teacher-own-enrollment', school_id: school.id,
    student_id: formTeacherStudent.id, academic_year_id: 'student-row-current-year',
    class_id: ownClass.id, status: 'active', enrolled_at: new Date().toISOString()
  });
  const own = await fetch(`${baseUrl}/students`, { headers: teacherHeaders });
  assert.equal(own.status, 200, await own.clone().text());
  const ownRows = await own.json();
  assert.ok(ownRows.every((row: any) => row.classId === ownClass.id));

  const forbidden = await fetch(`${baseUrl}/students?classId=${otherClass.id}`, { headers: teacherHeaders });
  assert.equal(forbidden.status, 403);
  assert.match((await forbidden.json()).error, /assigned classes/i);
});
