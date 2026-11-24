import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const admissions = readFileSync(new URL('../src/components/schooladmin/AdmissionsView.tsx', import.meta.url), 'utf8');
const staff = readFileSync(new URL('../src/components/schooladmin/StaffAccessView.tsx', import.meta.url), 'utf8');
const assignments = readFileSync(new URL('../src/components/schooladmin/TeacherAssignmentsView.tsx', import.meta.url), 'utf8');
const timetable = readFileSync(new URL('../src/components/schooladmin/TimetableView.tsx', import.meta.url), 'utf8');
const documents = readFileSync(new URL('../src/components/documents/DocumentsView.tsx', import.meta.url), 'utf8');

test('mobile admissions, staff, assignment, timetable and document views have scoped responsive layouts', () => {
  for (const [source, selector] of [
    [admissions, 'school-people-admissions-page'],
    [staff, 'school-people-staff-page'],
    [assignments, 'schoolos-assignment-page'],
    [timetable, 'schoolos-timetable-page'],
    [documents, 'documents-view'],
  ]) assert.ok(source.includes(selector), 'missing view scope: ' + selector);

  for (const selector of [
    '.school-people-admissions-page .people-admissions-board',
    '.school-people-staff-page',
    '.schoolos-assignment-page .schoolos-assignment-toolbar',
    '.schoolos-timetable-page .overflow-x-auto',
    '.documents-view > .grid',
    '.documents-view .documents-admin-details',
  ]) assert.ok(styles.includes(selector), 'missing mobile responsive rule: ' + selector);
});

test('mobile form controls remain touch-sized and readable without forcing page-wide horizontal scroll', () => {
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /font-size:\s*16px/);
  assert.match(styles, /overflow-x:\s*clip/);
  assert.match(styles, /overscroll-behavior-x:\s*contain/);
});

test('mobile low-contrast helper text is strengthened on people and document screens', () => {
  assert.match(styles, /\.school-people-page \.text-slate-400[\s\S]*?color:\s*#52636b\s*!important/);
  assert.match(styles, /\.documents-view \.text-slate-500/);
});
