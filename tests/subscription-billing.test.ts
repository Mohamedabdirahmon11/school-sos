import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getRecurringInvoiceAmount, isOpenSubscriptionInvoice } from '../src/lib/subscription-billing.ts';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/superadmin/PlansBillingView.tsx', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../src/server/storage.ts', import.meta.url), 'utf8');

test('recurring invoice pricing supports zero-price plans and skips lifetime subscriptions', () => {
  assert.equal(getRecurringInvoiceAmount('monthly', { monthlyPrice: 0 }), 0);
  assert.equal(getRecurringInvoiceAmount('yearly', { yearlyPrice: 450 }), 450);
  assert.equal(getRecurringInvoiceAmount('lifetime', { monthlyPrice: 90, yearlyPrice: 900 }), null);
  assert.equal(getRecurringInvoiceAmount('monthly', { monthlyPrice: -1 }), null);
  assert.equal(getRecurringInvoiceAmount('monthly', null), null);
});

test('unpaid and overdue invoices both block duplicate batch billing', () => {
  assert.equal(isOpenSubscriptionInvoice('unpaid'), true);
  assert.equal(isOpenSubscriptionInvoice('overdue'), true);
  assert.equal(isOpenSubscriptionInvoice('paid'), false);
});

test('batch billing uses validated recurring pricing and reports its actual count', () => {
  assert.ok(api.includes('isOpenSubscriptionInvoice(invoice.status)'));
  assert.ok(api.includes('getRecurringInvoiceAmount(cadence, plan)'));
  assert.ok(api.includes('generatedCount: generated'));
  assert.ok(client.includes("'/superadmin/invoices/generate'"));
  assert.ok(client.includes('generatedCount: number'));
  assert.ok(!client.includes(".catch(() => ({ success: true, count: 0 }))"));
  assert.match(ui, /res\.generatedCount/);
  assert.match(ui, /loadError/);
});

test('plan edits validate prices and limits without allowing plan ID changes', () => {
  assert.ok(api.includes('Number.isFinite(value)'));
  assert.ok(api.includes('Number.isInteger(value)'));
  assert.ok(api.includes('Provide at least one supported plan price or limit to update.'));
  assert.ok(storage.includes('{ ...this.data.plans[idx], ...updates, id: this.data.plans[idx].id }'));
  assert.ok(api.includes('SUBSCRIPTION_PLAN_UPDATED'));
});
