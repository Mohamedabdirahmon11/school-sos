import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSchoolSettings } from '../src/server/school-settings.ts';

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

test('sidebar theme settings reject invalid widths, CSS values, and unreadable contrast', () => {
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, width: 400 } }), /240|320/);
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, backgroundColor: 'url(javascript:alert(1))' } }), /six-digit hex/);
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, backgroundColor: '#ffffff', textColor: '#eeeeee' } }), /WCAG AA/);
  assert.throws(() => sanitizeSchoolSettings({ sidebarTheme: { ...validSidebarTheme, activeStyle: 'arbitrary-css' } }), /Invalid option/);
});
