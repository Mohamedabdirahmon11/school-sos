import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const schema = readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261116090000_school_documents_phase1.sql',import.meta.url),'utf8');
const api = readFileSync(new URL('../src/server/api.ts',import.meta.url),'utf8');

test('document tables enable RLS and restrict rows to the authenticated school', () => {
  for (const table of ['school_documents','school_document_templates']) {
    assert.match(migration,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY','i'));
    assert.match(migration,new RegExp('CREATE POLICY '+table+'_school_admin_all','i'));
    assert.match(schema,new RegExp('CREATE POLICY '+table+'_school_admin_all','i'));
  }
  assert.match(migration,/school_id = private\.auth_school_id\(\)/);
  assert.match(migration,/private\.auth_user_role\(\) = 'school_admin'/);
});

test('document API reads and writes always include the current school id', () => {
  assert.match(api,/from\('school_documents'\)[\s\S]{0,250}\.eq\('school_id',\s*school\.id\)/);
  assert.match(api,/from\('school_document_templates'\)[\s\S]{0,250}\.eq\('school_id',\s*school\.id\)/);
  assert.match(api,/requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
});
