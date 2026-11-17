import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261117090000_document_layout_templates.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');

test('document_templates has RLS, a school policy, a school index and one layout per school and type', () => {
  assert.match(migration, /ALTER TABLE public\.document_templates ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /CREATE POLICY document_templates_school_admin_all/i);
  assert.match(migration, /school_id = private\.auth_school_id\(\)/);
  assert.match(migration, /private\.auth_user_role\(\) = 'school_admin'/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_document_templates_school /);
  assert.match(migration, /UNIQUE \(school_id, type\)/);
  assert.match(migration, /CHECK \(type IN \('result_list','attendance_sheet'\)\)/);
  assert.match(schema, /CREATE POLICY document_templates_school_admin_all/i);
});

test('layout template changes are audited with old and new values', () => {
  assert.match(migration, /'layout_updated'[\s\S]{0,200}'old', OLD\.config, 'new', NEW\.config/);
  assert.match(migration, /'layout_reset'/);
});

test('layout and attendance-sheet routes come before /documents/:id and are scoped to the school', () => {
  const dynamic = api.indexOf("apiRouter.get('/documents/:id'");
  for (const route of ["apiRouter.get('/documents/layout-templates'", "apiRouter.get('/documents/attendance-sheet'"]) {
    const at = api.indexOf(route);
    assert.ok(at > 0 && at < dynamic, route + ' must be registered before /documents/:id');
  }
  for (const route of ["apiRouter.get('/documents/layout-templates'", "apiRouter.put('/documents/layout-templates/:type'", "apiRouter.delete('/documents/layout-templates/:type'"]) {
    const line = api.slice(api.indexOf(route), api.indexOf(route) + 220);
    assert.match(line, /requireSchoolAdminOrSuperAdmin/);
  }
  assert.match(api, /from\('document_templates'\)[\s\S]{0,200}\.eq\('school_id', school\.id\)/);
  assert.match(api, /validateLayoutConfig\(req\.body\?\.config\)/);
});

test('attendance sheet is limited to admins and teachers with access to the class', () => {
  const start = api.indexOf("apiRouter.get('/documents/attendance-sheet'");
  const body = api.slice(start, start + 2200);
  assert.match(body, /\['school_admin', 'super_admin', 'teacher'\]\.includes\(user\.role\)/);
  assert.match(body, /canAccessTeachingClass\(req, res, classId\)/);
  assert.match(body, /school_id: school\.id, class_id: klass\.id/);
});
