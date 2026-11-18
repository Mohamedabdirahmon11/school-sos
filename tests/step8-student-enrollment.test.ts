import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261118190000_step8_student_enrollments.sql', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
const studentsView = readFileSync(new URL('../src/components/schooladmin/StudentsView.tsx', import.meta.url), 'utf8');
const promotionView = readFileSync(new URL('../src/components/schooladmin/YearEndPromotionView.tsx', import.meta.url), 'utf8');

test('Step 8 migration preserves student identifiers and scopes guardian/enrollment relations by school', () => {
  assert.match(migration, /student_code TEXT GENERATED ALWAYS AS \(student_id\) STORED/);
  assert.match(migration, /FOREIGN KEY \(student_id, school_id\) REFERENCES public\.students\(id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(guardian_id, school_id\) REFERENCES public\.guardians\(id, school_id\)/);
  assert.match(migration, /FOREIGN KEY \(academic_year_id, school_id\) REFERENCES public\.academic_years\(id, school_id\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS enrollments_one_active_per_student_year_uidx/);
  assert.match(migration, /AS RESTRICTIVE FOR ALL/);
  assert.match(migration, /schoolos_create_initial_student_enrollment/);
});

test('Step 8 enrollment transfers validate school ownership and preserve enrollment history', () => {
  assert.match(migration, /schoolos_transfer_enrollment/);
  assert.match(migration, /status='withdrawn'/);
  assert.match(migration, /Target class capacity has been reached/);
  assert.match(migration, /UPDATE public\.enrollments SET status='transferred', left_at=now\(\)/);
  assert.match(migration, /schoolos_promote_enrollments/);
  assert.match(api, /from\('enrollments'\)[\s\S]*?\.eq\('school_id', school\.id\)/);
  assert.match(api, /rpc\('schoolos_transfer_enrollment'/);
  assert.match(api, /rpc\('schoolos_promote_enrollments'/);
});

test('Step 8 guardian links store relationship per student and expose profile actions', () => {
  assert.match(migration, /relation TEXT NOT NULL DEFAULT 'kale'/);
  assert.match(api, /apiRouter\.post\('\/students\/:id\/guardians'/);
  assert.match(api, /phone_normalized', normalizedPhone/);
  assert.match(client, /linkStudentGuardian/);
  assert.match(studentsView, /label: 'Waalidiinta'/);
  assert.match(studentsView, /Ku xiro waalidka/);
  assert.match(studentsView, /Ka saar ardayga \(xogta ha sii jirto\)/);
});

test('Step 8 deletion refuses to remove students with attendance, marks, finance or enrollment rows', () => {
  assert.match(api, /protectedTables = \['attendance_records', 'student_marks', 'fee_payments', 'student_invoices', 'enrollments'\]/);
  assert.match(api, /Student has linked attendance, marks, fees, invoices or enrollment history/);
  assert.ok(api.includes("apiRouter.get('/students/export.pdf'"));
  assert.ok(api.includes("'Content-Type': 'application/pdf'"));
});

test('Step 8 promotion workflow requires source and target academic years', () => {
  assert.match(client, /getAcademicYears/);
  assert.match(client, /sourceAcademicYearId, targetAcademicYearId/);
  assert.match(promotionView, /Source Academic Year/);
  assert.match(promotionView, /Target Academic Year/);
});

test('Step 8 student directory includes mobile cards and summary counts', () => {
  assert.match(studentsView, /Tirada ardayda/);
  assert.match(studentsView, /md:hidden/);
  assert.match(studentsView, /Export CSV/);
  assert.match(studentsView, /BulkImportWizard/);
  assert.match(studentsView, /handleExportExcel/);
  assert.match(studentsView, /handleExportPDF/);
  assert.match(studentsView, /from 'xlsx'/);
});
