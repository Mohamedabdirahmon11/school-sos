import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const view = read('../src/components/schooladmin/StudentsView.tsx');

test('student directory uses class roll number order with student ID fallback', () => {
  assert.match(api, /aStudentId\.localeCompare\(bStudentId, undefined, \{ sensitivity: 'base', numeric: true \}\)/);
  assert.match(api, /queryPage\('students', filters, page, pageSize, roleFilter \|\| searchFilter, LIST_QUERY_COLUMNS\.students, 'roll_number'\)/);
});

test('student directory defaults to 50 rows per page and does not force every class roster open', () => {
  assert.match(view, /pageSize: 50/);
  assert.match(view, /allClass: showAllClass/);
  assert.match(view, /const \[showAllClass, setShowAllClass\] = useState\(false\)/);
});

test('School Admin can explicitly show all students in the selected class', () => {
  assert.match(view, /classFilter && feeFilter === 'all'/);
  assert.match(view, /Show all students in this class/);
  assert.match(view, /checked=\{showAllClass\}/);
  assert.match(view, /!showAllClass && <PaginationControls info=\{pageInfo\} onPage=\{setPage\} \/>/);
});

test('gender and status filters are sent to the server before pagination', () => {
  assert.match(view, /gender: genderFilter, status: studentStatusFilter/);
  assert.match(api, /gender, status: studentStatus/);
  assert.match(view, /const visibleStudents = \[\.\.\.students\]\.sort\(compareRollNumber\);/);
});

test('changing search and filters resets student pagination', () => {
  assert.match(view, /setSearch\(e\.target\.value\); setPage\(1\)/);
  assert.match(view, /setBranchFilter\(e\.target\.value\); setPage\(1\)/);
  assert.match(view, /setClassFilter\(e\.target\.value\); setShowAllClass\(false\); setPage\(1\)/);
  assert.match(view, /setFeeFilter\(e\.target\.value\); setShowAllClass\(false\); setPage\(1\)/);
});


test('student directory uses active current-year enrollments for class filters and display labels', () => {
  const api = read('../src/server/api.ts');
  const start = api.indexOf("apiRouter.get('/students'");
  const end = api.indexOf("apiRouter.get('/students/export'", start);
  const route = api.slice(start, end);
  assert.match(route, /const currentYearId = await getCurrentAcademicYearId\(school\.id\);/);
  assert.match(api, /db\.queryPage\('academic_years', \{ school_id: schoolId, is_current: 'true' \}/);
  assert.match(api, /invalidateCurrentAcademicYearCache\(schoolId\)/);
  assert.match(route, /'enrollments', \{[\s\S]*?academic_year_id: currentYearId,[\s\S]*?status: 'active',[\s\S]*?class_id: enrollmentClassScope[\s\S]*?\}/);
  assert.match(route, /filters\.id = enrolledStudentIds/);
  assert.match(route, /className: klass \? \[klass\.name, section\].*'Not assigned'/s);
});

test('school roster lookup indexes cover current academic year and Form Teacher scopes', () => {
  const migration = read('../supabase/migrations/20261122170000_school_roster_lookup_indexes.sql');
  assert.match(migration, /academic_years_current_school_idx[\s\S]*?ON public\.academic_years \(school_id, id\)[\s\S]*?WHERE is_current = true/);
  assert.match(migration, /classes_form_teacher_school_active_idx[\s\S]*?ON public\.classes \(school_id, class_teacher_id\)[\s\S]*?WHERE is_archived = false/);
});

test('student roster overlaps class and section labels with student reads after enrollment scope is known', () => {
  const start = api.indexOf("apiRouter.get('/students'");
  const end = api.indexOf("apiRouter.get('/students/export'", start);
  const route = api.slice(start, end);
  assert.match(route, /const \[result, classRows, sectionRows\] = await Promise\.all\(\[/);
  assert.match(route, /classRowsPromise = currentYearId[\s\S]*?queryAllRows\('classes',[\s\S]*?'id,name,section'/);
  assert.match(route, /sectionRowsPromise = sectionIds\.length[\s\S]*?queryAllRows\('class_sections'/);
  assert.match(route, /setRosterLabels\(classRows, sectionRows\)/);
});


test('student fee-status reads are restricted to the requested academic year', () => {
  const api = read('../src/server/api.ts');
  const start = api.indexOf('async function getStudentFeeStatusMap');
  const end = api.indexOf('async function queryAllRows', start);
  const helper = api.slice(start, end);
  assert.ok(helper.includes('student_id: studentIds'));
  assert.ok(helper.includes('academic_year: academicYear'));
});
