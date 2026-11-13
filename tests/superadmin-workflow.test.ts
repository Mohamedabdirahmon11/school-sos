import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const client = read('../src/services/api.ts');
const schools = read('../src/components/superadmin/SchoolsView.tsx');
const users = read('../src/components/superadmin/GlobalUsersView.tsx');
const sessions = read('../src/components/superadmin/SessionsModal.tsx');
const billing = read('../src/components/superadmin/PlansBillingView.tsx');
const settings = read('../src/components/superadmin/PlatformSettingsView.tsx');
const storage = read('../src/server/storage.ts');

test('school onboarding validates country, region, type and required contacts while keeping WhatsApp/admin email optional', () => {
  for (const field of ['schoolId', 'name', 'code', 'country', 'region', 'schoolType', 'address', 'city', 'phone', 'email', 'adminName', 'adminUsername', 'adminPin', 'adminPhone']) {
    assert.match(api, new RegExp(`'${field}'`), `missing onboarding validation for ${field}`);
  }
  assert.match(api, /schoolType.*primary.*secondary.*combined/);
  assert.ok(api.includes("'adminEmail'") && api.includes("invalid email"));
  assert.match(schools, /country: addCountry/);
  assert.match(schools, /region: addRegion/);
  assert.match(schools, /schoolType: addSchoolType/);
  assert.match(schools, /logoDataUrl: addLogoDataUrl/);
  assert.match(schools, /School ID \*/);
  assert.match(schools, /Admin Login ID \*/);
  assert.match(schools, /School Admin PIN \*/);
  assert.match(schools, /Enter the School ID, Admin Login ID, and a 4–6 digit PIN yourself/);
  assert.match(schools, /Email Address \(Optional\)/);
  assert.match(api, /staffId: requestedAdminUsername,/);
  assert.match(api, /const temporaryPin = String\(adminPin\)/);
  assert.match(api, /id: cleanSchoolId/);
  assert.match(api, /mustChangePassword: true/);
  assert.match(api, /school-logos/);
  assert.match(api, /School logo must be smaller than 2 MB/);
});

test('school onboarding accepts a Super Admin-assigned unique school ID and compensates failed persistence with full tenant cleanup', () => {
  assert.match(storage, /const id = String\(schoolData\.id \|\| `sch-\$\{randomUUID\(\)\}`\)\.trim\(\)/);
  assert.match(storage, /this\.data\.examConfigs = this\.data\.examConfigs\.filter\(row => row\.schoolId !== id\)/);
  assert.match(storage, /this\.data\.reportCardDesigns = this\.data\.reportCardDesigns\.filter\(row => row\.schoolId !== id\)/);
  assert.match(api, /School onboarding persistence failed; attempting rollback/);
});

test('new school profile migration adds compatible metadata and a dedicated logo bucket', () => {
  const migration = read('../supabase/migrations/20261112120000_school_registration_profile.sql');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS country/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS region/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS school_type/);
  assert.match(migration, /school-logos/);
  assert.match(migration, /2097152/);
  assert.ok(migration.includes('image/png') && migration.includes('image/jpeg') && migration.includes('image/webp'));
});

test('school onboarding remains Super Admin-only and tenant rows are scoped by school id', () => {
  const routeStart = api.indexOf("apiRouter.post('/superadmin/schools'");
  const routeEnd = api.indexOf("const updateSchoolDetailsSchema", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.match(route, /requireAuth, requireSuperAdmin/);
  assert.match(route, /schoolId: school.id/);
  const tenantPolicies = read('../supabase/migrations/022_consolidate_tenant_rls_policies.sql');
  assert.ok(tenantPolicies.includes('school_id::text = public.auth_school_id()::text'));
  assert.ok(tenantPolicies.includes('CREATE POLICY tenant_scope_v2 ON public.classes'));
});

test('school admin ID can be used in the shared staff login form', () => {
  const login = read('../src/components/auth/LoginView.tsx');
  assert.match(login, /School Admin ID/);
  assert.ok(login.includes('type="text"') && login.includes('Super Admin email, School / Admin / Teacher ID, or Accountant email / phone'));
});

test('school details use a dedicated school-scoped admin query and a consistent admins array', () => {
  assert.match(api, /apiRouter\.get\('\/superadmin\/schools\/:id'/);
  assert.match(api, /role: 'school_admin'/);
  assert.match(api, /admins: sanitizeUsers\(admins\.items\)/);
  assert.match(client, /\/superadmin\/schools\/\$\{encodeURIComponent\(id\)\}/);
  assert.match(schools, /Array\.isArray\(selectedSchool\.admins\)/);
});

test('school onboarding waits for Supabase persistence before returning success', () => {
  const routeStart = api.indexOf("apiRouter.post('/superadmin/schools'");
  const routeEnd = api.indexOf("apiRouter.patch('/superadmin/schools/:id/subscription'", routeStart);
  const route = api.slice(routeStart, routeEnd);
  assert.ok(route.indexOf('await db.flush()') > route.indexOf('db.createUser('));
  assert.ok(route.indexOf('await db.flush()') < route.indexOf('res.status(201)'));
});

test('global user management is server-paginated and includes accountant role filtering', () => {
  assert.match(api, /supportedRoles = \['super_admin', 'school_admin', 'accountant', 'teacher', 'parent'\]/);
  assert.match(api, /sendDatabasePage\(req, res, 'users', filters, orFilter, sanitizeUsers\)/);
  assert.match(client, /getGlobalUsers\(params\?: \{ page\?: number; pageSize\?: number; search\?: string; role\?: string \}\)/);
  assert.match(users, /pageSize: 50/);
  assert.match(users, /id: 'accountant', label: 'Accountant'/);
  assert.match(users, /totalPages/);
});

test('user block, password reset and session revocation persist before success responses', () => {
  assert.match(api, /await db\.flush\(\);\s*res\.json\(targetUser\.role === 'school_admin'[\s\S]*temporaryPassword/);
  assert.match(api, /await db\.flush\(\);\s*res\.json\(\{ success: true, isBlocked: newStatus \}/);
  assert.match(api, /await db\.flush\(\);\s*res\.json\(\{ success: true \}\)/);
  assert.doesNotMatch(client, /toggleUserBlock[\s\S]{0,400}\.catch\(\(\) => \(\{ success: true \}\)\)/);
  assert.match(sessions, /setLoadError/);
  assert.match(sessions, /setActionError/);
});

test('billing actions guard duplicate plan saves and confirm manual payment reconciliation', () => {
  assert.match(billing, /if \(!editingPlan \|\| isSavingPlan\) return/);
  assert.match(billing, /disabled=\{isSavingPlan\}/);
  assert.match(billing, /Confirm that the school has already paid this invoice outside SchoolOS/);
  assert.match(storage, /schoolos_mark_subscription_invoice_paid/);
});

test('platform backup is checksum-verified in the browser before download', () => {
  assert.match(settings, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(settings, /actualChecksum !== res\.checksum\.value\.toLowerCase\(\)/);
  assert.match(settings, /Backup checksum verified/);
});


test('Super Admin can edit school contact and display details with validation and audit persistence', () => {
  const apiSource = read('../src/server/api.ts');
  const clientSource = read('../src/services/api.ts');
  const schoolsSource = read('../src/components/superadmin/SchoolsView.tsx');
  const routeStart = apiSource.indexOf("apiRouter.patch('/superadmin/schools/:id'");
  const routeEnd = apiSource.indexOf("apiRouter.patch('/superadmin/schools/:id/subscription'", routeStart);
  const route = apiSource.slice(routeStart, routeEnd);
  assert.match(route, /requireAuth, requireSuperAdmin/);
  assert.match(route, /updateSchoolDetailsSchema\.safeParse/);
  assert.match(route, /duplicateEmail/);
  assert.match(route, /db\.updateSchool\(school\.id, updates\)/);
  assert.match(route, /action: 'SCHOOL_DETAILS_UPDATED'/);
  assert.match(route, /await db\.flush\(\)/);
  assert.match(clientSource, /updateSchoolDetails\(id: string/);
  assert.match(schoolsSource, /Edit School Details/);
  assert.match(schoolsSource, /Save School Details/);
  assert.match(schoolsSource, /School code cannot be changed/);
});


test('platform backup UI clearly distinguishes a preference from unconfigured automation', () => {
  const settingsSource = read('../src/components/superadmin/PlatformSettingsView.tsx');
  const storageSource = read('../src/server/storage.ts');
  assert.match(settingsSource, /Backup Frequency Preference/);
  assert.match(settingsSource, /scheduled workflow is currently blocked/);
  assert.match(settingsSource, /manual JSON export is not a full-platform restore image/);
  assert.match(storageSource, /full-platform restore is not supported/);
});


test('subscription updates cannot be double-submitted and form limits match server validation', () => {
  const schoolsSource = read('../src/components/superadmin/SchoolsView.tsx');
  const apiSource = read('../src/server/api.ts');
  assert.match(schoolsSource, /if \(!selectedSchool \|\| isUpdatingSubscription\) return/);
  assert.match(schoolsSource, /disabled=\{isUpdatingSubscription\}/);
  assert.match(schoolsSource, /min="1"\s+max="120"/);
  assert.match(schoolsSource, /min="0"\s+max="60"/);
  assert.match(apiSource, /monthsToAdd must be a whole number from 1 to 120/);
  assert.match(apiSource, /graceDays must be a whole number from 0 to 60/);
});


test('platform backup settings accurately disclose missing GitHub Actions and S3 backup configuration', () => {
  const settingsSource = read('../src/components/superadmin/PlatformSettingsView.tsx');
  const workflowSource = read('../.github/workflows/supabase-backup.yml');
  assert.match(settingsSource, /scheduled workflow is currently blocked/);
  assert.match(settingsSource, /SUPABASE_DB_URL/);
  assert.match(settingsSource, /BACKUP_S3_ACCESS_KEY_ID/);
  assert.match(settingsSource, /BACKUP_S3_SECRET_ACCESS_KEY/);
  assert.match(settingsSource, /BACKUP_S3_REGION/);
  assert.match(settingsSource, /BACKUP_S3_BUCKET/);
  assert.match(settingsSource, /Last recorded platform backup/);
  assert.match(workflowSource, /Upload encrypted backup to private S3 bucket/);
  assert.match(workflowSource, /--sse AES256/);
});


test('successful scheduled S3 backups update platform status and create an audit record', () => {
  const workflowSource = read('../.github/workflows/supabase-backup.yml');
  const settingsSource = read('../src/components/superadmin/PlatformSettingsView.tsx');
  assert.match(workflowSource, /Record successful off-site backup in platform settings and audit/);
  assert.match(workflowSource, /UPDATE public\.super_admin_settings/);
  assert.match(workflowSource, /last_backup_status = 'success'/);
  assert.match(workflowSource, /PLATFORM_OFFSITE_BACKUP_COMPLETED/);
  assert.match(workflowSource, /github-actions-backup-/);
  assert.match(settingsSource, /Last recorded platform backup/);
});


test('Super Admin dashboard quick renew action cannot be submitted twice', () => {
  const dashboardSource = read('../src/components/superadmin/SuperAdminDashboard.tsx');
  assert.match(dashboardSource, /if \(activatingSchoolId\) return/);
  assert.match(dashboardSource, /setActivatingSchoolId\(schoolId\)/);
  assert.match(dashboardSource, /disabled=\{Boolean\(activatingSchoolId\)\}/);
  assert.match(dashboardSource, /Activating…/);
  assert.match(dashboardSource, /finally \{\s*setActivatingSchoolId\(null\)/);
});


test('bulk academic year update is previewed, protected, and requires explicit typed confirmation', () => {
  const apiSource = read('../src/server/api.ts');
  const clientSource = read('../src/services/api.ts');
  const settingsSource = read('../src/components/superadmin/PlatformSettingsView.tsx');
  const panelSource = read('../src/components/superadmin/BulkAcademicYearPanel.tsx');
  assert.match(apiSource, /apiRouter\.post\('\/superadmin\/academic-year\/preview', requireAuth, requireSuperAdmin/);
  assert.match(apiSource, /apiRouter\.post\('\/superadmin\/academic-year\/apply', requireAuth, requireSuperAdmin/);
  assert.match(apiSource, /Academic year must cover two consecutive years/);
  assert.match(apiSource, /parsed\.data\.confirm !== 'CONFIRM'/);
  assert.match(apiSource, /row\.status === 'warning' && !parsed\.data\.includeWarned/);
  assert.match(apiSource, /db\.updateSchool\(row\.id, \{ academicYear: targetYear \}\)/);
  assert.match(apiSource, /SCHOOL_ACADEMIC_YEAR_BULK_UPDATED/);
  assert.match(apiSource, /await db\.flush\(\)/);
  assert.match(clientSource, /previewBulkAcademicYear/);
  assert.match(clientSource, /applyBulkAcademicYear/);
  assert.match(settingsSource, /<BulkAcademicYearPanel \/>/);
  assert.match(panelSource, /Type CONFIRM/);
  assert.match(panelSource, /Preview schools/);
  assert.match(panelSource, /Include all warning rows/);
});

test('bulk academic year preview flags malformed existing years for explicit review', () => {
  const apiSource = read('../src/server/api.ts');
  assert.match(apiSource, /Current academic year is not in YYYY-YYYY format; review before replacing it/);
  assert.match(apiSource, /row\.status === 'warning' && !parsed\.data\.includeWarned/);
});


test('bulk academic year preview warns about draft or published exams tied to another year', () => {
  const apiSource = read('../src/server/api.ts');
  const panelSource = read('../src/components/superadmin/BulkAcademicYearPanel.tsx');
  assert.match(apiSource, /queryAllRows\('exam_schedules', \{\}, 'school_id,academic_year,status'\)/);
  assert.match(apiSource, /\['draft', 'published'\]\.includes\(status\)/);
  assert.match(apiSource, /scheduleYear !== targetYear/);
  assert.match(apiSource, /draft\/published exam schedule\(s\) use a different academic year/);
  assert.match(panelSource, /draft\/published exams tied to another year/);
  assert.match(panelSource, /Include all warning rows/);
});
