import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('teacher dashboard aggregation is school-scoped and uses only the authenticated teacher profile', () => {
  const migration = read('../supabase/migrations/20261121114732_phase3_teacher_dashboard_aggregate.sql');
  const storage = read('../src/server/storage.ts');
  const api = read('../src/server/api.ts');
  assert.match(migration, /p_school_id character varying/);
  assert.match(migration, /p_teacher_id character varying/);
  assert.match(migration, /school_id = p_school_id/);
  assert.match(migration, /teacher_id = p_teacher_id/);
  assert.match(migration, /student\.status = 'active'/);
  assert.match(migration, /attendance\.date =/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.teacher_dashboard_summary/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.teacher_dashboard_summary[\s\S]*TO service_role/);
  assert.match(storage, /rpc\('teacher_dashboard_summary', \{[\s\S]*p_school_id: schoolId,[\s\S]*p_teacher_id: teacherId/);
  const start = api.indexOf("if (role === 'teacher') {", api.indexOf("apiRouter.get('/school/dashboard'"));
  const end = api.indexOf("const summary = await getCachedSchoolDashboardSummary", start);
  assert.ok(start >= 0 && end > start);
  const teacherRoute = api.slice(start, end);
  assert.match(teacherRoute, /school_id: school\.id, user_id: user\.id/);
  assert.match(teacherRoute, /getCachedTeacherDashboardSummary\(school\.id, String\(teacher\.items\[0\]\.id\)\)/);
  assert.doesNotMatch(teacherRoute, /db\.getStudents\(school\.id\)|db\.getSchoolAttendance\(school\.id\)/);
});

test('teacher dashboard aggregates both subject-assigned and Form Teacher classes without browser-wide student fetches', () => {
  const migration = read('../supabase/migrations/20261122110000_teacher_dashboard_form_teacher_aggregate.sql');
  const portal = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.match(migration, /UNION[\s\S]*FROM public\.classes[\s\S]*school_id = p_school_id/);
  assert.ok(migration.includes('class_teacher_id = (SELECT user_id FROM public.teachers WHERE id = p_teacher_id AND school_id = p_school_id)'));
  assert.ok(migration.includes("'totalPeriodsPerWeek'"));
  assert.ok(migration.includes("FROM public.timetable_slots"));
  assert.ok(migration.includes("teacher_id = p_teacher_id"));
  assert.ok(migration.includes("'openHomeworkCount'"));
  assert.ok(migration.includes("FROM public.assignments"));
  assert.ok(migration.includes("teacher_id = (SELECT user_id FROM public.teachers"));

  const dashboardCountEffect = portal.slice(portal.indexOf('const [assignedClassStudentTotal'), portal.indexOf('const notices:'));
  assert.match(dashboardCountEffect, /ApiClient\.getSchoolDashboard\(\)/);
  assert.doesNotMatch(dashboardCountEffect, /getAllStudents/);
});
