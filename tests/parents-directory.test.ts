import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const client = read('../src/services/api.ts');
const view = read('../src/components/schooladmin/ParentsView.tsx');

test('parent contacts are derived from active students scoped to the current school and optional class', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(route.includes('requireAuth, requireSchoolContext'))
  assert.ok(route.includes('Only school administrators and the assigned Form Teacher'))
  assert.ok(route.includes('studentClassFilter = requestedClassId || ownClassIds'))
  assert.ok(route.includes('school_id: school.id'))
  assert.ok(route.includes("status: 'active'"))
  assert.ok(route.includes('studentFilters.class_id = studentClassFilter'))
});

test('guardian phone numbers are normalized and deduplicated per school', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(route.includes("rawPhone.replace(/\\D/g, '')"));
  assert.ok(route.includes('contacts.get(contactKey)'));
  assert.ok(route.includes('contacts.set(contactKey, contact)'));
  assert.ok(route.includes('contact.students.some(item => item.id === child.id)'));
  assert.ok(route.includes("addContact(student.motherPhone, '', 'Mother', child)"));
  assert.ok(route.includes('guardianLinks'));
  assert.ok(route.includes("addContact(guardian.phone, guardian.fullName, 'Guardian', child)"));
});



test('unique contacts are searched, sorted, and paginated after deduplication', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.match(route, /\.filter\(contact => !query/);
  assert.match(route, /\.sort\(\(a, b\) => a\.phone\.localeCompare/);
  assert.match(route, /const total = filtered\.length/);
  assert.match(route, /filtered\.slice\(\(page - 1\) \* pageSize, page \* pageSize\)/);
});

test('Parents directory uses the unique contacts endpoint and exposes class All filter', () => {
  assert.match(client, /getParentContacts\(/);
  assert.match(client, /\/parents\/contacts\?/);
  assert.match(view, /ApiClient\.getParentContacts\(\{ page, pageSize: 50, search: debouncedSearch, classId: classFilter, signal: controller\.signal \}\)/);
  assert.match(view, /setDebouncedSearch\(search\), 300/);
  assert.match(view, /controller\.abort\(\)/);
  assert.match(view, /<option value="">All classes<\/option>/);
  assert.match(view, /contact\.students\.map/);
});


test('guardian links are restricted to students visible in the active directory', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(route.includes('student_id: studentIdsForFilter'));
  assert.ok(route.includes('student_id: students.map((student: any) => String(student.id))'));
  assert.ok(route.includes("'guardian_id,student_id,relation,is_primary', 'guardian_id,student_id'"));
});

test('parent directory responses are briefly cached per school and access scope then invalidated on writes', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(api.includes('parentContactsResponseCache = new Map'));
  assert.ok(route.includes("[school.id, role, role === 'teacher' ? user.id : 'school'"));
  assert.ok(route.includes('expiresAt: Date.now() + 10_000'));
  assert.ok(api.includes('parentContactsResponseCache.delete(key)'));
});

test('parent directory overlaps independent class and academic-year reads', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.ok(route.includes('const [classes, currentYearId] = await Promise.all(['));
});

test('parents without phone numbers remain visible with a safe placeholder', () => {
  const start = api.indexOf("apiRouter.get('/parents/contacts'");
  const end = api.indexOf("apiRouter.get('/students'", start);
  const route = api.slice(start, end);
  assert.match(route, /const contactKey = normalizedPhone \|\| `missing:\$\{child\.id\}`/);
  assert.match(route, /'Phone not provided'/);
  assert.match(view, /if \(!digits\) return null/);
});

test('parent contact API returns a retryable service error and the frontend retries transient failures', () => {
  const api = read('../src/server/api.ts');
  const view = read('../src/components/schooladmin/ParentsView.tsx');
  assert.match(api, /PARENT_CONTACTS_UNAVAILABLE/);
  assert.match(api, /retryable: true/);
  assert.match(view, /const fetchWithRetry = async/);
  assert.match(view, /attempt < 3/);
  assert.match(view, /status >= 500/);
});
