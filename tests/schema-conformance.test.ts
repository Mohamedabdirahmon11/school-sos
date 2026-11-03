import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mapStorageRowToDatabase } from '../src/server/storage.ts';

const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
const definitions = new Map<string, Map<string, { required: boolean; hasDefault: boolean }>>();
for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
  const columns = new Map<string, { required: boolean; hasDefault: boolean }>();
  for (const line of match[2].split('\n')) {
    const column = line.trim().match(/^([a-z][a-z0-9_]*)\s+([A-Z][A-Z0-9_]*(?:\([^)]*\))?(?:\[\])?)(.*)$/i);
    if (!column || ['CONSTRAINT', 'UNIQUE', 'CHECK', 'PRIMARY', 'FOREIGN'].includes(column[1].toUpperCase())) continue;
    const tail = column[3];
    columns.set(column[1], { required: /\bNOT NULL\b/i.test(tail) || /\bPRIMARY KEY\b/i.test(tail), hasDefault: /\bDEFAULT\b/i.test(tail) });
  }
  definitions.set(match[1], columns);
}

const fixtures: Array<[string, Record<string, unknown>]> = [
  ['users', { id: 'u1', schoolId: 's1', role: 'teacher', fullName: 'Test Teacher', email: 't@example.test', phone: '123', passwordHash: 'hash', pin: 'pin-hash', mustChangePassword: true, failedLoginAttempts: 0, isBlocked: false, assignedClassIds: [], assignedSubjectIds: [], linkedStudentIds: [] }],
  ['students', { id: 'st1', schoolId: 's1', studentId: 'STD-1', firstName: 'Test', middleName: 'A', lastName: 'Student', gender: 'female', admissionDate: '2026-09-01', fatherPhone: '', classId: 'c1', status: 'active', pinHash: 'pin-hash' }],
  ['teachers', { id: 't1', schoolId: 's1', userId: 'u1', fullName: 'Test Teacher', email: 't@example.test', phone: '123', gender: 'female', qualification: 'B.Ed', department: 'Science', assignedClasses: [], assignedSubjects: [], status: 'active', joinedDate: '2026-09-01', monthlySalary: 0 }],
  ['staff_members', { id: 'sm1', schoolId: 's1', userId: 'u1', fullName: 'Test Staff', roleTitle: 'Accountant', email: 'a@example.test', phone: '123', monthlySalary: 0, joinedDate: '2026-09-01', status: 'active', permissions: [] }],
  ['classes', { id: 'c1', schoolId: 's1', name: 'Grade 1', gradeLevel: 1, section: 'A', capacity: 40, monthlyFee: 0 }],
  ['subjects', { id: 'sb1', schoolId: 's1', name: 'Math', code: 'MATH1', creditUnits: 3, assignedTeacherIds: [] }],
  ['school_notices', { id: 'n1', schoolId: 's1', title: 'Notice', content: 'Text', audience: 'class', classId: 'c1', isActive: true, isPinned: false, publishDate: '2026-09-01', authorName: 'Admin', authorRole: 'school_admin' }],
  ['direct_messages', { id: 'm1', schoolId: 's1', senderId: 'u1', senderName: 'Teacher', senderRole: 'teacher', recipientId: 'u2', recipientName: 'Parent', recipientRole: 'parent', content: 'Hello', timestamp: '2026-09-01T00:00:00Z', isRead: false }],
  ['fee_payments', { id: 'p1', schoolId: 's1', studentId: 'st1', receiptNumber: 'R-1', academicYear: '2026', month: 'September', feeType: 'custom', feeStructureId: 'fs1', idempotencyKey: 'key-1', amountDue: 10, amountPaid: 10, remainingAmount: 0, paymentMethod: 'Cash', status: 'paid', date: '2026-09-01', recordedBy: 'u1' }],
  ['payroll_records', { id: 'pr1', schoolId: 's1', userId: 'u1', staffId: 't1', staffName: 'Test Staff', payrollMonth: '2026-11', baseSalary: 100, allowances: [], allowanceTotal: 0, deductions: [], deductionTotal: 0, netSalary: 100, status: 'draft', createdBy: 'u1' }]
];

test('domain write payloads map to real schema columns and satisfy required columns', () => {
  assert.ok(definitions.size > 20, 'schema tables parsed');
  for (const [table, appRow] of fixtures) {
    const columns = definitions.get(table);
    assert.ok(columns, `schema table ${table} exists`);
    const row = mapStorageRowToDatabase(table, appRow);
    for (const key of Object.keys(row)) assert.ok(columns!.has(key), `${table}.${key} is a schema column`);
    for (const [column, spec] of columns!) {
      if (spec.required && !spec.hasDefault) assert.ok(Object.hasOwn(row, column), `${table}.${column} required by schema`);
    }
  }
});

test('schema checks exercised by student, teacher, fee and messaging writes are represented', () => {
  assert.match(sql, /gender\s+VARCHAR\(10\)\s+NOT NULL\s+CHECK\s*\(gender IN \('male', 'female'\)\)/i);
  assert.match(sql, /payment_method\s+VARCHAR\(20\)\s+NOT NULL DEFAULT 'Cash' CHECK\s*\(payment_method = 'Cash'\)/i);
  assert.match(sql, /user_id VARCHAR\(64\) NOT NULL REFERENCES users\(id\)/i);
  assert.ok(definitions.has('payroll_records'), 'payroll persistence is represented in the schema');
  for (const [table, payload] of fixtures.filter(([name]) => ['students', 'teachers', 'staff_members'].includes(name))) {
    const mapped = mapStorageRowToDatabase(table, payload);
    const columns = definitions.get(table)!;
    for (const column of columns.keys()) {
      const spec = columns.get(column)!;
      if (spec.required && !spec.hasDefault) assert.ok(Object.hasOwn(mapped, column), `${table} insert includes required ${column}`);
    }
  }
  for (const [label, needle] of [
    ['student', "db.createStudent({ ...req.body"],
    ['teacher', "db.createTeacher({ ...req.body"],
    ['staff', "db.createStaffMember({ schoolId: school.id"]
  ]) assert.ok(apiSource.includes(needle), `${label} HTTP insert path is covered by schema mapping fixture`);
});

test('performance migration has scoped dashboard aggregates, execute grants, and idempotent filter indexes', () => {
  const migration = readFileSync(new URL('../supabase/migrations/002_performance_aggregates.sql', import.meta.url), 'utf8');
  for (const fragment of [
    'CREATE OR REPLACE FUNCTION school_dashboard_summary',
    'WHERE school_id = p_school_id',
    'CREATE OR REPLACE FUNCTION super_admin_dashboard_summary',
    'REVOKE ALL ON FUNCTION school_dashboard_summary(VARCHAR) FROM PUBLIC, anon, authenticated',
    'GRANT EXECUTE ON FUNCTION school_dashboard_summary(VARCHAR) TO service_role',
    'CREATE INDEX IF NOT EXISTS idx_messages_recipient',
    "NOTIFY pgrst, 'reload schema'"
  ]) assert.ok(migration.includes(fragment), `migration includes ${fragment}`);
  assert.match(sql, /CREATE OR REPLACE FUNCTION school_dashboard_summary/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION super_admin_dashboard_summary/);
});

test('custom fee payment links and school retry keys are additive in migration 009', () => {
  const migration = readFileSync(new URL('../supabase/migrations/009_fee_structure_payment_links.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS fee_structure_id/i);
  assert.match(sql, /ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS idempotency_key/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payment_school_idempotency/i);
  for (const fragment of ['ADD COLUMN IF NOT EXISTS fee_structure_id', 'ADD COLUMN IF NOT EXISTS idempotency_key', 'CREATE UNIQUE INDEX IF NOT EXISTS uq_fee_payment_school_idempotency', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt', "NOTIFY pgrst, 'reload schema'"]) assert.ok(migration.includes(fragment), `migration 009 includes ${fragment}`);
  assert.match(migration, /ON fee_payments\(school_id, idempotency_key\)/);
});

test('payroll records enforce one staff payroll per school and month with scoped RLS', () => {
  const migration = readFileSync(new URL('../supabase/migrations/010_accountant_payroll.sql', import.meta.url), 'utf8');
  const columns = definitions.get('payroll_records');
  assert.ok(columns?.has('allowance_total') && columns.has('deduction_total') && columns.has('status'));
  assert.match(migration, /CREATE TABLE IF NOT EXISTS payroll_records/);
  assert.match(migration, /UNIQUE \(school_id,user_id,payroll_month\)/);
  assert.match(migration, /payroll_records_role_read/);
  assert.match(migration, /payroll_records_accountant_insert/);
  assert.match(migration, /payroll_records_accountant_update/);
  assert.match(migration, /ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY/);
});

test('notice class audiences and archive state are additive in migration 011', () => {
  const migration = readFileSync(new URL('../supabase/migrations/011_notice_audiences_archive.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS class_id/i);
  assert.match(sql, /ALTER TABLE school_notices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS class_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_notices_active_audience/);
  const mapped = mapStorageRowToDatabase('school_notices', fixtures.find(([table]) => table === 'school_notices')![1]);
  assert.equal(mapped.class_id, 'c1');
  assert.equal(mapped.is_active, true);
});

test('notice read receipts use school-scoped unique keys and self-only RLS', () => {
  const migration = readFileSync(new URL('../supabase/migrations/012_notice_read_receipts.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS notice_reads/);
  assert.match(sql, /UNIQUE \(school_id, notice_id, user_id\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notice_reads/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_notice_reads_user/);
  assert.match(migration, /notice_reads_self_scope/);
  assert.match(migration, /notice_reads_self_insert/);
  assert.match(sql, /user_id = auth_user_id\(\)/);
});

test('paged-list projections contain only columns that exist in schema.sql', () => {
  const block = apiSource.match(/const LIST_QUERY_COLUMNS: Record<string, string> = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'list projection map exists');
  const entries = [...block![1].matchAll(/([a-z_]+): '([^']+)'/g)];
  assert.ok(entries.length >= 10, 'list projections are registered');
  for (const [, table, selection] of entries) {
    const columns = definitions.get(table);
    assert.ok(columns, `schema table ${table} exists`);
    for (const column of selection.split(',')) assert.ok(columns!.has(column), `${table}.${column} exists in schema`);
  }
});

test('student list route applies role scope in its single paged query', () => {
  const route = apiSource.match(/apiRouter\.get\('\/students',[\s\S]*?\n\}\);/);
  assert.ok(route, 'students list route exists');
  assert.equal((route![0].match(/db\.queryPage\('students'/g) || []).length, 1);
  assert.equal(route![0].includes('db.getStudents('), false, 'role scoping does not hydrate the full student list');
});

test('fee receipt numbers use a database-atomic per-school academic-year sequence', () => {
  const migration = readFileSync(new URL('../supabase/migrations/026_fee_receipt_sequences.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.fee_receipt_sequences/);
  assert.match(migration, /UNIQUE \(school_id, academic_year\)/);
  assert.match(migration, /ON CONFLICT \(school_id, academic_year\)/);
  assert.match(migration, /CREATE POLICY fee_receipt_sequences_deny_client/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.schoolos_next_fee_receipt/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.schoolos_next_fee_receipt[^;]+TO service_role/);
});
