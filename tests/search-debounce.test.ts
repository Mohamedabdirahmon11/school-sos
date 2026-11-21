import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('directory searches use a 300ms debounce and abort superseded network requests', () => {
  const debounce = read('../src/hooks/useDebouncedValue.ts');
  const apiHook = read('../src/hooks/useApi.ts');
  const apiClient = read('../src/services/api.ts');
  assert.match(debounce, /delayMs = 300/);
  assert.match(apiHook, /new AbortController\(\)/);
  assert.match(apiHook, /controller\.abort\(\)/);
  assert.match(apiHook, /controller\?\.signal/);
  assert.match(apiClient, /requestOptions\.signal\?\.aborted/);
  for (const file of ['StudentsView.tsx', 'TeachersView.tsx', 'ParentsView.tsx']) {
    const source = read(`../src/components/schooladmin/${file}`);
    assert.match(source, /useDebouncedValue\(search, 300\)/, `${file} must debounce its search input`);
  }
});

test('API list methods accept AbortSignal without changing their existing call signatures', () => {
  const api = read('../src/services/api.ts');
  assert.match(api, /getSchoolStudents\(params\?: any, signal\?: AbortSignal\)/);
  assert.match(api, /getTeachers\(params\?: any, signal\?: AbortSignal\)/);
  assert.match(api, /getParentContacts\([^\n]+signal\?: AbortSignal\)/);
  assert.match(api, /return this\.request<Student\[]>\([^\n]+\{ signal \}\)/);
});
