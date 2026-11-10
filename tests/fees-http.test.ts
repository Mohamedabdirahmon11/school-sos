import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import { InMemorySupabase } from './support/in-memory-supabase.ts';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = randomBytes(48).toString('hex');
process.env.SUPER_ADMIN_EMAIL = 'fee-test-admin@example.test';
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');

const memory = new InMemorySupabase();
memory.supportsSeparateAuthQueries = true;
const storage = await import('../src/server/storage.ts');
const auth = await import('../src/server/auth-security.ts');
storage.installTestSupabaseClient(memory);
await storage.initializeStorage();

const today = new Date().toISOString().slice(0, 10);
const school = storage.db.createSchool({
  name: 'Fee HTTP Test School', code: 'FEEHTTP', address: '', city: '', phone: '', email: 'fee-school@example.test',
  currency: 'USD', academicYear: '2026-2027', currentSemester: 'Semester 1', defaultClassCapacity: 30,
  studentAccessEnabled: false,
  subscription: { plan: 'basic', cadence: 'yearly', status: 'active', startDate: today, validUntil: '2099-12-31', graceDays: 7, pricePaid: 0, autoRenew: false }
} as any);
const admin = storage.db.createUser({ schoolId: school.id, role: 'super_admin', permissions: ['fees_manage'], fullName: 'Fee Test Accountant', email: 'fee-accountant@example.test', passwordHash: '', isBlocked: false } as any);
await memory.from('staff_members').insert([{ id: 'fee-test-staff', schoolId: school.id, staffId: 'FEEHTTP-STAFF', fullName: admin.fullName, roleTitle: 'Accountant', email: admin.email!, phone: '', monthlySalary: 0, permissions: ['fees_manage'], status: 'active', userId: admin.id }]);
const gradeTwo = storage.db.createClass({ schoolId: school.id, name: 'Grade 2', gradeLevel: 2, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
const gradeOne = storage.db.createClass({ schoolId: school.id, name: 'Grade 1', gradeLevel: 1, section: 'A', roomNumber: '', capacity: 30, monthlyFee: 0 });
const partialStudent = storage.db.createStudent({ schoolId: school.id, studentId: 'FEEHTTP-1', firstName: 'Partial', middleName: '', lastName: 'Pupil', gender: 'female', admissionDate: today, fatherPhone: '', classId: gradeTwo.id, status: 'active' } as any);
const unpaidStudent = storage.db.createStudent({ schoolId: school.id, studentId: 'FEEHTTP-2', firstName: 'Unpaid', middleName: '', lastName: 'Pupil', gender: 'male', admissionDate: today, fatherPhone: '', classId: gradeOne.id, status: 'active' } as any);
storage.db.createFeeStructure({ schoolId: school.id, feeType: 'monthly_tuition', name: 'Grade 2 tuition range', minGrade: 2, maxGrade: 3, amount: 120, cadence: 'monthly', isActive: true });
storage.db.createFeeStructure({ schoolId: school.id, feeType: 'monthly_tuition', name: 'Grade 1 tuition range', minGrade: 1, maxGrade: 1, amount: 80, cadence: 'monthly', isActive: true });
storage.db.createFeeStructure({ schoolId: school.id, feeType: 'annual_registration', name: 'Annual registration', amount: 50, cadence: 'annual', isActive: true });
const route = await storage.db.addTransportRoute({ schoolId: school.id, name: 'North Route', feeAmount: 25, active: true });
await storage.db.flush();
const persistedStudent = await storage.db.getStudentById(partialStudent.id, school.id);
assert.ok(persistedStudent, 'the created student must be readable from the test database');
assert.equal(persistedStudent?.schoolId, school.id);
const persistedRoutes = await storage.db.getTransportRoutes(school.id);
assert.ok(persistedRoutes.some(item => item.id === route.id && item.schoolId === school.id && item.active !== false),
  `the created transport route must be readable from the test database: ${JSON.stringify(persistedRoutes)}`);
await storage.db.setBusAssignment(school.id, partialStudent.id, route.id);
await storage.db.flush();

const app = express();
app.use(express.json());
app.use(cookieParser());
const { apiRouter } = await import('../src/server/api.ts');
app.use('/api', apiRouter);
const server = app.listen(0);
await new Promise<void>(resolve => server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Fee HTTP test server did not bind to TCP.');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
const token = auth.createSignedSessionToken({ sessionId: 'fee-test-session', userId: admin.id, role: 'super_admin', schoolId: school.id, createdAt: Date.now(), expiresAt: Date.now() + 60_000 });
memory.rows('user_sessions').push({ id: 'fee-test-session', userId: admin.id, userRole: 'super_admin', schoolId: school.id, ipAddress: '127.0.0.1', userAgent: 'fee-test', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), lastActivityAt: new Date().toISOString() });
const headers = { Cookie: `schoolos_session=${token}`, 'Content-Type': 'application/json' };
assert.ok(memory.rows('users').some(user => user.id === admin.id));
assert.ok(memory.rows('user_sessions').some(session => session.id === 'fee-test-session'));

after(async () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('fee HTTP routes apply grade rates, bus and annual rules, status, receipts and reports', async () => {
  const postPayment = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${baseUrl}/fees/pay-cash`, { method: 'POST', headers, body: JSON.stringify(payload) });
    return { response, body: await response.json() };
  };
  const invalidStructure = await fetch(`${baseUrl}/fees/structures`, { method: 'POST', headers, body: JSON.stringify({ name: 'Invalid grades', feeType: 'custom', minGrade: 13, maxGrade: 14, amount: 10, cadence: 'one_time', isActive: true }) });
  assert.equal(invalidStructure.status, 400);
  const oversizedStructure = await fetch(`${baseUrl}/fees/structures`, { method: 'POST', headers, body: JSON.stringify({ name: 'Oversized amount', feeType: 'custom', amount: 10000000000, cadence: 'one_time', isActive: true }) });
  assert.equal(oversizedStructure.status, 400);
  const structureResponse = await fetch(`${baseUrl}/fees/structures`, { method: 'POST', headers, body: JSON.stringify({ name: 'Science activity', feeType: 'custom', amount: 35, cadence: 'one_time', isActive: true }) });
  assert.equal(structureResponse.status, 201);
  const activityFee = await structureResponse.json() as any;
  const loadedFeeStructures = await storage.db.getFeeStructures(school.id);
  assert.ok(loadedFeeStructures.some(item => item.id === activityFee.id),
    `new fee structure must be visible to the next request; response=${JSON.stringify(activityFee)}, loaded=${JSON.stringify(loadedFeeStructures)}, raw=${JSON.stringify(memory.rows('fee_structures'))}`);
  const tamperedStructure = await fetch(`${baseUrl}/fees/structures/${activityFee.id}`, {
    method: 'PUT', headers, body: JSON.stringify({ id: 'forged-id', schoolId: 'another-school', amount: 35 })
  });
  const tamperedBody = await tamperedStructure.text();
  assert.equal(tamperedStructure.status, 200, tamperedBody);
  const protectedStructure = JSON.parse(tamperedBody) as any;
  assert.equal(protectedStructure.id, activityFee.id, 'fee structure ID cannot be overwritten');
  assert.equal(protectedStructure.schoolId, school.id, 'fee structure tenant cannot be overwritten');
  assert.equal(protectedStructure.amount, 35);

  const partialPayload = { studentId: partialStudent.id, academicYear: '2026-2027', month: 'October 2026', feeType: 'monthly_tuition', amountDue: 1, amountPaid: 30, idempotencyKey: 'fee-test-payment-retry-1' };
  const partial = await postPayment(partialPayload);
  assert.equal(partial.response.status, 201, JSON.stringify(partial.body));
  assert.equal(partial.body.amountDue, 120);
  assert.equal(partial.body.status, 'partial');
  assert.equal(partial.body.remainingAmount, 90);
  assert.match(partial.body.receiptNumber, /^REC-FEEHTTP-2026-\d{4}$/);
  const partialRetry = await postPayment(partialPayload);
  assert.equal(partialRetry.response.status, 201);
  assert.equal(partialRetry.body.id, partial.body.id);
  assert.equal(partialRetry.body.amountPaid, 30);
  const [installmentA, installmentB] = await Promise.all([
    postPayment({ ...partialPayload, amountPaid: 20, idempotencyKey: 'fee-test-installment-a' }),
    postPayment({ ...partialPayload, amountPaid: 15, idempotencyKey: 'fee-test-installment-b' })
  ]);
  assert.equal(installmentA.response.status, 201);
  assert.equal(installmentB.response.status, 201);
  assert.equal(installmentA.body.id, partial.body.id);
  assert.equal(installmentB.body.id, partial.body.id);
  assert.equal(installmentB.body.amountPaid, 65, 'parallel distinct installments must both be applied');
  const installmentRetry = await postPayment({ ...partialPayload, amountPaid: 15, idempotencyKey: 'fee-test-installment-b' });
  assert.equal(installmentRetry.body.amountPaid, 65, 'retries must not apply an installment twice');

  const unpaid = await postPayment({ studentId: unpaidStudent.id, academicYear: '2026-2027', month: 'October 2026', feeType: 'monthly_tuition', amountDue: 1, amountPaid: 0 });
  assert.equal(unpaid.response.status, 201);
  assert.equal(unpaid.body.amountDue, 80);
  assert.equal(unpaid.body.status, 'unpaid');

  const bus = await postPayment({ studentId: partialStudent.id, academicYear: '2026-2027', month: 'October 2026', feeType: 'bus', amountDue: 99, amountPaid: 25 });
  assert.equal(bus.response.status, 201);
  assert.equal(bus.body.amountDue, 25);
  assert.equal(bus.body.status, 'paid');

  const registrationPart = await postPayment({ studentId: partialStudent.id, academicYear: '2026-2027', month: '2026-2027', feeType: 'annual_registration', amountDue: 50, amountPaid: 20 });
  assert.equal(registrationPart.response.status, 201);
  assert.equal(registrationPart.body.amountDue, 50);
  assert.equal(registrationPart.body.status, 'partial');
  const registrationPayload = { studentId: partialStudent.id, academicYear: '2026-2027', month: '2026-2027', feeType: 'annual_registration', amountDue: 50, amountPaid: 30, idempotencyKey: 'fee-test-registration-retry-1' };
  const registrationPaid = await postPayment(registrationPayload);
  assert.equal(registrationPaid.response.status, 201);
  assert.equal(registrationPaid.body.id, registrationPart.body.id);
  assert.equal(registrationPaid.body.receiptNumber, registrationPart.body.receiptNumber);
  assert.equal(registrationPaid.body.status, 'paid');
  assert.equal(registrationPaid.body.remainingAmount, 0);
  const registrationRetry = await postPayment(registrationPayload);
  assert.equal(registrationRetry.body.amountPaid, 50);
  const duplicateRegistration = await postPayment({ studentId: partialStudent.id, academicYear: '2026-2027', month: '2026-2027', feeType: 'annual_registration', amountDue: 50, amountPaid: 1 });
  assert.equal(duplicateRegistration.response.status, 400);
  assert.match(duplicateRegistration.body.error, /already (?:fully )?paid/i);

  const customPayload = { studentId: partialStudent.id, academicYear: '2026-2027', month: '2026-2027', feeType: 'custom', feeStructureId: activityFee.id, amountDue: 1, amountPaid: 10, idempotencyKey: 'fee-test-custom-concurrent-1' };
  const [customFirst, customRetry] = await Promise.all([postPayment(customPayload), postPayment(customPayload)]);
  assert.equal(customFirst.response.status, 201, JSON.stringify(customFirst.body));
  assert.equal(customRetry.response.status, 201, JSON.stringify(customRetry.body));
  assert.equal(customFirst.body.id, customRetry.body.id, 'parallel retries share one payment');
  assert.equal(customFirst.body.amountDue, 35, 'custom fee rate comes from its configured structure');
  assert.equal(customFirst.body.feeStructureId, activityFee.id);
  assert.equal(customFirst.body.idempotencyKey, customPayload.idempotencyKey);
  const customReceiptPdf = await fetch(`${baseUrl}/fees/payments/${customFirst.body.id}/receipt.pdf`, { headers });
  assert.equal(customReceiptPdf.status, 200);
  assert.equal(customReceiptPdf.headers.get('content-type'), 'application/pdf');
  assert.ok(Buffer.from(await customReceiptPdf.arrayBuffer()).toString('latin1').includes('Science activity'));
  const deleteReferencedFee = await fetch(`${baseUrl}/fees/structures/${activityFee.id}`, { method: 'DELETE', headers });
  assert.equal(deleteReferencedFee.status, 409, 'fee structures used by historical payments must be retained');
  const [parallelReceiptA, parallelReceiptB] = await Promise.all([
    postPayment({ studentId: unpaidStudent.id, academicYear: '2026-2027', month: 'November 2026', feeType: 'monthly_tuition', amountDue: 80, amountPaid: 5, idempotencyKey: 'fee-test-parallel-a' }),
    postPayment({ studentId: unpaidStudent.id, academicYear: '2026-2027', month: 'December 2026', feeType: 'monthly_tuition', amountDue: 80, amountPaid: 7, idempotencyKey: 'fee-test-parallel-b' })
  ]);
  assert.equal(parallelReceiptA.response.status, 201);
  assert.equal(parallelReceiptB.response.status, 201);
  assert.notEqual(parallelReceiptA.body.receiptNumber, parallelReceiptB.body.receiptNumber, `parallel payments receive unique receipts; sequences=${JSON.stringify(memory.rows('fee_receipt_sequences'))}; payments=${JSON.stringify([parallelReceiptA.body, parallelReceiptB.body])}`);
  const invalidCustom = await postPayment({ ...customPayload, idempotencyKey: 'fee-test-custom-invalid-1', feeStructureId: 'fee-from-another-school' });
  assert.equal(invalidCustom.response.status, 400);
  assert.match(invalidCustom.body.error, /active custom fee/i);

  const voidResponse = await fetch(`${baseUrl}/fees/payments/${partial.body.id}/void`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Cash entered against wrong student' }) });
  assert.equal(voidResponse.status, 200);
  const voided = await voidResponse.json() as any;
  assert.equal(voided.voidReason, 'Cash entered against wrong student');
  assert.ok(memory.rows('fee_payments').find(row => row.id === partial.body.id)?.voided_at,
    'voided receipt state must be persisted before the HTTP response completes');
  assert.equal((await fetch(`${baseUrl}/fees/payments/${partial.body.id}/void`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Trying a second reversal' }) })).status, 409);
  const concurrentVoids = await Promise.all([
    fetch(`${baseUrl}/fees/payments/${bus.body.id}/void`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Duplicate reversal attempt A' }) }),
    fetch(`${baseUrl}/fees/payments/${bus.body.id}/void`, { method: 'POST', headers, body: JSON.stringify({ reason: 'Duplicate reversal attempt B' }) })
  ]);
  assert.deepEqual(concurrentVoids.map(response => response.status).sort(), [200, 409],
    'only one concurrent request may void the same receipt');
  const invalidVoid = await fetch(`${baseUrl}/fees/payments/${unpaid.body.id}/void`, { method: 'POST', headers, body: JSON.stringify({ reason: 'no' }) });
  assert.equal(invalidVoid.status, 400);

  const paymentRows = memory.rows('fee_payments').filter(row => row.school_id === school.id);
  assert.equal(paymentRows.length, 7);
  assert.equal(new Set(paymentRows.map(row => row.receipt_number)).size, 7);

  const arrearsResponse = await fetch(`${baseUrl}/fees/arrears`, { headers });
  assert.equal(arrearsResponse.status, 200);
  const arrears = await arrearsResponse.json();
  assert.deepEqual(arrears.map((row: any) => row.student.id).sort(), [partialStudent.id, unpaidStudent.id].sort());

  const invalidIncomeDate = await fetch(`${baseUrl}/fees/daily-income?date=not-a-date`, { headers });
  assert.equal(invalidIncomeDate.status, 400);
  const incomeResponse = await fetch(`${baseUrl}/fees/daily-income?date=${today}`, { headers });
  assert.equal(incomeResponse.status, 200);
  const income = await incomeResponse.json();
  assert.equal(income.paymentCount, 4, 'zero-cash and voided receipts are not counted as daily collections');
  assert.ok(income.payments.every((payment: any) => payment.amountPaid > 0 && !payment.voidedAt));
  assert.equal(income.totalCollected, 72);
});

test('bank statement CSV import is atomic, school-scoped, and skips exact duplicates', async () => {
  const rows = [
    { statementDate: today, description: 'Imported tuition deposit', direction: 'credit', amount: 125.5, reference: 'CSV-IMPORT-1', bankAccountLabel: 'Main account' },
    { statementDate: today, description: 'Imported electricity debit', direction: 'debit', amount: 40, reference: 'CSV-IMPORT-2', bankAccountLabel: 'Main account' }
  ];
  const first = await fetch(`${baseUrl}/bank-reconciliation/import`, { method: 'POST', headers, body: JSON.stringify({ rows }) });
  assert.equal(first.status, 201);
  const firstBody = await first.json() as any;
  assert.equal(firstBody.createdCount, 2);
  assert.equal(firstBody.skippedDuplicates, 0);
  assert.ok(firstBody.entries.every((entry: any) => entry.schoolId === school.id));
  const stored = memory.rows('bank_statement_entries').filter(row => row.school_id === school.id);
  assert.equal(stored.length, 2);
  assert.ok(stored.every(row => row.created_by === admin.id));

  const retry = await fetch(`${baseUrl}/bank-reconciliation/import`, { method: 'POST', headers, body: JSON.stringify({ rows }) });
  assert.equal(retry.status, 201);
  const retryBody = await retry.json() as any;
  assert.equal(retryBody.createdCount, 0);
  assert.equal(retryBody.skippedDuplicates, 2);
  assert.equal(memory.rows('bank_statement_entries').filter(row => row.school_id === school.id).length, 2);

  const invalid = await fetch(`${baseUrl}/bank-reconciliation/import`, {
    method: 'POST', headers, body: JSON.stringify({ rows: [{ ...rows[0], statementDate: 'not-a-date' }] })
  });
  assert.equal(invalid.status, 400);
  assert.equal(memory.rows('bank_statement_entries').filter(row => row.school_id === school.id).length, 2,
    'invalid batches must not write partial data');
});

test('bank reconciliation supports split allocations and prevents over-allocation', async () => {
  const createPayment = async (month: string, paid: number) => {
    const response = await fetch(`${baseUrl}/fees/pay-cash`, {
      method: 'POST', headers,
      body: JSON.stringify({
        studentId: partialStudent.id, academicYear: '2026-2027', month, feeType: 'monthly_tuition',
        amountDue: 120, amountPaid: paid, paymentMethod: 'Bank Transfer',
        idempotencyKey: `split-settlement-${month.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      })
    });
    assert.equal(response.status, 201);
    return response.json() as Promise<any>;
  };
  const [receiptA, receiptB, receiptC, receiptD] = await Promise.all([
    createPayment('Split test A', 20), createPayment('Split test B', 30), createPayment('Split test C', 40), createPayment('Split test D', 5)
  ]);
  const createStatement = async (amount: number, reference: string) => {
    const response = await fetch(`${baseUrl}/bank-reconciliation`, {
      method: 'POST', headers,
      body: JSON.stringify({ statementDate: today, description: `Split settlement ${reference}`, direction: 'credit', amount, reference })
    });
    assert.equal(response.status, 201);
    return response.json() as Promise<any>;
  };
  const allocate = (entryId: string, paymentId: string, amount: number) =>
    fetch(`${baseUrl}/bank-reconciliation/${encodeURIComponent(entryId)}/allocations`, {
      method: 'POST', headers, body: JSON.stringify({ paymentId, amount })
    });

  const storedReceiptA = memory.rows('fee_payments').find(row => row.id === receiptA.id);
  assert.ok(storedReceiptA, 'split settlement receipt must be stored');
  assert.equal(storedReceiptA.payment_method ?? storedReceiptA.paymentMethod, 'Bank Transfer');
  const combinedLine = await createStatement(50, 'SPLIT-COMBINED');
  const storedStatement = memory.rows('bank_statement_entries').find(row => String(row.id) === String(combinedLine.id));
  assert.ok(storedStatement, `statement line must be stored: ${JSON.stringify({ combinedLine, stored: memory.rows('bank_statement_entries') })}`);
  assert.equal(storedStatement.school_id ?? storedStatement.schoolId, school.id, JSON.stringify(storedStatement));
  const firstAllocation = await allocate(combinedLine.id, receiptA.id, 20);
  const firstAllocationBody = await firstAllocation.clone().json();
  assert.equal(firstAllocation.status, 201, JSON.stringify(firstAllocationBody));
  const secondAllocation = await allocate(combinedLine.id, receiptB.id, 30);
  assert.equal(secondAllocation.status, 201);

  const splitLineA = await createStatement(15, 'SPLIT-PART-A');
  const splitLineB = await createStatement(25, 'SPLIT-PART-B');
  assert.equal((await allocate(splitLineA.id, receiptC.id, 15)).status, 201);
  assert.equal((await allocate(splitLineB.id, receiptC.id, 25)).status, 201);

  const extraLine = await createStatement(5, 'SPLIT-OVER-RECEIPT');
  const tooMuch = await allocate(extraLine.id, receiptC.id, 0.01);
  assert.equal(tooMuch.status, 409, 'a receipt cannot be allocated beyond its paid amount');
  const tooMuchForLine = await allocate(splitLineA.id, receiptD.id, 0.01);
  assert.equal(tooMuchForLine.status, 409, 'a statement line cannot be allocated beyond its value');

  const reconciliation = await fetch(`${baseUrl}/bank-reconciliation`, { headers });
  assert.equal(reconciliation.status, 200);
  const body = await reconciliation.json() as any;
  const combined = body.entries.find((entry: any) => entry.id === combinedLine.id);
  assert.equal(combined.allocatedAmount, 50);
  assert.equal(combined.remainingStatementAmount, 0);
  assert.equal(combined.isFullyMatched, true);
  assert.equal(combined.allocations.length, 2);
  const splitA = body.entries.find((entry: any) => entry.id === splitLineA.id);
  assert.equal(splitA.allocatedAmount, 15);
  assert.equal(splitA.isFullyMatched, true);
  assert.ok(!body.unmatchedPayments.some((payment: any) => [receiptA.id, receiptB.id, receiptC.id].includes(payment.id)));
  assert.ok(memory.rows('bank_statement_allocations').every(row => row.school_id === school.id));
  await assert.rejects(
    storage.db.voidFeePayment(receiptA.id, school.id, admin.id, 'Receipt already reconciled'),
    /reconciled to a bank statement/i,
    'a reconciled fee receipt must not be voidable'
  );
});
