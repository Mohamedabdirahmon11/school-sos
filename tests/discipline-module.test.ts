import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/041_discipline_incidents.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');

test('discipline records are tied to a student and school by a composite foreign key', () => {
  assert.match(migration, /FOREIGN KEY \(student_id, school_id\)\s+REFERENCES public\.students\(id, school_id\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_school_unique/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_discipline_school_date/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS discipline_incidents/);
});

test('discipline incidents are protected by school-admin RLS and explicit Data API grants', () => {
  assert.ok(migration.includes('ALTER TABLE public.discipline_incidents ENABLE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('CREATE POLICY discipline_incidents_read ON public.discipline_incidents FOR SELECT TO authenticated'));
  assert.ok(migration.includes('CREATE POLICY discipline_incidents_insert ON public.discipline_incidents FOR INSERT TO authenticated'));
  assert.ok(migration.includes('CREATE POLICY discipline_incidents_update ON public.discipline_incidents FOR UPDATE TO authenticated'));
  assert.ok(migration.includes('CREATE POLICY discipline_incidents_delete ON public.discipline_incidents FOR DELETE TO authenticated'));
  assert.match(migration, /private\.auth_school_id\(\)/);
  assert.match(migration, /private\.auth_user_role\(\) = 'school_admin'/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.discipline_incidents TO authenticated, service_role/);
});

test('discipline API validates incident input and restricts routes to school admins', () => {
  assert.match(api, /apiRouter\.get\('\/school\/discipline',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/school\/discipline',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /db\.addDisciplineIncident\(/);
  assert.match(api, /Discipline incident details are invalid/);
  assert.match(apiClient, /getDisciplineIncidents/);
  assert.match(apiClient, /addDisciplineIncident/);
});

test('discipline UI loads and saves real API records without claiming SMS delivery', () => {
  assert.match(storage, /discipline_incidents: 'disciplineIncidents'/);
  assert.match(storage, /\['discipline_incidents', snapshot\.disciplineIncidents\]/);
  assert.match(storage, /\['disciplineIncidents', 'discipline_incidents'\]/);
  assert.match(ui, /ApiClient\.getDisciplineIncidents\(\)/);
  assert.match(ui, /ApiClient\.addDisciplineIncident\(/);
  assert.match(ui, /Parent contacted manually/);
  assert.doesNotMatch(ui, /Yes \(SMS\)/);
});

test('discipline incident creation attributes the record to the authenticated administrator', () => {
  assert.match(api, /recordedBy: user\.id/);
  assert.match(api, /res\.status\(201\)\.json\(incident\)/);
  assert.match(storage, /Choose a student from this school/);
});
