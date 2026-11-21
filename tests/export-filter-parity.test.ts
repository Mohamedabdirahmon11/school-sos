import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Student CSV, Excel and PDF exports use the same visible filter query', () => {
  const source = read('../src/components/schooladmin/StudentsView.tsx');
  assert.match(source, /const buildStudentExportQuery = \(\) =>/);
  assert.match(source, /classFilter\) params\.set\('classId'/);
  assert.match(source, /branchFilter\) params\.set\('branchId'/);
  assert.match(source, /search\.trim\(\)\) params\.set\('search'/);
  assert.match(source, /genderFilter !== 'all'\) params\.set\('gender'/);
  assert.match(source, /studentStatusFilter !== 'all'\) params\.set\('status'/);
  assert.match(source, /feeFilter !== 'all'\) params\.set\('feeStatus'/);
  assert.match(source, /students\/export\?' \+ buildStudentExportQuery\(\)/);
  assert.match(source, /students\/export\.pdf\?' \+ buildStudentExportQuery\(\)/);
  assert.match(source, /const response = await fetch\('\/api\/students\/export\?' \+ buildStudentExportQuery\(\)/);
});

test('Teacher list and export share search and subject filters', () => {
  const source = read('../src/components/schooladmin/TeachersView.tsx');
  assert.match(source, /ApiClient\.getTeachers\(\{ page, pageSize: 20, search: debouncedSearch, subjectId: subjectFilter \}/);
  assert.match(source, /params\.set\('search', search\.trim\(\)\)/);
  assert.match(source, /params\.set\('subjectId', subjectFilter\)/);
  assert.match(source, /filteredTeachers\.map/);
});
