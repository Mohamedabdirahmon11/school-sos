import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261126140000_restore_atomic_student_registration_guards.sql', import.meta.url),
  'utf8'
);
const functionBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.schoolos_create_student'),
  migration.indexOf('REVOKE ALL ON FUNCTION public.schoolos_create_student')
);

test('student ID sequence is reconciled monotonically before the atomic RPC uses it', () => {
  assert.match(migration, /INSERT INTO public\.school_student_id_sequences/);
  assert.match(migration, /GREATEST\s*\(\s*public\.school_student_id_sequences\.last_number\s*,\s*EXCLUDED\.last_number/s);
  assert.match(functionBody, /public\.schoolos_reserve_student_ids\(v_school_id, 1\)/);
});

test('student registration locks and validates the selected school class before inserting', () => {
  assert.match(functionBody, /FROM public\.classes[\s\S]*?school_id = v_school_id[\s\S]*?FOR UPDATE/);
  assert.match(functionBody, /v_enrolled >= v_class\.capacity/);
  assert.match(functionBody, /The selected class has reached capacity/);
});

test('student registration keeps both guardian contacts and the existing parent-link behavior', () => {
  assert.match(functionBody, /father_phone, father_name, mother_phone/);
  assert.match(functionBody, /NULLIF\(btrim\(p_payload->>'mother_phone'\), ''\)/);
  assert.match(functionBody, /linked_student_ids/);
  assert.match(functionBody, /STUDENT_REGISTERED/);
});

test('student registration never writes the generated student_code column or deletes existing records', () => {
  assert.doesNotMatch(functionBody, /student_code/);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  assert.match(functionBody, /SET search_path = ''/);
  assert.match(functionBody, /REVOKE ALL ON FUNCTION public\.schoolos_create_student/);
  assert.match(functionBody, /GRANT EXECUTE ON FUNCTION public\.schoolos_create_student\(JSONB\) TO service_role/);
});
