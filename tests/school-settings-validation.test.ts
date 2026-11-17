import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSchoolSettings, sanitizeExamConfigSettings } from '../src/server/school-settings.ts';
import { getLanguageDirection } from '../src/lib/translations.ts';

test('school class-level settings allow KG alongside numeric grades', () => {
  assert.deepEqual(sanitizeSchoolSettings({ classLevels: [0, 1, 2, 8] }).classLevels, [0, 1, 2, 8]);
  assert.deepEqual(sanitizeSchoolSettings({ classLevels: [0] }).classLevels, [0]);
});

test('school class-level settings reject values outside KG through Grade 12', () => {
  assert.throws(() => sanitizeSchoolSettings({ classLevels: [-1, 1] }), /between KG/);
  assert.throws(() => sanitizeSchoolSettings({ classLevels: [1, 13] }), /between KG/);
  assert.throws(() => sanitizeSchoolSettings({ classLevels: [] }), /at least one class level/);
});

const validSidebarTheme = {
  preset: 'brand' as const,
  backgroundColor: '#102c2a',
  textColor: '#ffffff',
  accentColor: '#0f766e',
  activeStyle: 'pill' as const,
  radius: 'rounded' as const,
  density: 'comfortable' as const,
  iconStyle: 'outline' as const,
  showGroupLabels: true,
  width: 276,
  defaultCollapsed: false,
  fontSize: 'normal' as const,
  showLogo: true,
  showSchoolName: true,
  showUserCard: true
};

test('sidebar theme settings accept safe school-scoped appearance preferences', () => {
  const result = sanitizeSchoolSettings({ sidebarTheme: validSidebarTheme });
  assert.deepEqual(result.sidebarTheme, validSidebarTheme);
});

test('sidebar theme settings accept the custom preset', () => {
  const result = sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, preset: 'custom' } });
  assert.equal(result.sidebarTheme?.preset, 'custom');
});

test('sidebar theme settings reject invalid widths, CSS values, and unreadable contrast', () => {
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, width: 400 } }), /240|320/);
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, backgroundColor: 'url(javascript:alert(1))' } }), /six-digit hex/);
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, backgroundColor: '#ffffff', textColor: '#eeeeee' } }), /WCAG AA/);
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, activeStyle: 'arbitrary-css' } }), /Invalid option/);
});


const fourTestsAndFinal = [
  { id: 'test-1', name: 'Test 1', maxMarks: 10, category: 'continuous' as const, order: 1 },
  { id: 'test-2', name: 'Test 2', maxMarks: 10, category: 'continuous' as const, order: 2 },
  { id: 'test-3', name: 'Test 3', maxMarks: 10, category: 'continuous' as const, order: 3 },
  { id: 'test-4', name: 'Test 4', maxMarks: 10, category: 'continuous' as const, order: 4 },
  { id: 'final', name: 'Final', maxMarks: 60, category: 'final' as const, order: 5 }
];

test('exam mark scheme accepts the standard 10+10+10+10+60 preset', () => {
  const result = sanitizeExamConfigSettings({ assessmentComponents: fourTestsAndFinal });
  assert.equal(result.smallExamMax, 40);
  assert.equal(result.bigExamMax, 60);
});

test('exam mark scheme accepts the 40+60 preset and custom 1–6 whole-number parts', () => {
  const preset = sanitizeExamConfigSettings({ assessmentComponents: [
    { id: 'coursework', name: 'Coursework', maxMarks: 40, category: 'continuous', order: 1 },
    { id: 'final', name: 'Final', maxMarks: 60, category: 'final', order: 2 }
  ] });
  assert.equal(preset.smallExamMax, 40);
  assert.equal(preset.bigExamMax, 60);

  const custom = sanitizeExamConfigSettings({ assessmentComponents: [
    { id: 'a', name: 'A', maxMarks: 15, category: 'continuous', order: 1 },
    { id: 'b', name: 'B', maxMarks: 15, category: 'continuous', order: 2 },
    { id: 'c', name: 'C', maxMarks: 20, category: 'continuous', order: 3 },
    { id: 'd', name: 'D', maxMarks: 50, category: 'final', order: 4 }
  ] });
  assert.equal(custom.smallExamMax, 50);
  assert.equal(custom.bigExamMax, 50);
});

test('exam mark scheme rejects totals other than 100 with the Somali validation message', () => {
  assert.throws(
    () => sanitizeExamConfigSettings({ assessmentComponents: [
      { id: 'a', name: 'A', maxMarks: 40, category: 'continuous', order: 1 },
      { id: 'b', name: 'B', maxMarks: 50, category: 'final', order: 2 }
    ] }),
    /Wadarta waa inay noqotaa 100 \(hadda 90\)/
  );
});

test('exam mark scheme rejects fractional marks, duplicate IDs, and more than six parts', () => {
  assert.throws(() => sanitizeExamConfigSettings({ assessmentComponents: [
    { id: 'a', name: 'A', maxMarks: 40.5, category: 'continuous', order: 1 },
    { id: 'b', name: 'B', maxMarks: 59.5, category: 'final', order: 2 }
  ] }));
  assert.throws(() => sanitizeExamConfigSettings({ assessmentComponents: [
    { id: 'a', name: 'A', maxMarks: 40, category: 'continuous', order: 1 },
    { id: 'a', name: 'B', maxMarks: 60, category: 'final', order: 2 }
  ] }));
  assert.throws(() => sanitizeExamConfigSettings({ assessmentComponents: Array.from({ length: 7 }, (_, index) => ({
    id: `part-${index}`, name: `Part ${index}`, maxMarks: index === 6 ? 40 : 10,
    category: index === 6 ? 'final' : 'continuous', order: index + 1
  })) }));
});


test('exam mark scheme supports the one-part and six-part custom boundaries', () => {
  const onePart = sanitizeExamConfigSettings({ assessmentComponents: [
    { id: 'overall', name: 'Overall Assessment', maxMarks: 100, category: 'continuous', order: 1 }
  ] });
  assert.equal(onePart.smallExamMax, 100);
  assert.equal(onePart.bigExamMax, 0);

  const sixParts = sanitizeExamConfigSettings({ assessmentComponents: [
    { id: 'p1', name: 'Part 1', maxMarks: 10, category: 'continuous', order: 1 },
    { id: 'p2', name: 'Part 2', maxMarks: 10, category: 'continuous', order: 2 },
    { id: 'p3', name: 'Part 3', maxMarks: 15, category: 'continuous', order: 3 },
    { id: 'p4', name: 'Part 4', maxMarks: 15, category: 'final', order: 4 },
    { id: 'p5', name: 'Part 5', maxMarks: 20, category: 'final', order: 5 },
    { id: 'p6', name: 'Part 6', maxMarks: 30, category: 'final', order: 6 }
  ] });
  assert.equal(sixParts.smallExamMax, 50);
  assert.equal(sixParts.bigExamMax, 50);
});


test('school settings accept Arabic as a default language', () => {
  assert.equal(sanitizeSchoolSettings({ language: 'ar' }).language, 'ar');
  assert.equal(sanitizeSchoolSettings({ language: 'am' }).language, 'am');
});

test('Arabic language switches the application direction to RTL', () => {
  assert.equal(getLanguageDirection('ar'), 'rtl');
  assert.equal(getLanguageDirection('en'), 'ltr');
  assert.equal(getLanguageDirection('so'), 'ltr');
  assert.equal(getLanguageDirection('am'), 'ltr');
});
