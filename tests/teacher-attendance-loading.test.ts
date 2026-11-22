import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const portal = read('../src/components/teacher/TeacherPortalView.tsx');
const api = read('../src/server/api.ts');

test('attendance tab does not wait for subject assignments or exam configuration', () => {
  assert.match(portal, /needsTeachingAssignments = !\['attendance', 'notices', 'profile'\]\.includes\(activeTab\)/);
  assert.match(portal, /getTeacherSubjectAssignments\(\)[\s\S]*?needsTeachingAssignments/);
  assert.match(portal, /needsExamConfig = activeTab === 'grades' \|\| activeTab === 'exam_results'/);
  assert.match(portal, /getExamConfig\(\)[\s\S]*?needsExamConfig/);
  assert.match(portal, /teacherBootstrapLoading = formTeacherClassesState\.loading[\s\S]*?needsTeachingAssignments/);
});

test('attendance portal skips unrelated timetable, notices, exams and homework bootstrap requests', () => {
  assert.match(portal, /getTimetable\(\)[\s\S]*?\['dashboard', 'timetable'\]\.includes\(activeTab\)/);
  assert.match(portal, /getNotices\(\)[\s\S]*?activeTab === 'notices'/);
  assert.match(portal, /getPublishedExamSchedules\(\)[\s\S]*?activeTab === 'timetable'/);
  assert.match(portal, /getTeacherExamInvigilation\(\)[\s\S]*?activeTab === 'timetable'/);
  assert.match(portal, /getAssignments\(\)[\s\S]*?activeTab === 'assignments'/);
});

test('Form Teacher bootstrap queries only that teacher own non-archived classes', () => {
  const start = api.indexOf("apiRouter.get('/teacher/form-teacher-classes'");
  const end = api.indexOf("apiRouter.get('/teacher/exam-invigilation'", start);
  const route = api.slice(start, end);
  assert.match(route, /class_teacher_id: user\.id/);
  assert.match(route, /is_archived: 'false'/);
  assert.match(route, /'id,school_id,name,section,class_teacher_id,is_archived'/);
  assert.doesNotMatch(route, /db\.getClasses\(school\.id\)/);
});

test('attendance and its class roster are fetched concurrently, with exact Form Teacher class authorization', () => {
  assert.match(portal, /Promise\.all\(\[ApiClient\.getAllStudents\(selectedClassId\), attendanceRequest, marksRequest\]\)/);
  assert.match(api, /klass\.classTeacherId !== user\.id/);
});
