import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/061_accountant_payment_channels_bank_reconciliation.sql', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../src/components/accountant/AccountantBankReconciliationView.tsx', import.meta.url), 'utf8');

test('fee collection accepts only the three supported channels and persists the selected channel', () => {
  assert.match(api, /\['Cash', 'Bank Transfer', 'Mobile Money'\]\.includes\(paymentMethod\)/);
  assert.match(storage, /p_payment_method: paymentData\.paymentMethod \|\| 'Cash'/);
  assert.match(storage, /paymentMethod: paymentData\.paymentMethod \|\| 'Cash'/);
  assert.match(migration, /payment_method IN \('Cash', 'Bank Transfer', 'Mobile Money'\)/);
});

test('bank statement lines are school scoped and cannot be matched to the wrong transaction type', () => {
  assert.match(api, /apiRouter\.get\('\/bank-reconciliation',[\s\S]*?requireAccountantOrSuperAdmin\('fees_manage'\)/);
  assert.match(api, /apiRouter\.post\('\/bank-reconciliation',[\s\S]*?requireAccountantOrSuperAdmin\('fees_manage'\)/);
  assert.match(api, /apiRouter\.post\('\/bank-reconciliation\/:id\/match',[\s\S]*?requireAccountantOrSuperAdmin\('fees_manage'\)/);
  assert.match(storage, /entry\.direction !== 'credit'/);
  assert.match(storage, /entry\.direction !== 'debit'/);
  assert.match(storage, /Math\.abs\(Number\(payment\.amountPaid\) - Number\(entry\.amount\)\) > 0\.01/);
  assert.match(storage, /Math\.abs\(Number\(expense\.amount\) - Number\(entry\.amount\)\) > 0\.01/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_matched_payment/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_statement_matched_expense/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(screen, /Bank reconciliation/);
  assert.match(screen, /Save statement line/);
});
