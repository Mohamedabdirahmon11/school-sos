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


test('teacher creation persists account, profile, subjects and Form Teacher link atomically', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  const routeStart = api.indexOf("apiRouter.post('/teachers',");
  const routeEnd = api.indexOf("\\n\\nconst staffPermissions", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.match(route, /createTeacherAtomically/);
  assert.doesNotMatch(route, /db\\.createUser\\(|db\\.createTeacher\\(|db\\.saveTeacherSubjects\\(/);
  assert.match(storage, /rpc\\('schoolos_create_teacher'/);
  assert.match(schema, /CREATE OR REPLACE FUNCTION public\\.schoolos_create_teacher/);
  assert.match(schema, /INSERT INTO public\\.teacher_subjects/);
});

test('teacher creation avoids full-table scans for sequential IDs and duplicate phone checks', () => {
  const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const helperStart = api.indexOf('async function nextSchoolTeacherId');
  const helperEnd = api.indexOf('\\n}', helperStart);
  const helper = api.slice(helperStart, helperEnd);
  assert.match(helper, /randomUUID/);
  assert.doesNotMatch(helper, /queryAllRows/);
  const routeStart = api.indexOf("apiRouter.post('/teachers',");
  const routeEnd = api.indexOf("\\n\\nconst staffPermissions", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.doesNotMatch(route, /queryAllRows\\('teachers'/);
});
