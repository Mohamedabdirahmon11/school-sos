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

test('transport route fee input preserves a zero fee', () => {
  assert.ok(ui.includes("setRouteFee(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value) || 0))"));
  assert.match(api, /feeAmount < 0/);
});

test('transport routes capture and display ordered neighborhood pickup stops', () => {
  assert.ok(ui.includes("const [routeStops, setRouteStops] = useState('')"));
  assert.ok(ui.includes('stops: routeStops.split(/[\\r\\n,]+/)'));
  assert.ok(ui.includes('Stops / Neighborhoods (in pickup order)'));
  assert.ok(ui.includes("r.stops.join(' → ')"));
  assert.ok(api.includes('const stops = body.stops ?? []'));
  assert.ok(api.includes('stops.length > 100'));
});


test('inventory items can be edited without rewriting stock quantity history', () => {
  assert.match(ui, /const handleEditInventoryItem = \(item: any\)/);
  assert.match(ui, /ApiClient\.updateInventoryItem\(editingInventoryId/);
  assert.match(ui, /setInventory\(items => items\.map\(item => item\.id === updated\.id \? updated : item\)\)/);
  assert.match(ui, /Record stock movement/);
  assert.match(ui, /Record opening stock using a stock-in movement/);
});

test('extra-module write handlers enforce read-only mode and surface errors', () => {
  const addBook = ui.slice(ui.indexOf('const handleAddBook'), ui.indexOf('const handleAddRoute'));
  const addRoute = ui.slice(ui.indexOf('const handleAddRoute'), ui.indexOf('const handleAssignBus'));
  assert.match(addBook, /if \(isReadOnly \|\| !school/);
  assert.match(addBook, /setLibraryError\(err\.message/);
  assert.match(addRoute, /if \(isReadOnly \|\| !school/);
  assert.match(ui, /const handleAssignBus = async \(\) => \{\s*if \(isReadOnly \|\|/);
  assert.match(ui, /const handleAssignBus[\s\S]*?setModuleError\(err\.message/);
});


test('clinic records are limited to the current school and school administrators', () => {
  assert.match(api, /apiRouter\.get\('\/school\/health-visits', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/school\/health-visits', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(storage, /from\('school_health_visits'\)[\s\S]*?\.eq\('school_id', schoolId\)/);
  assert.match(storage, /student\.schoolId !== input\.schoolId/);
  assert.match(schema, /FOREIGN KEY \(student_id, school_id\) REFERENCES students\(id, school_id\)/);
  assert.match(schema, /school_health_visits_read ON school_health_visits FOR SELECT TO authenticated/);
});

test('discipline records are school-scoped and write access is admin-only', () => {
  assert.match(api, /apiRouter\.get\('\/school\/discipline', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(api, /apiRouter\.post\('\/school\/discipline', requireAuth, requireSchoolContext, requireSchoolAdminOrSuperAdmin/);
  assert.match(storage, /getDisciplineIncidents\(schoolId: string\)[\s\S]*?queryRows<any>\('discipline_incidents', \{ school_id: schoolId \}\)/);
  assert.match(storage, /getStudentById\(input\.studentId, input\.schoolId\)/);
  assert.match(schema, /discipline_incidents_read ON discipline_incidents FOR SELECT TO authenticated/);
});

test('school settings and sidebar expose the agreed school administration modules', () => {
  const settings = readFileSync(new URL('../src/components/schooladmin/SchoolSettingsView.tsx', import.meta.url), 'utf8');
  const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  for (const tab of ["setActiveTab('identity')", "setActiveTab('academics')", "setActiveTab('documents')", "setActiveTab('branches')", "setActiveTab('designer')", "setActiveTab('backup')"]) {
    assert.ok(settings.includes(tab), `School Settings tab is present: ${tab}`);
  }
  for (const view of ['sch_library', 'sch_transport', 'sch_inventory', 'sch_discipline', 'sch_health', 'sch_settings']) {
    assert.ok(sidebar.includes(view), `Sidebar includes ${view}`);
  }
  for (const view of ['sch_library', 'sch_transport', 'sch_inventory', 'sch_discipline', 'sch_health']) {
    assert.ok(app.includes(`activeView === '${view}'`), `App routes ${view}`);
  }
});


test('resource module tables support search, bounded pagination, and filtered empty states', () => {
  assert.match(ui, /type="search" value=\{moduleSearch\}/);
  assert.match(ui, /const modulePageSize = 10/);
  assert.match(ui, /rows: filtered\.slice\(\(page - 1\) \* modulePageSize, page \* modulePageSize\)/);
  assert.match(ui, /renderModulePagination\(inventoryPage, 'inventory items'\)/);
  assert.match(ui, /renderModulePagination\(healthPage, 'health visits'\)/);
  assert.match(ui, /renderModulePagination\(disciplinePage, 'discipline records'\)/);
  assert.match(ui, /No inventory items match your search/);
  assert.match(ui, /No health visits match your search/);
});


test('resource tables provide field-based ascending and descending sorting', () => {
  assert.match(ui, /const \[moduleSortField, setModuleSortField\] = useState\('default'\)/);
  assert.match(ui, /const \[moduleSortDirection, setModuleSortDirection\] = useState<'asc' \| 'desc'>\('asc'\)/);
  assert.match(ui, /moduleSortDirection === 'asc' \? comparison : -comparison/);
  assert.match(ui, /setModuleSortDirection\(current => current === 'asc' \? 'desc' : 'asc'\)/);
});

test('library overview shows catalogue, copies, issued and overdue totals', () => {
  assert.match(ui, /Catalogue titles/);
  assert.match(ui, /Total copies/);
  assert.match(ui, /Books issued/);
  assert.match(ui, /Overdue loans/);
});
