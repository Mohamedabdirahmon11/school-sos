import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const client = read('../src/services/api.ts');
const portal = read('../src/components/student/StudentPortalView.tsx');
const styles = read('../src/components/student/student-portal-design.css');

test('student profile resolves exactly the authenticated school student link', () => {
  const start = api.indexOf("apiRouter.get('/student/me'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /normalizeRole\(user\.role\) !== 'student'/);
  assert.match(route, /school_id: school\.id,\s*student_id: user\.studentId/);
  assert.match(route, /ok: true/);
  assert.match(route, /formTeacherName/);
  assert.doesNotMatch(route, /req\.query\.studentId|req\.body\.studentId/);
});

test('student profile endpoint rejects non-students and never trusts a client student identifier', () => {
  const start = api.indexOf("apiRouter.get('/student/me'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.match(route, /status\(403\).*STUDENT_ONLY/);
  assert.match(route, /STUDENT_NOT_LINKED/);
  assert.match(client, /getStudentProfile\(\)[\s\S]*?request<any>\('\/student\/me'\)/);
});

test('student notices are class-scoped, paginated, and include per-user read receipts', () => {
  const start = api.indexOf("apiRouter.get('/student/notices'");
  const end = api.indexOf("apiRouter.get('/notices'", start);
  const route = api.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /normalizeRole\(user\.role\) !== 'student'/);
  assert.match(route, /getNoticeClassIds\(school\.id, user\)/);
  assert.match(route, /publish_date\.lte/);
  assert.match(route, /audience\.eq\.students/);
  assert.match(route, /notice_reads/);
  assert.match(route, /user_id: user\.id/);
  assert.match(route, /isRead:/);
  assert.equal((route.match(/queryPage\(/g) || []).length, 2, 'notice read state must use bounded set queries, not per-notice queries');
});

test('student marks are published-only at the server and again filtered in the portal', () => {
  const start = api.indexOf("apiRouter.get('/exams/marks'");
  const end = api.indexOf("apiRouter.post('/exams/marks'", start);
  const route = api.slice(start, end);
  assert.match(route, /marks = marks\.filter\(mark => Boolean\(mark\.publishedAt\)\)/);
  assert.match(portal, /marksState\.data\)\?marksState\.data\.filter\(\(m:any\)=>Boolean\(m\.publishedAt\)\)/);
  assert.match(portal, /Weli lama daabicin natiijooyinkaaga/);
  assert.match(portal, /ExamTimetablePrint schedules=\{publishedExamSchedules\}/);
  assert.match(portal, /getPublishedExamSchedules\(studentRecord\.classId\)/);
  assert.match(portal, /term-marks\/report-cards\?studentId=/);
  assert.match(api, /const currentClassId = ownStudent \? await getStudentCurrentClassId\(school\.id, ownStudent\.id, ownStudent\.classId\) : ''/);
});

test('student homework reads current enrollment class and only their own submissions', () => {
  const start = api.indexOf("apiRouter.get('/assignments'");
  const end = api.indexOf("apiRouter.post('/assignments'", start);
  const route = api.slice(start, end);
  assert.match(route, /studentCurrentClassIds/);
  assert.match(route, /getStudentCurrentClassId\(school\.id/);
  assert.match(route, /student_id: studentIds/);
  assert.match(api, /Only students can submit homework/);
  assert.match(api, /student_id: student\.id/);
});

test('student-teacher message contacts and sends require a current class assignment', () => {
  const start = api.indexOf("apiRouter.get('/messages/contacts'");
  const end = api.indexOf("apiRouter.post('/messages/read'", start);
  const route = api.slice(start, end);
  assert.match(route, /student: \['teacher'\]/);
  assert.match(route, /teacher: \['parent', 'student'\]/);
  assert.match(route, /eligibleUserIds/);
  assert.match(route, /getTeacherAssignedClassIds\(school\.id, recipient\.id\)/);
  assert.match(route, /getTeacherAssignedClassIds\(school\.id, user\.id\)/);
  const studentContactsBlock = route.slice(route.indexOf("if (user.role === 'student')"), route.indexOf("} else {", route.indexOf("if (user.role === 'student')")));
  assert.doesNotMatch(studentContactsBlock, /db\.getUsers\(/, 'student contacts must not scan every school user');
  assert.match(route, /Students may message only teachers assigned to their current class/);
  assert.match(route, /Teachers may message only students in their assigned classes/);
});

test('student portal uses real APIs and does not persist or synthesize student data', () => {
  assert.doesNotMatch(portal, /localStorage|sessionStorage|const\s+(?:demo|mock|seed)\w*\s*=/i);
  assert.doesNotMatch(portal, /ApiClient\.getStudents\(/);
  for (const method of ['getStudentProfile', 'getTimetable', 'getStudentAttendance', 'getStudentMarks', 'getAssignments', 'getStudentNotices', 'getMessageContacts', 'getMessages']) {
    assert.match(portal, new RegExp('ApiClient\\.' + method + '\\('));
  }
});

test('student portal reference layout preserves desktop sidebar, four-button mobile navigation, and accessibility', () => {
  assert.match(styles, /grid-template-columns:240px/);
  assert.match(styles, /max-width:760px/);
  assert.match(styles, /--sp-nav:#1d2b53/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /focus-visible/);
  assert.match(portal, /aria-current=\{selected\?'page':undefined\}/);
  assert.match(portal, /sp-bottom-nav/);
  assert.match(portal, /Dheeraad/);
  assert.match(portal, /noticePage/);
  assert.match(portal, /messagePage/);
  assert.match(portal, /sp-pagination/);
  assert.match(portal, /profileState\.loading/);
  assert.match(portal, /PortalError/);
  assert.match(portal, /sp-empty/);
});
