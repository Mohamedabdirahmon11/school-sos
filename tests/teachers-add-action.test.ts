import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('school admin teacher directory exposes a prominent accessible Add Teacher action', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/TeachersView.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-testid="add-teacher-button"/);
  assert.match(source, /aria-label="Add Teacher"/);
  assert.match(source, /Add Teacher · Ku dar macallin/);
  assert.match(source, /setShowAddModal\(true\)/);
  assert.match(source, /APPOINT TEACHER MODAL/);
});

test('Add Teacher remains discoverable in read-only mode and explains why creation is blocked', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/TeachersView.tsx', import.meta.url), 'utf8');
  assert.match(source, /if \(isReadOnly\) \{/);
  assert.match(source, /Dugsigan hadda waa read-only/);
  assert.doesNotMatch(source, /data-testid="add-teacher-button"[\s\S]{0,500}?disabled=\{isReadOnly\}/);
});


test('teacher creation uses one transactional database operation', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  assert.ok(api.includes('await db.createTeacherAtomically({'));
  assert.ok(storage.includes("rpc('schoolos_create_teacher'"));
  assert.ok(schema.includes('CREATE OR REPLACE FUNCTION public.schoolos_create_teacher'));
  assert.ok(schema.includes('INSERT INTO public.teacher_subjects'));
});

test('teacher IDs retain the T001 format and are allocated by a database sequence', () => {
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20261122165821_atomic_teacher_creation.sql', import.meta.url), 'utf8');
  assert.ok(schema.includes('CREATE SEQUENCE IF NOT EXISTS public.teacher_staff_id_seq'));
  assert.ok(migration.includes("nextval('public.teacher_staff_id_seq'::regclass)"));
  assert.ok(schema.includes("WHEN v_staff_number < 1000 THEN lpad(v_staff_number::TEXT, 3, '0')"));
});
