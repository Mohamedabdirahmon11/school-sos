import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('large School Admin data tables have horizontal-scroll containers on narrow screens', () => {
  const views = [
    'StudentsView.tsx', 'TeachersView.tsx', 'ParentsView.tsx', 'AttendanceView.tsx',
    'TimetableView.tsx', 'ExamsResultsView.tsx', 'FeesLedgerView.tsx',
    'StudentInvoicesView.tsx', 'ReportCardsView.tsx', 'NoticesEventsView.tsx',
    'StaffAccessView.tsx', 'TeacherAssignmentsView.tsx'
  ];
  for (const file of views) {
    const source = read(`../src/components/schooladmin/${file}`);
    if (source.includes('<table')) {
      assert.match(source, /overflow-x-auto/, `${file} must keep tables horizontally scrollable`);
      assert.match(source, /min-w-/, `${file} must preserve readable table column widths`);
    }
  }
  const teacherPortal = read('../src/components/teacher/TeacherPortalView.tsx');
  assert.ok((teacherPortal.match(/<table\\b/g) || []).length <= (teacherPortal.match(/overflow-x-auto/g) || []).length,
    'each teacher portal table must have a horizontal-scroll wrapper');
});

test('Parent and Student portals use responsive card layouts instead of wide tables', () => {
  for (const file of ['ParentPortalView.tsx', 'StudentPortalView.tsx']) {
    const source = read(`../src/components/${file.startsWith('Parent') ? 'parent' : 'student'}/${file}`);
    assert.doesNotMatch(source, /<table\\b/, `${file} should not render a wide data table`);
    assert.match(source, /grid|flex/, `${file} should use responsive cards or lists`);
  }
});

test('School Admin responsive tokens retain scroll behavior at mobile and tablet breakpoints', () => {
  const css = read('../src/index.css');
  assert.match(css, /@media \\(max-width: 767px\\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /overscroll-behavior-x: contain/);
  assert.match(css, /table \\{ min-width: 680px; \\}/);
});
