import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('parent directory loads every page through the school-scoped students API', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/ParentsView.tsx', import.meta.url), 'utf8');
  assert.match(source, /getSchoolStudents\(\{ schoolId: school\.id, page, pageSize: 20, search \}\)/);
  assert.match(source, /PaginationControls info=\{pageInfo\}/);
  assert.match(source, /setPageInfo\(\(rows as any\)\.pagination/);
  assert.match(source, /setPage\(1\)/);
});

test('parent directory provides real call, SMS and WhatsApp links for both guardians', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/ParentsView.tsx', import.meta.url), 'utf8');
  assert.match(source, /href=\{\x60tel:\$\{value\}\x60\}/);
  assert.match(source, /href=\{\x60sms:\$\{value\}\x60\}/);
  assert.match(source, /https:\/\/wa\.me\//);
  assert.match(source, /contactActions\(student\.fatherPhone\)/);
  assert.match(source, /contactActions\(student\.motherPhone\)/);
  assert.doesNotMatch(source, /alert\(/);
});

test('parent directory reports loading failures and offers a real retry', () => {
  const source = readFileSync(new URL('../src/components/schooladmin/ParentsView.tsx', import.meta.url), 'utf8');
  assert.match(source, /setLoadError\(error\?\.message/);
  assert.match(source, /setReloadCount\(count => count \+ 1\)/);
});
