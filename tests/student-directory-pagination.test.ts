import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const view = read('../src/components/schooladmin/StudentsView.tsx');

test('student directory uses student ID order before name fallback', () => {
  assert.match(api, /aStudentId\.localeCompare\(bStudentId, undefined, \{ sensitivity: 'base', numeric: true \}\)/);
  assert.match(api, /queryPage\('students', filters, page, pageSize, roleFilter \|\| searchFilter, LIST_QUERY_COLUMNS\.students, 'student_id'\)/);
});

test('student directory defaults to 50 rows per page and does not force every class roster open', () => {
  assert.match(view, /pageSize: 50/);
  assert.match(view, /allClass: showAllClass/);
  assert.match(view, /const \[showAllClass, setShowAllClass\] = useState\(false\)/);
});

test('School Admin can explicitly show all students in the selected class', () => {
  assert.match(view, /classFilter && feeFilter === 'all'/);\n  assert.match(view, /Show all students in this class/);
  assert.match(view, /checked=\{showAllClass\}/);
  assert.match(view, /!showAllClass && <PaginationControls info=\{pageInfo\} onPage=\{setPage\} \/>/);
});

test('changing search and filters resets student pagination', () => {
  assert.match(view, /setSearch\(e\.target\.value\); setPage\(1\)/);
  assert.match(view, /setBranchFilter\(e\.target\.value\); setPage\(1\)/);
  assert.match(view, /setClassFilter\(e\.target\.value\); setShowAllClass\(false\); setPage\(1\)/);
  assert.match(view, /setFeeFilter\(e\.target\.value\); setShowAllClass\(false\); setPage\(1\)/);
});
