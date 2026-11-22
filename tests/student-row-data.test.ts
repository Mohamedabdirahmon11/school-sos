import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  normalizeStudentPhone,
  resolvePrimaryGuardianPhone,
  resolveStudentClassName,
  resolveStudentGender,
  resolveStudentParentPhone,
  resolveStudentStatus
} from '../src/lib/student-row-data.ts';

test('normalizes Ethiopian phone formats to +251', () => {
  assert.equal(normalizeStudentPhone('0912345678'), '+251912345678');
  assert.equal(normalizeStudentPhone('912345678'), '+251912345678');
  assert.equal(normalizeStudentPhone('251912345678'), '+251912345678');
  assert.equal(normalizeStudentPhone('+251 91 234 5678'), '+251912345678');
  assert.equal(normalizeStudentPhone('+252 61 2345678'), '+252612345678');
});

test('parent phone prefers father, then mother, then primary guardian', () => {
  assert.equal(resolveStudentParentPhone({ fatherPhone: '0912345678', motherPhone: '+251911111111' }, '+251922222222'), '+251912345678');
  assert.equal(resolveStudentParentPhone({ mother_phone: '0911111111' }, '+251922222222'), '+251911111111');
  assert.equal(resolveStudentParentPhone({}, '+251922222222'), '+251922222222');
  assert.equal(resolveStudentParentPhone({}), 'Phone not provided');
});

test('primary guardian phone prefers the explicitly primary link', () => {
  assert.equal(resolvePrimaryGuardianPhone([
    { is_primary: false, guardians: { phone: '+251900000001' } },
    { is_primary: true, guardians: { phone: '+251900000002' } }
  ]), '+251900000002');
});

test('gender and status have safe display defaults', () => {
  assert.equal(resolveStudentGender('male'), 'Male');
  assert.equal(resolveStudentGender('FEMALE'), 'Female');
  assert.equal(resolveStudentGender(null), '—');
  assert.equal(resolveStudentStatus('transferred'), 'transferred');
  assert.equal(resolveStudentStatus(''), 'active');
  assert.equal(resolveStudentStatus(undefined), 'active');
});

test('class label falls back to a same-school class record when supplied', () => {
  assert.equal(resolveStudentClassName({ classId: 'class-1', className: 'Not assigned' }, [
    { id: 'class-1', name: 'Grade 1', section: 'A' }
  ]), 'Grade 1 · A');
  assert.equal(resolveStudentClassName({ className: 'Grade 2 · B' }, []), 'Grade 2 · B');
  assert.equal(resolveStudentClassName({}, []), 'Not assigned');
});

test('student reconciliation migration is additive, tenant-scoped, and never overwrites existing enrollments', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261122062848_students_row_data_reconciliation.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER COLUMN status SET DEFAULT 'active'/);
  assert.match(migration, /JOIN current_year cy ON cy\.school_id = s\.school_id/);
  assert.match(migration, /e\.academic_year_id = cy\.academic_year_id/);
  assert.match(migration, /AND e\.school_id = s\.school_id/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+public\.(students|enrollments|fee_payments|student_invoices)\b/i);
});
