import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const extraModules = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/layout/Sidebar.tsx', import.meta.url), 'utf8');

test('School Admin can open Fees & Payments but payroll remains accountant-only', () => {
  assert.match(sidebar, /id: 'sch_fees', label: t\('fees_payments'\)/);
  assert.match(app, /const activeView = user\.role === 'school_admin' && requestedView === 'sch_payroll' \? 'sch_dashboard' : requestedView;/);
  assert.match(app, /activeView === 'sch_payroll'[\s\S]*?user\.role === 'accountant' \? <AccountantPayrollView \/>/);
  assert.doesNotMatch(extraModules, /payroll|payslip/i);
});

const settings = readFileSync(new URL('../src/components/schooladmin/SchoolSettingsView.tsx', import.meta.url), 'utf8');
const mobile = readFileSync(new URL('../src/components/layout/MobileBottomNav.tsx', import.meta.url), 'utf8');

test('School Admin menu exposes year-end promotion and localizes navigation sections', () => {
  assert.match(sidebar, /id: 'sch_promotion', label: t\('year_end_promotion'\)/);
  assert.match(sidebar, /section: t\('nav_people_academics'\)/);
  assert.match(sidebar, /section: t\('nav_management'\)/);
});

test('School Admin mobile quick navigation includes attendance', () => {
  assert.match(mobile, /id: 'sch_attendance', label: t\('attendance'\)/);
});

test('School Settings does not duplicate exam or timetable configuration', () => {
  assert.doesNotMatch(settings, /getExamConfig|handleSaveExamRules|settings_exam_marks/);
  assert.doesNotMatch(settings, /getTimetableSettings|handleSaveTimetable|settings_timetable/);
  assert.match(settings, /notificationPreferences/);
});

test('lockout counter hydration tolerates both mapped and raw Supabase field names', () => {
  const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
  assert.match(storage, /Number\(row\.count \?\? row\.attemptCount \?\? 0\)/);
});
