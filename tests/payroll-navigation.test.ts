import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const extraModules = readFileSync(new URL('../src/components/schooladmin/ExtraModulesView.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('School Admin extra modules do not expose the stale payroll screen', () => {
  assert.doesNotMatch(extraModules, /payroll|payslip/i);
  assert.match(app, /activeView === 'sch_payroll'[\s\S]*?user\.role === 'accountant' \? <AccountantPayrollView \/>/);
  assert.match(app, /activeView === 'sch_fees'[\s\S]*?<FeesLedgerView \/>/);
  assert.match(app, /activeView === 'sch_payroll'[\s\S]*?user\.role === 'accountant' \? <AccountantPayrollView \/>/);
  assert.doesNotMatch(app, /user\.role === 'school_admin' && \['sch_fees', 'sch_payroll'\]/);
});
