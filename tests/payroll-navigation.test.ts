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
