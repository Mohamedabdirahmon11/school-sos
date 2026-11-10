import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/060_accountant_expenses_ledger.sql', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/accountant/AccountantExpensesView.tsx', import.meta.url), 'utf8');

test('expense endpoints are school-scoped and use the existing finance permission', () => {
  assert.match(api, /apiRouter\.get\('\/expenses',[\s\S]*?requireAccountantOrSuperAdmin\('fees_manage'\)/);
  assert.match(api, /apiRouter\.post\('\/expenses',[\s\S]*?requireAccountantOrSuperAdmin\('fees_manage'\)/);
  assert.match(api, /apiRouter\.post\('\/expenses\/:id\/void',[\s\S]*?requireAccountantOrSuperAdmin\('fees_manage'\)/);
  assert.match(api, /expenseDate[\s\S]*?expensePaymentMethods\.has\(paymentMethod\)/);
  assert.match(api, /SCHOOL_EXPENSE_RECORDED/);
  assert.match(api, /SCHOOL_EXPENSE_VOIDED/);
});

test('expense ledger migration enforces tenant RLS, positive values, and no hard deletes', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.school_expenses/);
  assert.match(migration, /amount NUMERIC\(12,2\) NOT NULL CHECK \(amount > 0/);
  assert.match(migration, /private\.auth_school_id\(\)/);
  assert.match(migration, /private\.auth_user_role\(\) IN \('school_admin','accountant'\)/);
  assert.match(migration, /REVOKE DELETE ON public\.school_expenses FROM authenticated, anon/);
  assert.match(view, /Expense history/);
  assert.match(view, /Voided records remain available for audit/);
});
