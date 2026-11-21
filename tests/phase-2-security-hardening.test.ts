import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261121130000_phase2_security_hardening.sql', import.meta.url), 'utf8');

test('trigger-only SECURITY DEFINER functions are not directly callable through the Data API', () => {
  for (const name of [
    'schoolos_audit_component_mark',
    'schoolos_create_initial_student_enrollment',
    'schoolos_guard_component_mark'
  ]) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM anon, authenticated`));
  }
});

test('timetable overlap helper has a pinned search_path and remains usable by constraints', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.timetable_time_seconds\(value text\)/);
  assert.match(migration, /SET search_path = ''/);
  assert.doesNotMatch(migration, /REVOKE ALL ON FUNCTION public\.timetable_time_seconds/);
  assert.match(migration, /NOTIFY pgrst/);
});
