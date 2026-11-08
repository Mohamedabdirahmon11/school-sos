import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const broadcasts = readFileSync(new URL('../src/components/superadmin/BroadcastsView.tsx', import.meta.url), 'utf8');

test('inventory routes remain school-scoped and stock movements use the atomic RPC', () => {
  assert.match(api, /apiRouter\.get\('\/inventory', requireAuth, requireSchoolContext/);
  assert.match(api, /apiRouter\.post\('\/inventory', requireAuth, requireSchoolContext/);
  assert.match(api, /apiRouter\.post\('\/inventory\/:id\/transactions', requireAuth, requireSchoolContext/);
  assert.match(api, /db\.adjustInventoryStock\(\{schoolId:school\.id,itemId:req\.params\.id/);
  assert.match(storage, /client\.rpc\('schoolos_adjust_inventory'/);
  assert.match(schema, /REVOKE ALL ON FUNCTION public\.schoolos_adjust_inventory[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(schema, /GRANT EXECUTE ON FUNCTION public\.schoolos_adjust_inventory[\s\S]*TO service_role/);
});

test('attendance writes validate class membership and preserve one row per student per day', () => {
  assert.match(api, /canAccessTeachingClass\(req, res, normalizedClassId\)/);
  assert.match(api, /queryAllRows\('students', \{ school_id: school\.id, class_id: normalizedClassId \}/);
  assert.match(api, /Attendance can only be recorded for students currently enrolled in the selected class/);
  assert.match(storage, /const attendanceKey = \[schoolId, classId, rec\.studentId, date\]\.join/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique_day ON attendance_records\(school_id, class_id, student_id, date\)/);
});

test('cash fee payment writes validate school membership and enforce DB idempotency', () => {
  assert.match(api, /apiRouter\.post\('\/fees\/pay-cash', requireAuth, requireAccountantOrSuperAdmin, requireSchoolContext/);
  assert.match(storage, /student\.schoolId !== paymentData\.schoolId/);
  assert.match(storage, /payment\.idempotencyKeys\?\.includes\(paymentData\.idempotencyKey/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payment_school_idempotency ON public\.fee_payments\(school_id, idempotency_key\)/);
});

test('platform broadcast create, send, and list remain Super Admin-only with loading retry UI', () => {
  assert.match(api, /apiRouter\.post\('\/superadmin\/broadcasts', requireAuth, requireSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/superadmin\/broadcasts\/:id\/send', requireAuth, requireSuperAdmin/);
  assert.match(api, /apiRouter\.get\('\/superadmin\/broadcasts', requireAuth, requireSuperAdmin/);
  assert.match(broadcasts, /Loading broadcasts/);
  assert.match(broadcasts, /Retry loading/);
  assert.match(broadcasts, /setLoadError\(err\.message/);
});
