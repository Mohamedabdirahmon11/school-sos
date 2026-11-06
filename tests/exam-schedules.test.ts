import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/058_exam_schedules_and_seating.sql', import.meta.url), 'utf8');
const rlsMigration = readFileSync(new URL('../supabase/migrations/059_exam_schedule_service_role_policies.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExamsResultsView.tsx', import.meta.url), 'utf8');

test('exam schedule schema is tenant-scoped and protects room and seat allocations', () => {
  assert.match(migration, /ALTER TABLE public\.exam_schedules ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.exam_seat_assignments ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FOREIGN KEY \(class_id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(subject_id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(student_id, school_id\)/);
  assert.match(migration, /seat_capacity BETWEEN 1 AND 500/);
  assert.match(migration, /lower\(btrim\(other\.room_name\)\)/);
  assert.match(migration, /other\.class_id = v_schedule\.class_id/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.ok(migration.includes('pg_advisory_xact_lock'));
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schoolos_publish_exam_schedule/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.schoolos_publish_exam_schedule/);
});

test('exam schedule API is school-admin scoped and validates schedule inputs', () => {
  assert.match(api, /apiRouter\.get\('\/exams\/schedules', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext/);
  assert.match(api, /apiRouter\.post\('\/exams\/schedules', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext/);
  assert.match(api, /apiRouter\.post\('\/exams\/schedules\/:id\/publish', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext/);
  assert.match(api, /apiRouter\.get\('\/exams\/schedules\/:id\/seats', requireAuth, requireSchoolAdminOrSuperAdmin, requireSchoolContext/);
  assert.ok(api.includes("apiRouter.post('/exams/schedules/:id/cancel'"));
  assert.ok(api.includes('This room or class already has an overlapping exam schedule'));
  assert.ok(api.includes('validTime(startTime)'));
  assert.ok(api.includes('seatCapacity > 500'));
});

test('exam schedule storage, client, and UI expose draft, publish, and print seating workflow', () => {
  assert.ok(storage.includes('schoolos_publish_exam_schedule'));
  assert.ok(storage.includes('getExamScheduleSeats'));
  assert.ok(client.includes('/exams/schedules'));
  assert.ok(ui.includes("setActiveTab('schedule')"));
  assert.ok(ui.includes('Save schedule draft'));
  assert.ok(ui.includes('Publish & assign seats'));
  assert.ok(ui.includes('Cancel draft'));
  assert.ok(ui.includes('Print seating'));
  assert.ok(ui.includes('exam-seat-print'));
});
