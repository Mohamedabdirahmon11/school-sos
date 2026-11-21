import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('teacher dashboard delegates assigned-class totals and lists to one school-scoped aggregate', () => {
  const api = read('../src/server/api.ts');
  const storage = read('../src/server/storage.ts');
  const migration = read('../supabase/migrations/20261121121000_phase3_teacher_dashboard_aggregate.sql');
  const routeStart = api.indexOf("apiRouter.get('/school/dashboard'");
  const routeEnd = api.indexOf("apiRouter.get('/school/reports/summary'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.match(route, /db\.getTeacherDashboardSummary\(school\.id, teacher\.items\[0\]\.id\)/);
  assert.doesNotMatch(route, /db\.getStudents\(school\.id\)|db\.getSchoolAttendance\(school\.id\)|db\.queryPage\('class_subjects'/);
  assert.match(storage, /rpc\('teacher_dashboard_summary'/);
  assert.match(migration, /WHERE school_id = p_school_id/);
  assert.match(migration, /teacher_id = p_teacher_id/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.teacher_dashboard_summary/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.teacher_dashboard_summary/);
});
