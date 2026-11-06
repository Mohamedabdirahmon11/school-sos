import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/054_school_health_visits.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');

test('clinic visits use a school-bound student foreign key and RLS', () => {
  assert.match(migration, /FOREIGN KEY \(student_id, school_id\)\s+REFERENCES public\.students\(id, school_id\)/);
  assert.match(migration, /ALTER TABLE public\.school_health_visits ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /private\.auth_school_id\(\)/);
  assert.match(migration, /private\.auth_user_role\(\) = 'school_admin'/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS school_health_visits/);
});

test('clinic visit API is school-admin-only and validates input', () => {
  assert.match(api, /apiRouter\.get\('\/school\/health-visits',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/school\/health-visits',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /db\.addHealthVisit\(/);
  assert.match(api, /Clinic visit details are invalid/);
  assert.match(apiClient, /getHealthVisits/);
  assert.match(apiClient, /addHealthVisit/);
});

test('clinic UI reads persisted visits and allows recording a visit', () => {
  assert.match(storage, /getHealthVisits\(schoolId: string\)/);
  assert.match(storage, /addHealthVisit\(input:/);
  assert.match(ui, /ApiClient\.getHealthVisits\(\)/);
  assert.match(ui, /ApiClient\.addHealthVisit\(/);
  assert.match(ui, /Record clinic visit/);
  assert.doesNotMatch(ui, /const \[healthLogs\] = useState<any\[]>\(\[\]\)/);
});
