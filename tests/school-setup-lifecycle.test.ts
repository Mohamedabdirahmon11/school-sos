import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const api = read('../src/server/api.ts');
const schoolSettings = read('../src/server/school-settings.ts');
const settingsView = read('../src/components/schooladmin/SchoolSettingsView.tsx');
const classesView = read('../src/components/schooladmin/ClassesView.tsx');
const lifecycle = read('../supabase/migrations/20261119160000_school_setup_lifecycle.sql');
const classConfig = read('../supabase/migrations/20261119162000_class_section_configuration.sql');

test('academic date validator uses actual digit tokens', () => {
  assert.ok(api.includes("!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)"));
  assert.ok(!api.includes("!/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/.test(value)"));
});

test('legacy Term 1/2 rows map to Semester 1/2 without renaming history', () => {
  assert.ok(api.includes('name: canonicalSemesterName(term.name)'));
  assert.ok(api.includes('legacySemesterName(name)'));
  assert.ok(lifecycle.includes("t.name IN ('Semester 1','Term 1')"));
  assert.ok(lifecycle.includes("t.name IN ('Semester 2','Term 2')"));
});

test('academic year and term RLS policies are school scoped', () => {
  assert.ok(lifecycle.includes('DROP POLICY IF EXISTS academic_years_tenant_scope'));
  assert.ok(lifecycle.includes('DROP POLICY IF EXISTS terms_tenant_scope'));
  assert.ok(lifecycle.includes('school_id=private.auth_school_id()'));
});

test('new academic years require exactly two semesters before activation', () => {
  assert.ok(lifecycle.includes('Configure Semester 1 and Semester 2 before activating the academic year.'));
  assert.ok(lifecycle.includes('An academic year can contain only two semesters.'));
});

test('lifecycle and class configuration functions have balanced dollar quotes', () => {
  assert.equal(lifecycle.split('\\n').filter(line => line.trim() === 'AS $' || line.trim() === '$;').length, 0);
  assert.equal(classConfig.split('\\n').filter(line => line.trim() === 'AS $' || line.trim() === '$;').length, 0);
});

test('school settings validate date format and extended currencies', () => {
  assert.ok(schoolSettings.includes('dateFormat:'));
  assert.ok(schoolSettings.includes("'KES', 'DJF', 'AED', 'SAR', 'EUR', 'GBP'"));
  assert.ok(settingsView.includes('setDateFormat(school.dateFormat'));
});

test('class sections are school-aware and include capacity and Form Teacher controls', () => {
  assert.ok(classesView.includes('school?.id'));
  assert.ok(classesView.includes('updateClassSectionConfiguration'));
  assert.ok(classesView.includes('setClassSectionActive'));
  assert.ok(classesView.includes('formTeacherRequired'));
  assert.ok(classesView.includes('availableSeats'));
});

test('section capacity cannot be reduced below active enrollment', () => {
  assert.ok(classConfig.includes('Capacity cannot be lower than the current enrollment'));
  assert.ok(classConfig.includes("status='active'"));
});
