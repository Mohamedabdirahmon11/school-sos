import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261115150000_student_invoices.sql', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/schooladmin/StudentInvoicesView.tsx', import.meta.url), 'utf8');

const route = (method: string, path: string) => {
  const start = api.indexOf(`apiRouter.${method}('${path}'`);
  assert.notEqual(start, -1, `missing ${method.toUpperCase()} ${path}`);
  const nextRoute = api.indexOf('apiRouter.', start + 1);
  return api.slice(start, nextRoute === -1 ? undefined : nextRoute);
};

test('student invoice endpoints are authenticated, school-scoped and permission-gated', () => {
  for (const [method, path] of [
    ['get', '/student-invoices'],
    ['post', '/student-invoices/generate'],
    ['post', '/student-invoices/:id/pay'],
    ['get', '/student-invoices/:id/pdf']
  ]) {
    const source = route(method, path);
    assert.match(source, /requireAuth/);
    assert.match(source, /requireSchoolContext/);
  }
  assert.match(route('post', '/student-invoices/generate'), /requireSchoolAdminOrStaffPermission\('fees_manage'\)/);
  assert.match(route('post', '/student-invoices/:id/pay'), /requireSchoolAdminOrStaffPermission\('fees_manage'\)/);
  assert.match(route('get', '/student-invoices/:id/items'), /fees_manage/);
  assert.match(route('get', '/student-invoices/:id/pdf'), /fees_manage/);
  const listRoute = route('get', '/student-invoices');
  assert.match(listRoute, /user\.role === 'parent' \|\| user\.role === 'student'/);
  assert.match(listRoute, /query\.in\('student_id',linkedIds\)/);
});

test('invoice generation uses only active students and respects class/grade fee targeting', () => {
  const source = route('post', '/student-invoices/generate');
  assert.match(source, /student\.status==='active'/);
  assert.match(source, /item\.classId===student\.classId/);
  assert.match(source, /klass\.gradeLevel>=item\.minGrade&&klass\.gradeLevel<=item\.maxGrade/);
  assert.match(source, /includeAnnualRegistration/);
  assert.match(source, /includeOneTimeFees/);
  assert.match(source, /busAssignments\.find/);
  assert.match(source, /schoolos_create_student_invoice/);
  assert.match(source, /cadence:item\.cadence/);
  assert.doesNotMatch(source, /student_invoices'\)\.insert/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /previous_item\.cadence = 'one_time'/);
  assert.match(migration, /UNIQUE \(school_id, student_id, academic_year, billing_period\)/);
});

test('invoice payment uses an atomic database RPC and returns a linked receipt', () => {
  const source = route('post', '/student-invoices/:id/pay');
  assert.match(source, /schoolos_apply_student_invoice_payment/);
  assert.match(source, /confirmedReceived=req\.body\?\.confirmedReceived===true/);
  assert.match(source, /school must confirm that the payment was received/);
  assert.match(view, /Only use this form after the school has actually received the money/);
  assert.match(view, /I confirm that the school has received this payment or verified the transfer/);
  assert.doesNotMatch(view, /Stripe|PayPal|checkout session/i);
  assert.match(source, /p_idempotency_key:idempotencyKey/);
  assert.match(source, /STUDENT_INVOICE_PAYMENT_RECORDED/);
  assert.match(migration, /invoice_id VARCHAR\(64\)[\s\S]{0,100}REFERENCES student_invoices\(id\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.schoolos_apply_student_invoice_payment/);
  assert.match(migration, /AS \$\$[\s\S]*?END;\s+\$\$;/);
  assert.doesNotMatch(migration, /AS \$\s*DECLARE/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /p_payment_method IS NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schoolos_apply_student_invoice_payment[\s\S]{0,260}GRANT EXECUTE[\s\S]{0,180}TO service_role/);
});

test('invoice schema enforces tenant uniqueness, balanced totals and row-level security', () => {
  assert.match(migration, /UNIQUE \(school_id, invoice_number\)/);
  assert.match(migration, /UNIQUE \(school_id, student_id, academic_year, billing_period\)/);
  assert.match(migration, /CHECK \(total_amount = subtotal - discount_amount\)/);
  assert.match(migration, /CHECK \(balance_due = total_amount - amount_paid\)/);
  assert.match(migration, /ALTER TABLE student_invoices ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE student_invoice_items ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE student_invoices, student_invoice_items TO authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE student_invoices, student_invoice_items TO service_role/);
  assert.match(migration, /auth_school_id\(\)/);
  assert.match(migration, /auth_can_access_student\(invoice\.student_id\)/);
  assert.match(migration, /CREATE TRIGGER trg_sync_student_invoice_void/);
  assert.match(migration, /NEW\.invoice_id IS NOT NULL/);
});

test('invoice screen reuses a retry key after uncertain payment responses and exposes PDF receipts', () => {
  assert.match(view, /paymentKeyRef\.current \|\|=/);
  assert.match(view, /paymentKeyRef\.current = null/);
  assert.match(view, /ApiClient\.downloadReceiptPdf\(lastReceiptId\)/);
  assert.match(view, /ApiClient\.downloadStudentInvoicePdf\(invoice\.id\)/);
  assert.match(view, /type="month"/);
});

test('generated invoices include every applicable fee by default, including bus snapshots', () => {
  const source = route('post', '/student-invoices/generate');
  assert.match(source, /body\.includeAnnualRegistration!==false/);
  assert.match(source, /item\.cadence==='annual'&&body\.includeAnnualRegistration!==false/);
  assert.match(source, /body\.includeOneTimeFees!==false/);
  assert.match(source, /assignment\.studentId===student\.id&&assignment\.active/);
  assert.match(source, /fee_type:'bus',[\s\S]{0,180}unit_amount:Number\(bus\.feeAmount\)/);
  assert.doesNotMatch(view, /includeAnnualRegistration:|includeOneTimeFees:/);
  assert.doesNotMatch(view, /includeAnnual, setIncludeAnnual|includeOneTime, setIncludeOneTime/);
  assert.match(view, /saved bus fee for active bus assignments are included/);
});
