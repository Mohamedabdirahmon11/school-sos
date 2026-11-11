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

test('Form Teachers see every student and can complete every subject in their homeroom class', () => {
  const api = read('../src/server/api.ts');
  assert.match(api, /formTeacherClassIds = classes[\s\S]*klass\.classTeacherId === userId/);
  assert.match(api, /isFormTeacher \? classAssignments\.items\.map\(\(item: any\) => item\.subjectId\)/);
  assert.match(api, /mayFillFormTeacherSubject = isFormTeacher && classSubject\.items\.length > 0/);
  assert.match(api, /canEditMarks: true/);
});

test('teacher workspace exposes every teaching task and batch class workflows', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /activeTab === 'dashboard'/);
  assert.match(teacher, /activeTab === 'timetable'/);
  assert.match(teacher, /activeTab === 'students'/);
  assert.match(teacher, /activeTab === 'attendance'/);
  assert.match(teacher, /activeTab === 'grades'/);
  assert.match(teacher, /activeTab === 'exam_results'/);
  assert.match(teacher, /activeTab === 'assignments'/);
  assert.match(teacher, /activeTab === 'notices'/);
  assert.match(teacher, /setActiveTab\(initialTab\)/);
  assert.match(teacher, /Small Exam/);
  assert.match(teacher, /Big Exam/);
  assert.match(teacher, /EXAM RESULTS — READ ONLY/);
  assert.match(teacher, /attendanceCounts/);
  assert.match(teacher, /Teaching schedule/);
  assert.match(teacher, /assigned periods/);
  assert.match(teacher, /Student Submissions/);
  assert.match(teacher, /Faculty notices & announcements/);
  assert.match(teacher, /Submit marks/);
  assert.match(teacher, /Forward complete class to Admin/);
});

test('teacher appointment supports optional multiple profile tags and one-time school credentials', () => {
  const admin = read('../src/components/schooladmin/TeachersView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(admin, /selectedClassIds/);
  assert.match(admin, /selectedSubjectIds/);
  assert.match(admin, /Teacher ID:/);
  assert.match(admin, /Initial PIN:/);
  assert.match(admin, /Reset PIN/);
  assert.match(api, /Teacher ID and password or PIN are required/);
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
  assert.match(payroll, /ApiClient\.downloadPayslipPdf\(record\.id\)/);
  assert.match(payroll, /setError\(reason instanceof Error/);
});


test('teacher class switching clears stale student data and loads only the active workflow data', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(teacher, /setStudents\(\[\]\);[\s\S]*setIsLoadingClassData\(true\)/);
  assert.match(teacher, /const needsAttendance = activeTab === 'attendance'/);
  assert.match(teacher, /const needsGrades = activeTab === 'grades'/);
  assert.match(teacher, /needsAttendance\s*\? ApiClient\.getDailyAttendance/);
  assert.match(teacher, /needsGrades \|\| needsResults\s*\? ApiClient\.getMarks/);
  assert.match(teacher, /if \(!needsAttendance && !needsGrades\) return/);
  assert.match(teacher, /isLoadingClassData \|\| isReadOnly \|\| students\.length === 0/);
  assert.match(teacher, /Loading students and attendance/);
  assert.match(teacher, /isLoadingClassData \|\| !editableClassSubjects.length \|\| !students.length/);
  assert.match(teacher, /disabled=\{isReadOnly \|\| isSaving \|\| isLoadingClassData\}/);
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
  assert.match(mobileNav, /id: 't_students'/);
  assert.match(mobileNav, /id: 't_exam_results'/);
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

test('teacher dashboard shows Form Teacher class and assigned teaching subjects without duplicate task shortcuts', () => {
  const teacher = read('../src/components/teacher/TeacherPortalView.tsx');
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
