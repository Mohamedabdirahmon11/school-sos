import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('class teachers submit attendance while administrators review and contact parents', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const admin = read('../src/components/schooladmin/AttendanceView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(teacher, /recordDailyAttendance/);
  assert.doesNotMatch(teacher, /wa\.me/);
  assert.match(admin, /openAbsentStudentWhatsApp/);
  assert.doesNotMatch(admin, /handleSaveAttendance/);
  assert.match(api, /Only the assigned class teacher can submit daily attendance/);
});

test('teachers enter exam marks and school administrators only review and approve', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const admin = read('../src/components/schooladmin/ExamsResultsView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(teacher, /saveMarks\(selectedClassId/);
  assert.doesNotMatch(admin, /handleSaveMarks/);
  assert.match(admin, /handleApproveAll/);
  assert.match(api, /Only assigned teachers can enter and submit exam marks/);
  assert.match(api, /isFormTeacher/);
  assert.match(api, /classTeacherId === user\.id/);
  assert.match(api, /form-teacher-\$\{klass\.id\}-\$\{subject\.id\}/);
});

test('Form Teachers review every class subject but enter marks only for their assigned subject', () => {
  const api = read('../src/server/api.ts');
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const storage = read('../src/server/storage.ts');
  assert.ok(api.includes('formTeacherClassIds = formTeacherClasses.items.map'));
  assert.ok(api.includes("'users.role': 'teacher'"));
  assert.match(api, /isFormTeacher \? classAssignments\.items\.map\(\(item: any\) => item\.subjectId\)/);
  assert.match(api, /canEditMarks: assignment\.teacherId === teacher\.id/);
  assert.match(api, /if \(!assignment\.total\)/);
  assert.doesNotMatch(api, /mayFillFormTeacherSubject/);
  assert.match(api, /subject assigned to your teacher profile/);
  assert.match(api, /res\.json\(isFormTeacher \? classMarks : classMarks\.filter\(mark => editableSubjectIds\.has\(mark\.subjectId\)\)\)/);
  assert.match(teacher, /placeholder="0 \/ ABS \/ LB"/);
  assert.match(storage, /value !== 'ABS' && value !== 'LB'/);
});

test('teacher notices load independently and cannot block core teaching workflows', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const coreLoad = teacher.slice(teacher.indexOf('const initialData = useApi'), teacher.indexOf('const [assignmentsData'));
  assert.doesNotMatch(coreLoad, /getNotices/);
  assert.match(teacher, /const noticesState = useApi\(\(\) => ApiClient\.getNotices\(\)/);
  assert.match(teacher, /noticesState\.loading/);
  assert.match(teacher, /noticesState\.error \?/);
  assert.match(teacher, /<ErrorState error=\{noticesState\.error\} onRetry=\{noticesState\.retry\} \/>/);
});

test('teacher workspace exposes every teaching task and batch class workflows', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /activeTab === 'dashboard'/);
  assert.match(teacher, /activeTab === 'timetable'/);
  assert.match(teacher, /activeTab === 'students'/);
  assert.match(teacher, /activeTab === 'attendance'/);
  assert.match(teacher, /activeTab === 'grades'/);
  assert.match(teacher, /Class results review/);
  assert.match(teacher, /Enter marks by subject and exam type/);
  assert.match(teacher, /Student name \/ ID/);
  assert.match(teacher, /examRegisterRows/);
  assert.match(teacher, /rankExamStudentResults/);
  assert.match(teacher, /allClassMarksSubmitted/);
  assert.match(teacher, /t\('exam_waiting_for_all_subjects'\)/);
  assert.match(teacher, /Enter individual assessment components/);
  assert.match(teacher, /activeTab === 'exam_results'/);
  assert.match(teacher, /activeTab === 'assignments'/);
  assert.match(teacher, /activeTab === 'notices'/);
  assert.match(teacher, /setActiveTab\(initialTab\)/);
  assert.match(teacher, /Small Exam/);
  assert.match(teacher, /Big Exam/);
  assert.match(teacher, /EXAM RESULTS — READ ONLY/);
  assert.match(teacher, /attendanceCounts/);
  assert.match(teacher, /Teaching schedule/);
  assert.match(teacher, /lessons/);
  assert.match(teacher, /getTimetable\(\{ scope: 'school' \}\)/);
  assert.match(teacher, /Your lesson/);
  assert.match(teacher, /Student Submissions/);
  assert.match(teacher, /Faculty notices & announcements/);
  assert.match(teacher, /Submit marks/);
  assert.match(teacher, /t\('exam_forward_to_admin'\)/);
});

test('teacher appointment supports optional multiple profile tags and one-time school credentials', () => {
  const admin = read('../src/components/schooladmin/TeachersView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(admin, /selectedClassIds/);
  assert.match(admin, /selectedSubjectIds/);
  assert.match(admin, /selectedFormTeacherClassId/);
  assert.doesNotMatch(admin, /Teacher ID \*/);
  assert.match(admin, /Teacher PIN \(required\)/);
  assert.match(admin, /Date of Joining/);
  assert.match(api, /nextSchoolTeacherId\(school\)/);
  assert.match(api, /Teacher PIN must contain 4–6 digits/);
  assert.match(admin, /formTeacherClassId/);
  assert.match(admin, /Form Teacher class/);
  assert.match(api, /body\.formTeacherClassId/);
  assert.match(api, /classTeacherId: account\.id/);
  assert.match(admin, /Teacher ID: /);
  assert.match(admin, /Initial PIN:/);
  assert.match(admin, /Reset PIN/);
  assert.match(api, /Staff ID and PIN are required/);
  assert.match(api, /Every assigned class must belong to this school|Every assigned subject must belong to this school/);
});

test('Form Teacher class and student reads are included in the private Supabase RLS helpers', () => {
  const migration = read('../supabase/migrations/20261111070000_form_teacher_rls_scope.sql');
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.auth_can_access_student/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.auth_can_access_class/);
  assert.match(migration, /c\.class_teacher_id = u\.id/);
  assert.match(migration, /c\.id = s\.class_id/);
  assert.match(migration, /c\.school_id = s\.school_id/);
  assert.match(migration, /u\.school_id = c\.school_id AND u\.role = 'teacher'/);
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\./);
});

test('teacher messages and personal payslips remain available through role navigation', () => {
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  const app = read('../src/App.tsx');
  const messages = read('../src/components/schooladmin/MessagesView.tsx');
  const payroll = read('../src/components/accountant/AccountantPayrollView.tsx');
  assert.match(sidebar, /item\('t_students'/);
  assert.match(sidebar, /item\('t_exam_results'/);
  assert.match(sidebar, /item\('t_messages'/);
  assert.match(sidebar, /item\('t_payslips'/);
  assert.match(app, /activeView === 't_messages' && <MessagesView \/>/);
  assert.match(app, /activeView === 't_payslips' && <StaffPayslipsView \/>/);
  assert.match(messages, /const isTeacher = user\?\.role === 'teacher'/);
  assert.match(payroll, /ApiClient\.getMyPayslips\(\)/);
  assert.match(payroll, /ApiClient\.downloadPayslipPdf\(recordId\)/);
  assert.match(payroll, /Preparing PDF/);
  assert.match(payroll, /setError\(reason instanceof Error/);
  assert.match(messages, /selectedContact \? 'hidden md:flex'/);
  assert.match(messages, /Back to contacts/);
  assert.match(messages, /hasInitializedContact/);
  assert.match(messages, /contactId: selectedContact\?\.id/);
  const client = read('../src/services/api.ts');
  assert.match(client, /query\.set\('contactId', params\.contactId\)/);
  const api = read('../src/server/api.ts');
  assert.match(api, /and\(or\(sender_id\.eq\.\$\{user\.id\},recipient_id\.eq\.\$\{user\.id\}\),or\(sender_id\.eq\.\$\{contactId\},recipient_id\.eq\.\$\{contactId\}\)\)/);
});


test('teacher class switching clears stale student data and loads only the active workflow data', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /setStudents\(\[\]\);[\s\S]*setIsLoadingClassData\(true\)/);
  assert.match(teacher, /if \(needsAttendance && !formTeacherClasses\.some/);
  assert.match(teacher, /if \(needsStudents && !classes\.some/);
  assert.match(teacher, /Your teaching class/);
  assert.match(teacher, /Students in classes where you teach a subject or serve as Form Teacher/);
  assert.match(teacher, /\{classes\.map\(klass => <option/);
  assert.match(teacher, /const needsAttendance = activeTab === 'attendance'/);
  assert.match(teacher, /const needsGrades = activeTab === 'grades'/);
  assert.match(teacher, /needsAttendance\s*\? ApiClient\.getDailyAttendance/);
  assert.match(teacher, /needsGrades \|\| needsResults\s*\? ApiClient\.getMarks/);
  assert.match(teacher, /if \(!needsAttendance && !needsGrades && !needsStudents && !needsResults\) return/);
  assert.match(teacher, /isLoadingClassData \|\| isReadOnly \|\| students\.length === 0/);
  assert.match(teacher, /Loading students and attendance/);
  assert.match(teacher, /isLoadingClassData \|\| !editableClassSubjects.length \|\| !students.length/);
  assert.match(teacher, /disabled=\{isReadOnly \|\| isSaving \|\| isLoadingClassData \|\| !editableClassSubjects\.length \|\| !students\.length\}/);
});


test('teacher homework submission switching ignores stale responses and clears old grading drafts', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /const submissionRequestRef = useRef\(0\)/);
  assert.match(teacher, /const requestId = \+\+submissionRequestRef\.current/);
  assert.match(teacher, /if \(requestId !== submissionRequestRef\.current\) return/);
  assert.match(teacher, /if \(requestId === submissionRequestRef\.current\) setIsLoadingSubmissions\(false\)/);
  assert.match(teacher, /setReviewSubmissions\(\[\]\);[\s\S]*setGradeDrafts\(\{\}\)/);
  assert.match(teacher, /useEffect\(\(\) => \(\) => \{ submissionRequestRef\.current \+= 1; \}, \[\]\)/);
});

test('teacher homework creation validates trimmed content, school-local due date, and point range', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /const title = assignmentTitle\.trim\(\)/);
  assert.match(teacher, /const description = assignmentDescription\.trim\(\)/);
  assert.match(teacher, /const today = getSchoolLocalDate\(school\?\.timezone\)/);
  assert.match(teacher, /assignmentDueDate < today/);
  assert.match(teacher, /Number\.isInteger\(maxPoints\).*maxPoints < 1.*maxPoints > 1000/s);
  assert.match(teacher, /min=\{getSchoolLocalDate\(school\?\.timezone\)\}/);
  assert.match(teacher, /disabled=\{isReadOnly \|\| gradingSubmissionId !== null\}/);
});

test('teacher has separate subject-wise Small Exam and Big Exam entry and a read-only results page', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  const mobileNav = read('../src/components/layout/MobileBottomNav.tsx');
  const app = read('../src/App.tsx');
  assert.match(mobileNav, /id: 't_timetable'/);
  assert.match(mobileNav, /id: 't_grades'/);
  assert.match(sidebar, /item\('t_students'/);
  assert.match(sidebar, /item\('t_grades'/);
  assert.match(sidebar, /item\('t_exam_results'/);
  assert.match(app, /activeView\.replace\('t_', ''\)/);
  assert.match(teacher, /examType === 'small' \? 'continuous' : 'final'/);
  assert.match(teacher, /gradeSubjects\.map\(subject =>/);
  assert.match(teacher, /EXAM RESULTS — READ ONLY/);
  assert.match(teacher, /mark\.smallExamMarks/);
  assert.match(teacher, /mark\.bigExamMarks/);
});

test('Form Teacher exam register includes every active class subject while subject teachers stay within assigned subjects', () => {
  const api = read('../src/server/api.ts');
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const routeStart = api.indexOf("apiRouter.get('/teacher/subject-assignments'");
  const routeEnd = api.indexOf("apiRouter.post('/subjects'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.ok(route.includes("queryAllRows('class_subjects', { school_id: school.id, class_id: formTeacherClasses.map"));
  assert.ok(route.includes("isFormTeacherClass: true"));
  assert.ok(route.includes("isFormTeacher: true"));
  assert.match(teacher, /const gradeSubjects: Subject\[\] = isFormTeacher \? allClassSubjects : editableClassSubjects/);
  assert.match(teacher, /const allClassSubjects = uniqueSubjects\(classAssignments\)/);
  assert.match(teacher, /const editableClassSubjects = uniqueSubjects\(classAssignments\.filter\(\(assignment: any\) => !assignment\.isFormTeacher \|\| assignment\.canEditMarks === true\)\)/);
  assert.match(teacher, /const examRegisterRows = useMemo/);
});

test('teacher dashboard shows Form Teacher class and assigned teaching subjects without duplicate task shortcuts', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /EMPTY_TEACHER_DATA/);
  assert.match(teacher, /useMemo\(\(\) => \[\.\.\.new Map/);
  assert.match(teacher, /assignedClassStudentTotal/);
  assert.match(teacher, /Casharrada laguu qoondeeyay/);
  assert.match(teacher, /Form Teacher responsibility/);
  assert.match(teacher, /Your assigned class/);
  assert.match(teacher, /Subjects you teach/);
  assert.doesNotMatch(teacher, /Enter marks<\/button>/);
  assert.doesNotMatch(teacher, /Class attendance<\/button>/);
});

test('teacher sidebar remains fixed while the central viewport owns vertical scrolling', () => {
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  const app = read('../src/App.tsx');
  assert.match(sidebar, /fixed inset-y-0 left-0/);
  assert.match(sidebar, /overflow-y-auto/);
  assert.match(app, /<main className="min-h-0 flex-1 overflow-y-auto overscroll-contain/);
});



test('daily attendance uses one atomic bulk upsert on the existing natural key', () => {
  const storage = read('../src/server/storage.ts');
  const start = storage.indexOf('public async recordDailyAttendance(');
  const end = storage.indexOf('// EXAMS & RESULTS', start);
  const method = storage.slice(start, end);
  assert.ok(method.includes(".upsert(payload, { onConflict: 'school_id,class_id,student_id,date' })"));
  assert.ok(method.includes("'upsert-batch'"));
  assert.ok(!method.includes('queryRows'));
  assert.ok(!method.includes('this.save()'));
  assert.ok(!method.includes('this.flush()'));
});

test('Form Teacher attendance authorization loads its class once without subject-assignment lookups', () => {
  const api = read('../src/server/api.ts');
  const start = api.indexOf("apiRouter.post('/attendance'");
  const end = api.indexOf('// 6. EXAMS & RESULTS', start);
  const route = api.slice(start, end);
  assert.equal(route.split('db.getClassById(').length - 1, 1);
  assert.ok(route.includes('attendanceClass.classTeacherId !== user.id'));
  assert.ok(!route.includes('canAccessTeachingClass'));
});

test('teacher class scope uses school-bound joins instead of separate teacher and full class reads', () => {
  const api = read('../src/server/api.ts');
  const start = api.indexOf('async function getTeacherAssignedClassIds(');
  const end = api.indexOf('async function getNoticeClassIds', start);
  const helper = api.slice(start, end);
  assert.ok(helper.includes("'teachers.user_id': userId"));
  assert.ok(helper.includes("'teachers.school_id': schoolId"));
  assert.ok(helper.includes("'users.role': 'teacher'"));
  assert.ok(helper.includes("'users.school_id': schoolId"));
  assert.ok(!helper.includes("queryPage('teachers'"));
  assert.ok(!helper.includes('db.getClasses('));
});

test('teaching-class authorization avoids subject queries for the assigned Form Teacher', () => {
  const api = read('../src/server/api.ts');
  const start = api.indexOf('async function canAccessTeachingClass(');
  const end = api.indexOf('async function canAccessStudentRecord', start);
  const helper = api.slice(start, end);
  assert.ok(helper.includes("queryPage('classes'"));
  assert.ok(helper.includes("classPage.items[0]"));
  assert.ok(helper.includes("'teachers.user_id': user.id"));
  assert.ok(!helper.includes("queryPage('teachers'"));
});


test('teacher portal provides personal timetable first and a deliberate school-wide switch', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /timetableScope, setTimetableScope/);
  assert.match(teacher, /ApiClient\.getTimetable\(\)/);
  assert.match(teacher, /ApiClient\.getTimetable\(\{ scope: 'school' \}\)/);
  assert.match(teacher, /const timetableRows = timetableScope === 'mine' \? timetable : schoolTimetable/);
  assert.match(teacher, /assignment\.teacherId === slot\.teacherId/);
  assert.match(teacher, /Filter timetable by day/);
  assert.match(teacher, /All days/);
  assert.match(teacher, /My lessons/);
  assert.match(teacher, /Full school timetable/);
  const client = read('../src/services/api.ts');
  assert.match(client, /params\.append\('scope', 'school'\)/);
});

test('teacher workflows provide mobile student cards, searchable registers, and touch-sized attendance and mark inputs', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /visibleStudents/);
  assert.match(teacher, /Search attendance students/);
  assert.match(teacher, /md:hidden/);
  assert.match(teacher, /min-h-11 rounded-lg/);
  assert.match(teacher, /Search students for marks/);
  assert.match(teacher, /Search student name or ID/);
});

test('teacher mobile quick navigation prioritizes daily teaching actions while the full menu retains other sections', () => {
  const mobile = read('../src/components/layout/MobileBottomNav.tsx');
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  assert.match(mobile, /id: 't_timetable'/);
  assert.match(mobile, /id: 't_attendance'/);
  assert.match(mobile, /id: 't_grades'/);
  assert.match(sidebar, /item\('t_exam_results'/);
  assert.match(sidebar, /item\('t_assignments'/);
  assert.match(sidebar, /item\('t_messages'/);
  assert.match(sidebar, /item\('t_payslips'/);
});


test('Form Teacher rankings and class totals stay hidden until every active subject is submitted', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const calculations = read('../src/lib/exam-calculations.ts');
  assert.match(teacher, /allClassMarksSubmitted = isFormTeacher/);
  assert.match(teacher, /disabled=\{isReadOnly \|\| isSaving \|\| isLoadingClassData \|\| !allClassMarksSubmitted \|\| classAlreadyForwarded\}/);
  assert.match(teacher, /allClassMarksSubmitted \? row\.total/);
  assert.match(teacher, /t\('exam_drafts_autosaved'\)/);
  assert.match(teacher, /row\.student\.rollNumber \|\| row\.student\.studentId/);
  assert.match(calculations, /row\.total !== previousTotal/);
});

test('Form Teacher review uses full 100-point subject totals rather than one exam half', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /calculateExamSubjectTotal\(scores, assessmentComponents\)/);
  assert.match(teacher, /row\.total\.toFixed\(1\).*row\.max/);
  assert.doesNotMatch(teacher.slice(teacher.indexOf('const examRegisterRows'), teacher.indexOf('if (initialData.loading')), /assessmentComponents\.filter\(component => component\.category/);
});


test('Form Teacher class review is a separate read-only workflow with controlled subject reopening', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  const api = read('../src/server/api.ts');
  const storage = read('../src/server/storage.ts');
  assert.match(teacher, /activeTab === 'exam_results' && isFormTeacher/);
  assert.match(teacher, /editableClassSubjects\.map\(subject =>/);
  assert.match(teacher, /handleReopenSubjectMarks/);
  assert.match(teacher, /!allClassMarksSubmitted/);
  assert.match(api, /apiRouter\.post\('\/exams\/reopen-subject'/);
  assert.match(api, /klass\.classTeacherId !== user\.id/);
  assert.match(storage, /reopenClassSubjectMarks/);
  assert.match(storage, /mark\.status !== 'submitted'/);
});


test('only School Admin can approve, return, publish, or withdraw exam results', () => {
  const api = read('../src/server/api.ts');
  assert.match(api, /apiRouter\.post\('\/exams\/approve', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/exams\/return', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/exams\/publish', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/exams\/unpublish', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
});
