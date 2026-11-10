import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANK_STATEMENT_CSV_TEMPLATE, parseBankStatementCsv } from '../src/lib/bank-statement-csv.ts';

test('parses quoted CSV values and preserves comma-containing descriptions', () => {
  const result = parseBankStatementCsv('date,description,direction,amount,reference\n2026-11-01,"Tuition, Grade 4",credit,"1,250.50",R-1');
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.rows, [{ statementDate: '2026-11-01', description: 'Tuition, Grade 4', direction: 'credit', amount: 1250.5, reference: 'R-1' }]);
});

test('supports day-first dates, debit signs, and separate credit/debit columns', () => {
  const result = parseBankStatementCsv('date,description,amount\n02/11/2026,Power,-320\n03/11/2026,Fees,100');
  assert.deepEqual(result.rows.map(row => [row.statementDate, row.direction, row.amount]), [['2026-11-02', 'debit', 320], ['2026-11-03', 'credit', 100]]);
});

test('reports invalid rows and missing headers without creating data', () => {
  const invalid = parseBankStatementCsv('date,description,amount\nnot-a-date,Power,0');
  assert.equal(invalid.rows.length, 0);
  assert.equal(invalid.issues[0]?.line, 2);
  assert.match(parseBankStatementCsv('name,amount\nA,2').issues[0]?.message || '', /Missing required/);
});

test('provides a usable import template', () => {
  assert.match(BANK_STATEMENT_CSV_TEMPLATE, /date,description,direction,amount,reference,account/);
});
