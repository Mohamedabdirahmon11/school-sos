import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const api=read('../src/server/api.ts');
const portal=read('../src/components/parent/ParentPortalView.tsx');
const styles=read('../src/components/parent/parent-portal-design.css');
const migration=read('../supabase/migrations/20261123010000_parent_portal_relationships.sql');

test('parent_students is the canonical tenant-scoped relationship with revocation',()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.parent_students/);
 assert.match(migration,/UNIQUE \(parent_id, student_id\)/);
 assert.match(migration,/FOREIGN KEY \(parent_id, school_id\)/);
 assert.match(migration,/FOREIGN KEY \(student_id, school_id\)/);
 assert.match(migration,/users_sync_parent_student_links/);
 assert.match(migration,/linked_student_ids/);
 assert.doesNotMatch(migration,/DELETE FROM public\.direct_messages/);
});

test('parent child directory is authenticated, parent-only, school-scoped and link-scoped',()=>{
 const start=api.indexOf("apiRouter.get('/parent/children'");
 const end=api.indexOf("apiRouter.get('/parent/notices'",start);
 const route=api.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(route,/normalizeRole\(user\.role\) !== 'parent'/);
 assert.match(route,/school_id: school\.id, parent_id: user\.id/);
 assert.match(route,/school_id: school\.id, id: studentIds/);
 assert.match(route,/currentEnrollments/);
 assert.match(route,/attendanceSummary/);
 assert.match(route,/marksSummary/);
 assert.match(route,/homeworkPending/);
 assert.match(route,/unreadNotices/);
});

test('student record access for parents requires a current parent_students link',()=>{
 const helper=api.slice(api.indexOf('async function getParentLinkedStudentIds'),api.indexOf('async function canAccessStudentRecord'));
 const access=api.slice(api.indexOf('async function canAccessStudentRecord'),api.indexOf('// Middleware: Require School Tenant Context'));
 assert.match(helper,/parent_students/);
 assert.match(helper,/school_id: schoolId, parent_id: parentId/);
 assert.match(access,/getParentLinkedStudentIds\(student\.schoolId, user\.id\)/);
 assert.doesNotMatch(access,/fatherPhone|motherPhone|linkedStudentIds/);
});

test('parent homework, attendance, marks, timetable, notices and messages use canonical links',()=>{
 const assignments=api.slice(api.indexOf("apiRouter.get('/assignments'"),api.indexOf("apiRouter.post('/assignments'"));
 const attendance=api.slice(api.indexOf("apiRouter.get('/attendance/student'"),api.indexOf("apiRouter.post('/attendance'"));
 const marks=api.slice(api.indexOf("apiRouter.get('/exams/marks'"),api.indexOf("apiRouter.post('/exams/marks'"));
 const timetable=api.slice(api.indexOf("apiRouter.get('/timetable'"),api.indexOf("apiRouter.post('/timetable'"));
 const contacts=api.slice(api.indexOf("apiRouter.get('/messages/contacts'"),api.indexOf("apiRouter.get('/messages'"));
 const send=api.slice(api.indexOf("apiRouter.post('/messages'"),api.indexOf("apiRouter.post('/messages/read'"));
 assert.match(assignments,/getParentLinkedStudentIds/);
 assert.match(assignments,/PARENT_CHILD_FORBIDDEN/);
 assert.match(attendance,/canAccessStudentRecord/);
 assert.match(attendance,/getStudentCurrentClassId/);
 assert.match(marks,/publishedAt/);
 assert.match(marks,/getStudentCurrentClassId/);
 assert.match(timetable,/getParentLinkedStudentIds/);
 assert.match(contacts,/getParentLinkedStudentIds/);
 assert.match(send,/getNoticeClassIds\(school\.id, user\)/);
 assert.match(send,/getNoticeClassIds\(school\.id, recipient\)/);
});

test('parent notices are paginated and track read receipts per parent',()=>{
 const start=api.indexOf("apiRouter.get('/parent/notices'");
 const end=api.indexOf("apiRouter.get('/student/me'",start);
 const route=api.slice(start,end);
 assert.match(route,/notice_reads/);
 assert.match(route,/parent_id: user\.id/);
 assert.match(route,/pagination/);
 assert.match(route,/audience\.eq\.parents/);
});

test('parent UI has nine reference sections and no local/demo/browser-persisted data',()=>{
 for(const label of ['Hoyga','Caruurta','Jadwal','Imaanshaha','Natiijo','Hawlo','Ogeysiis','Fariimo','Profile']) assert.ok(portal.includes(label),label);
 assert.doesNotMatch(portal,/localStorage|sessionStorage|const\s+(?:demo|mock|seed)\w*\s*=/i);
 assert.doesNotMatch(portal,/percentage|celcelis|%/i);
 assert.doesNotMatch(portal,/submitAssignment|createAssignment/);
 assert.match(portal,/ApiClient\.request<any>\('\/parent\/children'\)/);
 assert.match(portal,/\?studentId=/);
});

test('parent UI shows counts, published score totals, read-only homework and responsive accessible navigation',()=>{
 assert.match(portal,/attendanceSummary/);
 assert.match(portal,/marksSummary/);
 assert.match(portal,/Wuu yimid/);
 assert.match(portal,/schemeSnapshot/);
 assert.match(portal,/Published oo keliya/);
 assert.match(portal,/La gudbiyey/);
 assert.match(portal,/aria-current/);
 assert.match(portal,/Dheeraad/);
 assert.match(styles,/grid-template-columns:240px/);
 assert.match(styles,/max-width:760px/);
 assert.match(styles,/safe-area-inset-bottom/);
 assert.match(styles,/focus-visible/);
});

test('parent profile and child list use server data and one-child mode hides sibling controls',()=>{
 assert.match(portal,/children\.length>1/);
 assert.match(portal,/children\.length>1&&<div className="pp-child-strip"/);
 assert.match(portal,/parent\?\.fullName/);
 assert.match(portal,/x\.studentId/);
});

test('parent message history is paginated and scoped to the authenticated parent conversation',()=>{
 const start=api.indexOf("apiRouter.get('/parent/messages'");
 const end=api.indexOf("apiRouter.get('/parent/notices'",start);
 const route=api.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(route,/normalizeRole\(user\.role\) !== 'parent'/);
 assert.match(route,/school_id: school\.id/);
 assert.match(route,/sender_id\.eq\.' \+ user\.id/);
 assert.match(route,/pagination/);
 assert.match(route,/pageSize = Math\.min\(50/);
});

test('parent can read and mark messages only for teachers currently assigned to a linked child',()=>{
 const start=api.indexOf("apiRouter.get('/parent/messages'");
 const end=api.indexOf("apiRouter.get('/parent/notices'",start);
 const history=api.slice(start,end);
 const readStart=api.indexOf("apiRouter.post('/messages/read'");
 const readEnd=api.indexOf("apiRouter.get('/support/tickets'",readStart);
 const read=api.slice(readStart,readEnd);
 assert.match(history,/getNoticeClassIds\(school\.id, user\)/);
 assert.match(history,/getTeacherAssignedClassIds\(school\.id, contactId\)/);
 assert.match(history,/PARENT_CONTACT_FORBIDDEN/);
 assert.match(read,/normalizeRole\(user\.role\) === 'parent'/);
 assert.match(read,/getTeacherAssignedClassIds/);
 assert.match(read,/PARENT_CONTACT_FORBIDDEN/);
});

test('child summary uses batched queries rather than per-child database reads',()=>{
 const start=api.indexOf("apiRouter.get('/parent/children'");
 const end=api.indexOf("apiRouter.get('/parent/messages'",start);
 const route=api.slice(start,end);
 assert.match(route,/Promise\.all/);
 assert.match(route,/queryAllRows\('attendance_records'/);
 assert.match(route,/queryAllRows\('student_marks'/);
 assert.match(route,/queryAllRows\('assignments'/);
 assert.match(route,/queryAllRows\('assignment_submissions'/);
 assert.match(route,/queryAllRows\('school_notices'/);
 assert.doesNotMatch(route,/students\.items\.map\(async/);
 assert.match(route,/Cache-Control.*no-store/);
});

test('assignment removal keeps old conversation history but disables new parent messages',()=>{
 const contacts=api.slice(api.indexOf("apiRouter.get('/messages/contacts'"),api.indexOf("apiRouter.get('/messages'"));
 const parentHistory=api.slice(api.indexOf("apiRouter.get('/parent/messages'"),api.indexOf("apiRouter.get('/parent/notices'"));
 const send=api.slice(api.indexOf("apiRouter.post('/messages'"),api.indexOf("apiRouter.post('/messages/read'"));
 assert.match(contacts,/historyTeacherIds/);
 assert.match(contacts,/historyOnly/);
 assert.match(contacts,/canSend/);
 assert.match(parentHistory,/currentlyAssigned/);
 assert.match(parentHistory,/result\.items\.length === 0/);
 assert.match(send,/Parents may message only teachers assigned to their children/);
 assert.match(portal,/contact\?\.canSend===false/);
});

test('parent data endpoints are gated by the existing setup 423 readiness check',()=>{
 assert.match(api,/parentPortalSetupGate/);
 assert.match(api,/requireParentPortalSetupReady/);
 assert.match(api,/SCHOOL_SETUP_REQUIRED/);
});
