import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/045_transport_assignment_integrity.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
const access = readFileSync(new URL('../supabase/migrations/042_restrict_library_transport_writes.sql', import.meta.url), 'utf8');

test('bus assignments are constrained to the same school as both student and route', () => {
  assert.match(migration, /FOREIGN KEY \(student_id, school_id\)[\s\S]*REFERENCES public\.students\(id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(route_id, school_id\)[\s\S]*REFERENCES public\.transport_routes\(id, school_id\)/);
  assert.match(schema, /bus_assignments_student_school_fkey/);
  assert.match(schema, /bus_assignments_route_school_fkey/);
  assert.match(schema, /bus_assignments_admin_insert[\s\S]*AS RESTRICTIVE/);
  assert.match(schema, /bus_assignments_admin_update[\s\S]*AS RESTRICTIVE/);
  assert.match(schema, /bus_assignments_admin_delete[\s\S]*AS RESTRICTIVE/);
  assert.match(schema, /AS \$function\$[\s\S]*enforce_bus_assignment_capacity/);
  assert.match(schema, /AS \$function\$[\s\S]*prevent_bus_capacity_below_assignments/);
});

test('route capacity is validated and concurrent assignments serialize on the route row', () => {
  assert.match(migration, /capacity INTEGER NOT NULL DEFAULT 40/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /active_assignments >= route_capacity/);
  assert.match(migration, /prevent_bus_capacity_below_assignments/);
  assert.match(api, /Number\.isInteger\(capacity\).*capacity < 1/s);
  assert.match(storage, /activeOnRoute >= routeCapacity/);
});

test('only active same-school students and active routes can receive assignments', () => {
  assert.match(migration, /school_id = NEW\.school_id AND status = 'active'/);
  assert.match(storage, /student\.status !== 'active'/);
  assert.match(storage, /item\.active !== false/);
  assert.match(api, /apiRouter\.put\('\/bus\/assignments\/:studentId',[^\n]*requireSchoolAdminOrStaffPermission\('transport_manage'\)/);
});

test('transport UI exposes capacity and live seat occupancy', () => {
  assert.match(ui, /routeCapacity/);
  assert.match(ui, /capacity: routeCapacity/);
  assert.match(ui, /Bus Capacity \(students\)/);
  assert.match(ui, /item\.routeId === r\.id/);
});

test('bus assignment writes remain restricted to school administrators', () => {
  assert.match(access, /bus_assignments_admin_insert[\s\S]*AS RESTRICTIVE/);
  assert.match(access, /bus_assignments_admin_update[\s\S]*AS RESTRICTIVE/);
  assert.match(access, /bus_assignments_admin_delete[\s\S]*AS RESTRICTIVE/);
});
