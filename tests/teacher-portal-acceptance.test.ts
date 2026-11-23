import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'teacher-acceptance-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();
const db = storage.db;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa' }).format(new Date());
const tomorrowDate = new Date(`${today}T12:00:00+03:00`);
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa' }).format(tomorrowDate);

const makeSchool = (name: string, code: string) => db.createSchool({
  name, code, address: '', city: '', phone: '', email: `${code.toLowerCase()}@example.test`, currency: 'ETB',
  academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30, studentAccessEnabled: false,
  subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: today, validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
} as any);
const school = makeSchool('Teacher Acceptance School', 'TACCEPT');
const otherSchool = makeSchool('Other Tenant School', 'OTHER');
const makeUser = (schoolId: string, role: string, fullName: string, extra: Record<string, unknown> = {}) =>
  db.createUser({ schoolId, role, fullName, email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.') }@example.test`, passwordHash: '', isBlocked: false, failedLoginAttempts: 0, ...extra } as any);

const formTeacherUser = makeUser(school.id, 'teacher', 'Form Teacher');
const subjectTeacherUser = makeUser(school.id, 'teacher', 'Subject Teacher');
const otherTeacherUser = makeUser(school.id, 'teacher', 'Other Teacher');
const emptyTeacherUser = makeUser(school.id, 'teacher', 'Empty Teacher');
const parentUser = makeUser(school.id, 'parent', 'Parent User');
const schoolAdmin = makeUser(school.id, 'school_admin', 'School Admin');
const formTeacher = db.createTeacher({ schoolId: school.id, userId: formTeacherUser.id, staffId: 'T-FORM', fullName: formTeacherUser.fullName, email: formTeacherUser.email!, phone: '', gender: 'female', qualification: 'B.Ed', department: 'General', assignedClasses: [], assignedSubjects: [], status: 'active', joinedDate: today, monthlySalary: 1000 });
const subjectTeacher = db.createTeacher({ schoolId: school.id, userId: subjectTeacherUser.id, staffId: 'T-SUB', fullName: subjectTeacherUser.fullName, email: subjectTeacherUser.email!, phone: '', gender: 'male', qualification: 'B.Ed', department: 'Math', assignedClasses: [], assignedSubjects: [], status: 'active', joinedDate: today, monthlySalary: 1000 });
const otherTeacher = db.createTeacher({ schoolId: school.id, userId: otherTeacherUser.id, staffId: 'T-OTHER', fullName: otherTeacherUser.fullName, email: otherTeacherUser.email!, phone: '', gender: 'male', qualification: 'B.Ed', department: 'Science', assignedClasses: [], assignedSubjects: [], status: 'active', joinedDate: today, monthlySalary: 1000 });
const emptyTeacher = db.createTeacher({ schoolId: school.id, userId: emptyTeacherUser.id, staffId: 'T-EMPTY', fullName: emptyTeacherUser.fullName, email: emptyTeacherUser.email!, phone: '', gender: 'female', qualification: 'B.Ed', department: 'General', assignedClasses: [], assignedSubjects: [], status: 'active', joinedDate: today, monthlySalary: 1000 });

const klass = db.createClass({ schoolId: school.id, name: 'Grade 7', gradeLevel: 7, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0, classTeacherId: formTeacherUser.id } as any);
const otherClass = db.createClass({ schoolId: school.id, name: 'Grade 8', gradeLevel: 8, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0, classTeacherId: otherTeacherUser.id } as any);
const tenantClass = db.createClass({ schoolId: otherSchool.id, name: 'Tenant Grade', gradeLevel: 1, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 } as any);
const emptyClass = db.createClass({ schoolId: school.id, name: 'Grade 9', gradeLevel: 9, section: 'B', roomNumber: '', capacity: 30, classTeacherId: emptyTeacherUser.id } as any);
const subject = db.createSubject({ schoolId: school.id, name: 'Mathematics', code: 'MATH', category: 'core', isActive: true } as any);
const otherSubject = db.createSubject({ schoolId: school.id, name: 'Science', code: 'SCI', category: 'core', isActive: true } as any);
const student = db.createStudent({ schoolId: school.id, studentId: 'TACCEPT-001', firstName: 'Test', middleName: '', lastName: 'Student', gender: 'female', admissionDate: today, fatherPhone: '+251900000001', classId: klass.id, status: 'active' } as any);
const otherStudent = db.createStudent({ schoolId: school.id, studentId: 'TACCEPT-002', firstName: 'Other', middleName: '', lastName: 'Student', gender: 'male', admissionDate: today, fatherPhone: '', classId: otherClass.id, status: 'active' } as any);
parentUser.linkedStudentIds = [student.id];
await db.flush();
await memory.from('parent_students').insert([{ id: 'taccept-parent-student-link', school_id: school.id, parent_id: parentUser.id, student_id: student.id, relation: 'guardian', revoked_at: null }]);
await db.flush();
await memory.from('class_subjects').insert([
  { id: 'ta-cs-math', school_id: school.id, class_id: klass.id, subject_id: subject.id, teacher_id: subjectTeacher.id, 'teachers.user_id': subjectTeacherUser.id, 'teachers.school_id': school.id, periods_per_week: 3, is_active: true },
  { id: 'ta-cs-other-class', school_id: school.id, class_id: otherClass.id, subject_id: subject.id, teacher_id: otherTeacher.id, 'teachers.user_id': otherTeacherUser.id, 'teachers.school_id': school.id, periods_per_week: 2, is_active: true },
  { id: 'ta-cs-form-extra', school_id: school.id, class_id: otherClass.id, subject_id: otherSubject.id, teacher_id: formTeacher.id, 'teachers.user_id': formTeacherUser.id, 'teachers.school_id': school.id, periods_per_week: 1, is_active: true },
  { id: 'ta-cs-empty', school_id: school.id, class_id: emptyClass.id, subject_id: otherSubject.id, teacher_id: emptyTeacher.id, 'teachers.user_id': emptyTeacherUser.id, 'teachers.school_id': school.id, periods_per_week: 1, is_active: true }
]);
await db.flush();

function cookieFor(user: any, label: string) {
  const expiresAt = Date.now() + 5 * 60_000;
  const sessionId = `teacher-acceptance-${label}`;
  db.createSession({ id: sessionId, userId: user.id, userRole: user.role, schoolId: user.schoolId, ipAddress: '127.0.0.1', userAgent: 'teacher-acceptance-test', createdAt: new Date().toISOString(), expiresAt: new Date(expiresAt).toISOString(), lastActivityAt: new Date().toISOString() });
  return `schoolos_session=${auth.createSignedSessionToken({ sessionId, userId: user.id, role: user.role, schoolId: user.schoolId, createdAt: Date.now(), expiresAt })}`;
}
const studentPortalUser = makeUser(school.id, 'student', 'Student Portal User', { studentId: student.studentId });
const studentPortalCookie = cookieFor(studentPortalUser, 'student-portal');
const cookies = {
  form: cookieFor(formTeacherUser, 'form'),
  subject: cookieFor(subjectTeacherUser, 'subject'),
  other: cookieFor(otherTeacherUser, 'other'),
  empty: cookieFor(emptyTeacherUser, 'empty'),
  parent: cookieFor(parentUser, 'parent'),
  admin: cookieFor(schoolAdmin, 'admin')
};
const setupGateSchool = makeSchool('Incomplete Setup Gate School', 'SETUPGATE');
const setupGateTeacher = makeUser(setupGateSchool.id, 'teacher', 'Setup Gate Teacher');
const setupGateAdmin = makeUser(setupGateSchool.id, 'school_admin', 'Setup Gate Admin');
const setupGateCookie = cookieFor(setupGateTeacher, 'setup-gate');
const setupGateAdminCookie = cookieFor(setupGateAdmin, 'setup-gate-admin');

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Teacher acceptance test server did not bind.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const request = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}${path}`, { ...init, headers: { Cookie: cookie, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
const postJson = (path: string, cookie: string, body: unknown) =>
  request(path, cookie, { method: 'POST', body: JSON.stringify(body) });

after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));


test('15.0 opening the new-school wizard persists startedAt and incomplete setup returns HTTP 423', async () => {
  const progressResponse = await request('/school/setup-progress', setupGateAdminCookie);
  assert.equal(progressResponse.status, 200, await progressResponse.clone().text());
  const progress = await progressResponse.json() as any;
  assert.ok(progress.progress.startedAt);
  const response = await request('/attendance', setupGateCookie);
  assert.equal(response.status, 423, await response.clone().text());
  const payload = await response.json() as any;
  assert.equal(payload.code, 'SCHOOL_SETUP_REQUIRED');
  assert.ok(Array.isArray(payload.missing) && payload.missing.length > 0);
});

test('15.0a wrong role remains HTTP 403 before setup readiness gating', async () => {
  const response = await request('/attendance', cookies.parent);
  assert.equal(response.status, 403);
});

test('15.1 attendance POST is forbidden for a teacher who is not the Form Teacher', async () => {
  const response = await postJson('/attendance', cookies.subject, { classId: klass.id, date: today, records: [{ studentId: student.id, status: 'present' }] });
  assert.equal(response.status, 403);
});

test('15.2 attendance PUT is forbidden for a teacher who is not the Form Teacher', async () => {
  const response = await request('/attendance', cookies.subject, { method: 'PUT', body: JSON.stringify({ classId: klass.id, date: today, records: [{ studentId: student.id, status: 'absent' }] }) });
  assert.equal(response.status, 403);
});

test('15.3 future attendance dates are rejected with HTTP 422', async () => {
  const response = await postJson('/attendance', cookies.form, { classId: klass.id, date: tomorrow, records: [{ studentId: student.id, status: 'present' }] });
  assert.equal(response.status, 422);
});

test('15.4 repeated attendance submissions update the same natural-key record', async () => {
  const first = await postJson('/attendance', cookies.form, { classId: klass.id, date: today, records: [{ studentId: student.id, status: 'absent' }] });
  assert.equal(first.status, 200, await first.clone().text());
  const second = await postJson('/attendance', cookies.form, { classId: klass.id, date: today, records: [{ studentId: student.id, status: 'late' }] });
  assert.equal(second.status, 200, await second.clone().text());
  const rows = memory.rows('attendance_records').filter(row => row.school_id === school.id && row.class_id === klass.id && row.student_id === student.id && row.date === today);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'late');
});

test('15.5 marks for a subject assigned to another teacher are forbidden', async () => {
  const response = await postJson('/exams/marks', cookies.subject, { classId: klass.id, subjectId: otherSubject.id, semester: 'Semester 1', marks: [{ studentId: student.id, assessmentScores: { 'test-1': 5 }, status: 'draft' }] });
  assert.equal(response.status, 403);
});

test('15.6 marks above a configured assessment maximum return HTTP 422', async () => {
  const response = await postJson('/exams/marks', cookies.subject, { classId: klass.id, subjectId: subject.id, semester: 'Semester 1', marks: [{ studentId: student.id, assessmentScores: { 'test-1': 11 }, status: 'draft' }] });
  assert.equal(response.status, 422, await response.clone().text());
});

test('15.7 marks in a locked semester are forbidden with HTTP 403', async () => {
  await db.updateExamConfig(school.id, { lockedSemesters: ['Semester 1'] } as any);
  const response = await postJson('/exams/marks', cookies.subject, { classId: klass.id, subjectId: subject.id, semester: 'Semester 1', marks: [{ studentId: student.id, assessmentScores: { 'test-1': 5 }, status: 'draft' }] });
  assert.equal(response.status, 403, await response.clone().text());
  await db.updateExamConfig(school.id, { lockedSemesters: [] } as any);
});

test('15.8 parents cannot see submitted marks until the admin publishes them', async () => {
  const config = await db.getExamConfig(school.id, '2026-2027');
  const assessmentScores = Object.fromEntries(config.assessmentComponents.map(component => [component.id, Math.min(5, component.maxMarks)]));
  const [saved] = await db.saveStudentMarks(school.id, klass.id, subject.id, 'Semester 1', [{ studentId: student.id, assessmentScores, status: 'submitted' }], subjectTeacherUser.id);
  await db.flush();
  const hidden = await request(`/exams/marks?studentId=${encodeURIComponent(student.id)}`, cookies.parent);
  assert.equal(hidden.status, 200);
  assert.equal((await hidden.json() as any[]).some(row => row.id === saved.id), false);
  await db.forwardClassMarks(school.id, klass.id, 'Semester 1', formTeacherUser.id, formTeacherUser.fullName);
  await db.approveMarks(school.id, [saved.id], schoolAdmin.id, schoolAdmin.fullName, schoolAdmin.role);
  await db.flush();
  await db.publishClassSemesterResults(school.id, klass.id, 'Semester 1', schoolAdmin.id, schoolAdmin.fullName, schoolAdmin.role);
  await db.flush();
  const published = await request(`/exams/marks?studentId=${encodeURIComponent(student.id)}`, cookies.parent);
  assert.equal(published.status, 200);
  assert.equal((await published.json() as any[]).some(row => row.id === saved.id), true);
});

test('15.9 another teacher cannot grade or modify a colleague homework submission', async () => {
  const assignment = db.createAssignment({ schoolId: school.id, classId: klass.id, subjectId: subject.id, teacherId: subjectTeacherUser.id, title: 'Own homework', description: 'Read chapter one', dueDate: today, maxPoints: 20 });
  const submission = await db.saveAssignmentSubmission({ schoolId: school.id, assignmentId: assignment.id, studentId: student.id, studentName: 'Test Student', content: 'My work' });
  await db.flush();
  const response = await request(`/assignments/${assignment.id}/submissions/${submission.id}/grade`, cookies.other, { method: 'PUT', body: JSON.stringify({ grade: 18, feedback: 'Good work' }) });
  assert.equal(response.status, 403);
});

test('15.10 a parent cannot message a teacher who is not assigned to the linked child class', async () => {
  const response = await postJson('/messages', cookies.parent, { recipientId: otherTeacherUser.id, content: 'Please discuss my child.' });
  assert.equal(response.status, 403);
});

test('15.10a parent child directory returns only canonical linked students in the current school', async () => {
  const response = await request('/parent/children', cookies.parent);
  assert.equal(response.status, 200, await response.clone().text());
  const payload = await response.json() as any;
  assert.deepEqual(payload.data.children.map((child: any) => child.id), [student.id]);
  assert.equal(payload.data.children.some((child: any) => child.id === otherStudent.id), false);
});

test('15.10ab one-child and three-child summaries stay within the same bounded query count', async () => {
  const childTwo = db.createStudent({ schoolId: school.id, studentId: 'TACCEPT-003', firstName: 'Third', middleName: '', lastName: 'Student', gender: 'female', admissionDate: today, fatherPhone: '', classId: klass.id, status: 'active' } as any);
  const childThree = db.createStudent({ schoolId: school.id, studentId: 'TACCEPT-004', firstName: 'Fourth', middleName: '', lastName: 'Student', gender: 'male', admissionDate: today, fatherPhone: '', classId: klass.id, status: 'active' } as any);
  const oneChildParent = makeUser(school.id, 'parent', 'One Child Parent');
  const threeChildParent = makeUser(school.id, 'parent', 'Three Child Parent');
  await db.flush();
  await memory.from('parent_students').insert([
    { id: 'taccept-one-child-link', school_id: school.id, parent_id: oneChildParent.id, student_id: student.id, relation: 'guardian', revoked_at: null },
    { id: 'taccept-three-child-link-1', school_id: school.id, parent_id: threeChildParent.id, student_id: student.id, relation: 'guardian', revoked_at: null },
    { id: 'taccept-three-child-link-2', school_id: school.id, parent_id: threeChildParent.id, student_id: childTwo.id, relation: 'guardian', revoked_at: null },
    { id: 'taccept-three-child-link-3', school_id: school.id, parent_id: threeChildParent.id, student_id: childThree.id, relation: 'guardian', revoked_at: null }
  ]);
  await db.flush();
  const oneCookie = cookieFor(oneChildParent, 'one-child-query-count');
  const threeCookie = cookieFor(threeChildParent, 'three-child-query-count');
  const original = db.queryPage.bind(db);
  let queryCount = 0;
  (db as any).queryPage = (...args: any[]) => { queryCount += 1; return original(...args); };
  try {
    const oneResponse = await request('/parent/children', oneCookie);
    assert.equal(oneResponse.status, 200, await oneResponse.clone().text());
    const one = await oneResponse.json() as any;
    const oneCount = queryCount;
    queryCount = 0;
    const threeResponse = await request('/parent/children', threeCookie);
    assert.equal(threeResponse.status, 200, await threeResponse.clone().text());
    const three = await threeResponse.json() as any;
    const threeCount = queryCount;
    assert.equal(one.data.children.length, 1);
    assert.equal(three.data.children.length, 3);
    assert.equal(threeCount, oneCount, 'three linked children must not add per-child queries');
    assert.ok(threeCount <= 16, 'parent summary must remain below the bounded query-count ceiling');
  } finally {
    (db as any).queryPage = original;
  }
});

test('15.10aa teacher attendance writes invalidate the parent child-summary cache', async () => {
  const beforeResponse = await request('/parent/children', cookies.parent);
  assert.equal(beforeResponse.status, 200, await beforeResponse.clone().text());
  const before = (await beforeResponse.json() as any).data.children.find((child: any) => child.id === student.id);
  assert.ok(before);
  const saved = await postJson('/attendance', cookies.form, { classId: klass.id, date: today, records: [{ studentId: student.id, status: 'present' }] });
  assert.equal(saved.status, 200, await saved.clone().text());
  const afterResponse = await request('/parent/children', cookies.parent);
  assert.equal(afterResponse.status, 200, await afterResponse.clone().text());
  const after = (await afterResponse.json() as any).data.children.find((child: any) => child.id === student.id);
  assert.equal(after.attendanceSummary.present, before.attendanceSummary.present + (before.attendanceSummary.late || before.attendanceSummary.absent ? 1 : 0));
  assert.equal(after.attendanceSummary.late, 0);
  assert.equal(after.attendanceSummary.absent, 0);
});

test('15.10b parent cannot read attendance or homework for an unlinked student', async () => {
  const attendance = await request('/attendance/student?studentId=' + encodeURIComponent(otherStudent.id), cookies.parent);
  assert.equal(attendance.status, 403);
  const homework = await request('/assignments?studentId=' + encodeURIComponent(otherStudent.id), cookies.parent);
  assert.equal(homework.status, 403);
});

test('15.10c removed teacher assignments keep old history readable but block new messages', async () => {
  const allowed = await request('/parent/messages?contactId=' + encodeURIComponent(subjectTeacherUser.id), cookies.parent);
  assert.equal(allowed.status, 200, await allowed.clone().text());
  await memory.from('direct_messages').insert([{
    id: 'parent-old-teacher-message', school_id: school.id,
    sender_id: parentUser.id, sender_name: parentUser.fullName, sender_role: 'parent',
    recipient_id: otherTeacherUser.id, recipient_name: otherTeacherUser.fullName, recipient_role: 'teacher',
    content: 'Historical conversation', timestamp: new Date().toISOString(), is_read: false
  }]);
  await db.flush();
  const history = await request('/parent/messages?contactId=' + encodeURIComponent(otherTeacherUser.id), cookies.parent);
  assert.equal(history.status, 200, await history.clone().text());
  const markRead = await postJson('/messages/read', cookies.parent, { contactId: otherTeacherUser.id });
  assert.equal(markRead.status, 200, await markRead.clone().text());
  const sendNew = await postJson('/messages', cookies.parent, { recipientId: otherTeacherUser.id, content: 'New message after reassignment' });
  assert.equal(sendNew.status, 403);
});

test('15.10d parent cannot submit homework or enter student and teacher portals', async () => {
  const assignment = db.createAssignment({ schoolId: school.id, classId: klass.id, subjectId: subject.id, teacherId: subjectTeacherUser.id, title: 'Parent read-only check', description: 'Read only', dueDate: today, maxPoints: 20 });
  await db.flush();
  const submit = await postJson('/assignments/' + assignment.id + '/submissions', cookies.parent, { content: 'Parent must not submit.' });
  assert.equal(submit.status, 403);
  assert.equal((await request('/student/me', cookies.parent)).status, 403);
  assert.equal((await request('/teacher/subject-assignments', cookies.parent)).status, 403);
});

test('15.10e student cannot enter the parent portal', async () => {
  const response = await request('/parent/children', studentPortalCookie);
  assert.equal(response.status, 403);
});

test('15.10f removing the canonical parent link immediately revokes child attendance access', async () => {
  const removed = await memory.from('parent_students').update({ revoked_at: new Date().toISOString() }).eq('school_id', school.id).eq('parent_id', parentUser.id).eq('student_id', student.id);
  assert.equal(removed.error, null);
  assert.equal(memory.rows('parent_students').some(row => row.parent_id === parentUser.id && row.student_id === student.id && Boolean(row.revoked_at)), true);
  const response = await request('/attendance/student?studentId=' + encodeURIComponent(student.id), cookies.parent);
  assert.equal(response.status, 403);
  const children = await request('/parent/children', cookies.parent);
  assert.equal(children.status, 200);
  assert.deepEqual((await children.json() as any).data.children, []);
});

test('15.11 a teacher cannot open another teacher personal payslip', async () => {
  const record = db.createPayrollRecord({ schoolId: school.id, staffId: otherTeacher.id, userId: otherTeacherUser.id, staffName: otherTeacherUser.fullName, staffRole: 'Teacher', payrollMonth: '2026-11', baseSalary: 1000, allowances: [], deductions: [], allowanceTotal: 0, deductionTotal: 0, netSalary: 1000, paidAmount: 0, balanceDue: 1000, paymentHistory: [], status: 'draft' } as any);
  await db.flush();
  const response = await request(`/payroll/${record.id}/payslip.pdf`, cookies.subject);
  assert.equal(response.status, 403);
});

test('15.12 a school teacher cannot read attendance for a class in another tenant', async () => {
  const response = await postJson('/attendance', cookies.form, { classId: tenantClass.id, date: today, records: [{ studentId: student.id, status: 'present' }] });
  assert.equal(response.status, 404);
});

test('15.13 a changed class-subject assignment is reflected on the next teacher portal assignment request', async () => {
  const before = await request('/teacher/subject-assignments', cookies.subject);
  assert.equal(before.status, 200);
  assert.ok((await before.json() as any[]).some(row => row.subject?.id === subject.id));
  await memory.from('class_subjects').update({ teacher_id: otherTeacher.id }).eq('id', 'ta-cs-math');
  const afterChange = await request('/teacher/subject-assignments', cookies.subject);
  assert.equal(afterChange.status, 200);
  assert.equal((await afterChange.json() as any[]).some(row => row.subject?.id === subject.id), false);
});

test('15.14 assigned-class student scope is complete and empty class/homework states are explicit', async () => {
  const extraAssignedClass = await request(`/students?classId=${encodeURIComponent(otherClass.id)}`, cookies.form);
  assert.equal(extraAssignedClass.status, 200);
  assert.ok((await extraAssignedClass.json() as any[]).some(row => row.id === otherStudent.id));

  const unassignedClass = await request(`/students?classId=${encodeURIComponent(klass.id)}`, cookies.empty);
  assert.equal(unassignedClass.status, 403);

  const emptyClassStudents = await request(`/students?classId=${encodeURIComponent(emptyClass.id)}`, cookies.empty);
  assert.equal(emptyClassStudents.status, 200);
  assert.deepEqual(await emptyClassStudents.json(), []);

  const response = await request('/assignments', cookies.empty);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('15.15 teacher timetable returns an empty state when no timetable slots are assigned', async () => {
  const response = await request('/timetable', cookies.empty);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});
