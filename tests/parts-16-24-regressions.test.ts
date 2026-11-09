import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { staffHasPermission } from '../src/lib/staff-permissions.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('staff permissions require an active linked staff record and an explicit permission', () => {
  assert.equal(staffHasPermission({ status: 'active', permissions: ['fees_manage'] }, 'fees_manage'), true);
  assert.equal(staffHasPermission({ status: 'inactive', permissions: ['fees_manage'] }, 'fees_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: ['reports_export'] }, 'fees_manage'), false);
  assert.equal(staffHasPermission({ status: 'active', permissions: [] }, 'payroll_manage'), false);
});

test('finance, payroll, admissions, inventory, grades and reports enforce staff permissions', () => {
  const api = read('../src/server/api.ts');
  const staffUi = read('../src/components/schooladmin/StaffAccessView.tsx');
  for (const permission of ['fees_manage', 'payroll_manage', 'admissions_manage', 'inventory_manage', 'grades_manage', 'reports_export']) {
    assert.ok(api.includes(`requireSchoolAdminOrStaffPermission('${permission}')`) || api.includes(`requireAccountantOrSuperAdmin('${permission}')`) || api.includes(`'${permission}'`), `API enforces ${permission}`);
    assert.ok(staffUi.includes(`id: '${permission}'`), `staff UI exposes ${permission}`);
  }
  assert.match(api, /getStaffForRequest\(req, user\.id, school\.id\), 'fees_manage'/);
  assert.match(api, /requireAccountantOrSuperAdmin\('payroll_manage'\)/);
});

test('year-end promotion uses one database transaction and maps the history schema correctly', () => {
  const storage = read('../src/server/storage.ts');
  const migration = read('../supabase/migrations/20261109112121_atomic_year_end_promotions_and_history.sql');
  assert.match(storage, /rpc\('schoolos_confirm_year_end_promotions'/);
  assert.match(storage, /promotion_history.*classFromId|classFromId.*promotion_history/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /already been processed/);
  assert.match(migration, /INSERT INTO public\.promotions/);
  assert.match(migration, /INSERT INTO public\.promotion_history/);
  assert.match(migration, /UPDATE public\.students/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
});

test('parent portal resolves linked children using either saved guardian phone field', () => {
  const portal = read('../src/components/parent/ParentPortalView.tsx');
  const api = read('../src/server/api.ts');
  assert.match(portal, /user\?\.parentPhone/);
  assert.match(portal, /pageSize: 100/);
  assert.match(api, /user\.phone, user\.parentPhone/);
});

test('scheduled notices are editable and hidden from recipients until their publish date', () => {
  const ui = read('../src/components/schooladmin/NoticesEventsView.tsx');
  const api = read('../src/server/api.ts');
  const storage = read('../src/server/storage.ts');
  const migration = read('../supabase/migrations/20261109112514_exclude_future_scheduled_notices.sql');
  assert.match(ui, /noticePublishDate/);
  assert.match(ui, /type="date"/);
  assert.match(api, /publish_date\.lte/);
  assert.match(api, /\.\.\.\(publishDate \? \{ publishDate \} : \{\}\)/);
  assert.match(storage, /const published = String\(notice\.publishDate/);
  assert.match(migration, /n\.publish_date <=/);
});

test('timetable loading failures are visible and can be retried', () => {
  const source = read('../src/components/schooladmin/TimetableView.tsx');
  assert.match(source, /setLoadError\(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Retry loading timetable/);
});
