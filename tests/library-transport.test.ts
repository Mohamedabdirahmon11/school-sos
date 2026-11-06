import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const apiClient = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/042_restrict_library_transport_writes.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const isbnMigration = readFileSync(new URL('../supabase/migrations/043_library_isbn_constraints.sql', import.meta.url), 'utf8');

test('library API errors are not converted into empty or fake successful catalogue data', () => {
  const getBooks = apiClient.slice(apiClient.indexOf('public static async getLibraryBooks'), apiClient.indexOf('public static async getTransportRoutes'));
  assert.doesNotMatch(getBooks, /\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(getBooks, /\.catch\(\(\) => data\)/);
});

test('library catalogue sends and displays the database quantity field', () => {
  assert.match(ui, /quantity: bookCopies/);
  assert.match(ui, /\{b\.quantity\}/);
  assert.doesNotMatch(ui, /b\.availableCopies|b\.totalCopies/);
  assert.match(api, /const quantity = Number\(body\.quantity \?\? 1\)/);
  assert.match(storage, /quantity: number/);
});

test('transport route form captures fields supported by the API', () => {
  assert.match(ui, /value=\{vehicleNumber\}/);
  assert.match(ui, /value=\{driverPhone\}/);
  assert.match(ui, /vehicleNumber,/);
  assert.match(ui, /driverPhone,/);
  assert.match(api, /const vehicleNumber = typeof body\.vehicleNumber/);
  assert.match(api, /const driverPhone = typeof body\.driverPhone/);
});

test('library and transport load errors are visible to the administrator', () => {
  assert.match(ui, /setLibraryError\(err\.message \|\| 'Unable to load library catalogue and lending records\.'/);
  assert.match(ui, /setModuleError\(err\.message \|\| 'Unable to load transport routes\.'/);
  assert.match(ui, /role="alert"/);
});

test('library, transport, and bus assignment writes are restricted to administrators', () => {
  for (const table of ['library_books', 'transport_routes', 'bus_assignments']) {
    assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
    for (const action of ['insert', 'update', 'delete']) {
      const policy = `${table}_admin_${action}`;
      assert.ok(migration.includes(`DROP POLICY IF EXISTS ${policy}`), `migration drops old ${policy}`);
      assert.ok(migration.includes(`CREATE POLICY ${policy}`), `migration creates ${policy}`);
    }
  }
  assert.ok(migration.includes('AS RESTRICTIVE'));
  assert.ok(migration.includes("private.auth_user_role() IN ('school_admin', 'super_admin')"));
  assert.match(schema, /CREATE POLICY library_books_admin_insert ON library_books AS RESTRICTIVE/);
  assert.match(schema, /CREATE POLICY transport_routes_admin_insert ON transport_routes AS RESTRICTIVE/);
});

test('library catalogue enforces non-negative quantity and school-local unique ISBNs', () => {
  assert.match(isbnMigration, /CHECK \(quantity >= 0\)/);
  assert.match(isbnMigration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_school_isbn_unique/);
  assert.match(isbnMigration, /lower\(btrim\(isbn\)\)/);
  assert.match(api, /error\?\.code === '23505'/);
  assert.match(schema, /quantity INTEGER NOT NULL DEFAULT 1 CONSTRAINT library_books_quantity_nonnegative CHECK \(quantity >= 0\)/);
});

test('transport routes capture and display ordered neighborhood pickup stops', () => {
  assert.ok(ui.includes("const [routeStops, setRouteStops] = useState('')"));
  assert.ok(ui.includes('stops: routeStops.split(/[\\r\\n,]+/)'));
  assert.ok(ui.includes('Stops / Neighborhoods (in pickup order)'));
  assert.ok(ui.includes("r.stops.join(' → ')"));
  assert.ok(api.includes('const stops = body.stops ?? []'));
  assert.ok(api.includes('stops.length > 100'));
});
