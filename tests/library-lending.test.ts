import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/044_library_lending_and_returns.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const apiClient = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');

test('library loans reference a book and student in the same school', () => {
  assert.match(migration, /FOREIGN KEY \(book_id, school_id\)[\s\S]*REFERENCES public\.library_books\(id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(student_id, school_id\)[\s\S]*REFERENCES public\.students\(id, school_id\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_id_school_unique/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS library_loans/);
});

test('lending table has tenant RLS and admin-only read/write policies', () => {
  assert.match(migration, /ALTER TABLE public\.library_loans ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /CREATE POLICY library_loans_tenant_scope ON public\.library_loans FOR ALL/);
  for (const action of ['select', 'insert', 'update']) {
    assert.match(migration, new RegExp('CREATE POLICY library_loans_admin_' + action + '[\\s\\S]*AS RESTRICTIVE'));
  }
  assert.match(migration, /issued_by = private\.auth_user_id\(\)/);
  assert.match(migration, /returned_by = private\.auth_user_id\(\)/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.library_loans TO authenticated, service_role/);
});

test('database trigger serializes issue requests and prevents over-lending', () => {
  assert.match(migration, /FROM public\.library_books[\s\S]*FOR UPDATE/);
  assert.match(migration, /active_count >= available_total/);
  assert.match(migration, /library_loans_integrity_trigger/);
  assert.match(migration, /prevent_library_quantity_below_loans/);
});

test('server API validates and records issue and return actions for school admins', () => {
  assert.match(api, /apiRouter\.get\('\/school\/library\/loans',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/school\/library\/loans',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.put\('\/school\/library\/loans\/:loanId\/return',[^\n]*requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /dueDate < today/);
  assert.match(storage, /public async issueLibraryLoan/);
  assert.match(storage, /public async returnLibraryLoan/);
});

test('storage startup checks and API client include the new lending table and actions', () => {
  assert.match(storage, /library_loans: 'libraryLoans'/);
  assert.match(storage, /\['libraryLoans', 'library_loans'\]/);
  assert.match(apiClient, /getLibraryLoans/);
  assert.match(apiClient, /issueLibraryLoan/);
  assert.match(apiClient, /returnLibraryLoan/);
});

test('library UI supports issue, return, availability and overdue tracking', () => {
  assert.match(ui, /ApiClient\.getLibraryLoans\(\)/);
  assert.match(ui, /ApiClient\.issueLibraryLoan\(/);
  assert.match(ui, /ApiClient\.returnLibraryLoan\(/);
  assert.match(ui, /available/);
  assert.match(ui, /Overdue/);
  assert.match(ui, /Mark returned/);
});
