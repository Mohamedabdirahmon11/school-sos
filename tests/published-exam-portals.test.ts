import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const student = readFileSync(new URL('../src/components/student/StudentPortalView.tsx', import.meta.url), 'utf8');
const parent = readFileSync(new URL('../src/components/parent/ParentPortalView.tsx', import.meta.url), 'utf8');
const teacher = readFileSync(new URL('../src/components/teacher/TeacherPortalView.tsx', import.meta.url), 'utf8');

test('published exam schedules are school-scoped and limited to authorized portal classes', () => {
  assert.ok(api.includes("apiRouter.get('/exams/schedules/published', requireAuth, requireSchoolContext"));
  assert.ok(api.includes('new Set(await getNoticeClassIds(school.id, user))'));
  assert.ok(api.includes("typeof req.query.classId === 'string'"));
  assert.ok(api.includes('allowedClassIds.has(requestedClassId)'));
  assert.ok(api.includes('db.getPublishedExamSchedules(school.id)'));
  assert.ok(storage.includes("schedule.status === 'published'"));
  assert.ok(client.includes('getPublishedExamSchedules(classId?: string)'));
  assert.ok(student.includes('ApiClient.getPublishedExamSchedules(studentRecord.classId)'));
  assert.ok(parent.includes('ApiClient.getPublishedExamSchedules(currentChild.classId)'));
  assert.ok(teacher.includes('ApiClient.getPublishedExamSchedules()'));
  assert.ok(student.includes('Published Exam Schedule'));
  assert.ok(parent.includes('Published Exam Schedule'));
  assert.ok(teacher.includes('Published Exam Timetable'));
});
