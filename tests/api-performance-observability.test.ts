import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const login = readFileSync(new URL('../src/components/auth/LoginView.tsx', import.meta.url), 'utf8');
const bundleBudget = readFileSync(new URL('../scripts/check-bundle-budget.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('API request metrics include request ID, route, status, elapsed time, query count and school ID', () => {
  assert.match(api, /res\.setHeader\('X-Request-Id', requestId\)/);
  for (const field of ['method', 'status', 'durationMs', 'dbQueries', 'dbDurationMs']) {
    assert.match(api, new RegExp('\\b' + field + ':'));
  }
  assert.match(api, /requestId,/);
  assert.match(api, /route,/);
  assert.match(api, /schoolId\s*\n\s*}\)\);/);
  assert.match(api, /console\.info\(JSON\.stringify\(/);
});

test('request metrics read query counters inside the matching AsyncLocalStorage context', () => {
  const contextIndex = api.indexOf('storage.runWithRequestContext(context, () => {');
  const finishIndex = api.indexOf("res.once('finish'", contextIndex);
  const metricsIndex = api.indexOf('storage.getRequestQueryMetrics?.()', finishIndex);
  assert.ok(contextIndex >= 0 && finishIndex > contextIndex && metricsIndex > finishIndex);
});

test('readiness and dashboard caches are tenant scoped and invalidated after successful writes', () => {
  assert.match(api, /new SchoolReadinessCache<any>\(30_000\)/);
  assert.match(api, /new SchoolReadinessCache<any>\(15_000\)/);
  assert.match(api, /schoolId\s*\n\s*}\)\);/);
  assert.match(api, /schoolId\s*\n\s*}\)\);/);
  assert.ok(api.includes('teacherDashboardSummaryCache.invalidatePrefix'));
  assert.match(api, /schoolId\s*\n\s*}\)\);/);
});

test('main application routes keep lazy-loaded views behind a Suspense boundary', () => {
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/components\/schooladmin\/StudentsView\.tsx'\)/);
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/components\/teacher\/TeacherPortalView\.tsx'\)/);
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/components\/student\/StudentPortalView\.tsx'\)/);
  assert.match(app, /React\.lazy\(\(\) => import\('\.\/components\/parent\/ParentPortalView\.tsx'\)/);
  assert.match(app, /<React\.Suspense fallback=/);
});

test('bundle budget reports actual gzip bytes and enforces explicit entry budgets', () => {
  assert.match(bundleBudget, /gzipSync/);
  assert.match(bundleBudget, /BUNDLE_ENTRY_JS_MAX_GZIP_KB/);
  assert.match(bundleBudget, /BUNDLE_ENTRY_CSS_MAX_GZIP_KB/);
  assert.match(bundleBudget, /process\.exitCode = 1/);
});

test('Lighthouse CI uses a current trace-compatible release and retains report artifacts', () => {
  assert.match(workflow, /@lhci\/cli@0\.16\.1/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /lcpDetails:/);
});

test('public login paints while session verification runs but cannot submit before authorization resolves', () => {
  assert.match(app, /if \(isLoading && user\) return <LoadingState/);
  assert.match(app, /if \(!user\) \{\s*return <LoginView authCheckPending=\{isLoading\} \/>/);
  assert.match(login, /if \(authCheckPending\) return;/);
  assert.match(login, /disabled=\{isLoading \|\| authCheckPending\}/);
});


test('student options endpoint is bounded, school scoped, role scoped, and excludes fee joins', () => {
  const start = api.indexOf("apiRouter.get('/students/options'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /requireAuth, requireSchoolContext, requireParentPortalSetupReady/);
  assert.match(route, /school_id: school\.id/);
  assert.match(route, /getTeacherAssignedClassIds\(school\.id, user\.id\)/);
  assert.match(route, /getParentLinkedStudentIds\(school\.id, user\.id\)/);
  assert.match(route, /db\.queryPage\([\s\S]*?\n    1,\n    20,/);
  assert.match(route, /id,student_id,first_name,middle_name,last_name,status,class_id/);
  assert.match(route, /res\.set\('Cache-Control', 'private, no-store'\)/);
  assert.doesNotMatch(route, /fee_payments|getStudentFeeStatusMap|feeStatus/);
});

test('extra modules use debounced student options instead of downloading every student', () => {
  const modules = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
  assert.match(modules, /ApiClient\.getStudentOptions\(search\)/);
  assert.match(modules, /\}, 250\)/);
  assert.doesNotMatch(modules, /ApiClient\.getAllStudents\(/);
  assert.match(modules, /Search student by name or ID/);
});


test('GET exam config, reports and yearly rankings use read-only default configuration', () => {
  assert.match(api, /apiRouter\.get\('\/exams\/config'[\s\S]*?db\.getExamConfig\(school\.id, school\.academicYear, false\)/);
  assert.match(api, /apiRouter\.get\('\/school\/reports\/summary'[\s\S]*?db\.getExamConfig\(school\.id, school\.academicYear, false\)/);
  assert.match(api, /db\.getClassYearlyRankings\(school\.id, classId, false\)/);
});


test('school report summary is cached per school and role and invalidated after tenant writes', () => {
  assert.match(api, /const schoolReportSummaryCache = new SchoolReadinessCache<any>\(60_000\)/);
  assert.match(api, /schoolReportSummaryCache\.get\(\`\$\{school\.id\}:\$\{user\.role\}\`, async \(\) =>/);
  assert.match(api, /schoolReportSummaryCache\.invalidatePrefix\(\`\$\{schoolId\}:\`\)/);
  assert.match(api, /if \(user\.role === 'accountant' \|\| user\.role === 'super_admin'\)/);
});


test('yearly rankings cache is five minutes, tenant and identity scoped, and invalidated on writes', () => {
  assert.match(api, /const classYearlyRankingsCache = new SchoolReadinessCache<any>\(5 \* 60_000\)/);
  assert.match(api, /classYearlyRankingsCache\.invalidatePrefix\(\`\$\{schoolId\}:`\)/);
  const start = api.indexOf("apiRouter.get('/exams/rankings/yearly'");
  const end = api.indexOf('// Year-End Promotion Confirmation', start);
  const route = api.slice(start, end);
  assert.ok(route.indexOf('canReadClassResults') < route.indexOf('classYearlyRankingsCache.get'));
  assert.match(route, /\$\{school\.id\}:\$\{school\.academicYear\}:\$\{classId\}:\$\{role\}:\$\{user\.id\}/);
});


test('class details cache is short-lived, school/role/user/page scoped and invalidated on writes', () => {
  assert.match(api, /const classDetailsCache = new SchoolReadinessCache<any>\(60_000\)/);
  assert.match(api, /classDetailsCache\.invalidatePrefix\(\`\$\{schoolId\}:`\)/);
  const start = api.indexOf("apiRouter.get('/classes/:id/details'");
  const end = api.indexOf("apiRouter.get('/school/dashboard'", start);
  const route = api.slice(start, end);
  assert.ok(route.indexOf('getTeacherAssignedClassIds') < route.indexOf('classDetailsCache.get'));
  assert.match(route, /\$\{school\.id\}:\$\{req\.params\.id\}:\$\{role\}:\$\{user\.id\}:\$\{page\}:\$\{pageSize\}:\$\{search\}/);
  assert.match(route, /res\.json\(details\)/);
});


test('message contacts query only allowed roles with a bounded projection and server-side search', () => {
  const start = api.indexOf("apiRouter.get('/messages/contacts'");
  const end = api.indexOf("apiRouter.get('/messages'", start);
  const route = api.slice(start, end);
  assert.match(route, /req\.query\.q/);
  assert.match(route, /db\.queryPage\([\s\S]*?'users',[\s\S]*?\n      1,\n      100,/);
  assert.match(route, /id,role,full_name,email,phone,student_id/);
  assert.doesNotMatch(route, /db\.getUsers\(school\.id\)/);
});

test('messages UI debounces contact search and sends it to the server', () => {
  const view = readFileSync(new URL('../src/components/schooladmin/MessagesView.tsx', import.meta.url), 'utf8');
  assert.match(view, /ApiClient\.getMessageContacts\(\{ search: searchContact \}\)/);
  assert.match(view, /\}, 250\)/);
  assert.doesNotMatch(view, /Promise\.all\(\[[\s\S]*?getMessageContacts/);
});


test('student pages use a short-lived per-school, role, user and filter cache invalidated by writes', () => {
  assert.match(api, /const STUDENT_LIST_CACHE_TTL_MS = 20_000/);
  assert.match(api, /studentListResponseCache\.get\(studentCacheKey\)/);
  assert.match(api, /studentListResponseCache\.set\(studentCacheKey/);
  assert.match(api, /studentListResponseCache\.keys\(\).*schoolId/);
  const start = api.indexOf("apiRouter.get('/students',");
  const end = api.indexOf("apiRouter.get('/teachers'", start);
  const route = api.slice(start, end);
  assert.ok(route.indexOf('getTeacherAssignedClassIds') < route.indexOf('studentListResponseCache.get'));
  assert.match(route, /userId: user\.id, role: user\.role, filters, roleFilter, page, pageSize, search, feeStatus/);
  assert.match(route, /req\.query\.allClass !== 'true'/);
});


test('student list ETag hits return 304 before enrollment or student database queries', () => {
  const start = api.indexOf("apiRouter.get('/students'");
  const end = api.indexOf("apiRouter.get('/teachers'", start);
  const route = api.slice(start, end);
  assert.ok(route.indexOf('studentListResponseCache.get') < route.indexOf('getCurrentAcademicYearId'));
  assert.match(route, /req\.headers\['if-none-match'\]/);
  assert.match(route, /res\.status\(304\)\.end\(\)/);
  assert.match(route, /createHash\('sha256'\)/);
});
