import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { IMPORT_COLUMNS, parseSchoolImport, validImportPhone } from '../src/server/school-import.ts';

test('CSV import normalizes spreadsheet apostrophe markers in guardian phone', () => {
  const values: Record<string, string> = {
    className: 'Grade 1', section: 'A', studentName: 'Abdi Hassan Ali', gender: 'male',
    admissionDate: '2026-11-14', address: 'Jijiga', parentName: 'Parent Name',
    parentPhone: "'+251911000001", studentPhone: "'+251911000002"
  };
  const csv = [IMPORT_COLUMNS.join(','), IMPORT_COLUMNS.map(column => JSON.stringify(values[column] || '')).join(',')].join('\\n');
  const [row] = parseSchoolImport(Buffer.from(csv, 'utf8'), 'csv');
  assert.equal(row.parentPhone, '+251911000001');
  assert.equal(row.studentPhone, '+251911000002');
  assert.equal(validImportPhone(row.parentPhone), true);
  assert.equal(validImportPhone(row.studentPhone), true);
});

test('XLSX import normalizes apostrophe-prefixed guardian phone cells', () => {
  const values = Object.fromEntries(IMPORT_COLUMNS.map(column => [column, column === 'parentPhone' ? "'+251911000003" : column === 'studentName' ? 'Abdi Hassan Ali' : column === 'gender' ? 'male' : column === 'className' ? 'Grade 1' : column === 'section' ? 'A' : column === 'admissionDate' ? '2026-11-14' : '']));
  const sheet = XLSX.utils.json_to_sheet([values]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const [row] = parseSchoolImport(buffer, 'xlsx');
  assert.equal(row.parentPhone, '+251911000003');
});

test('international phone validation accepts text markers and rejects malformed values', () => {
  assert.equal(validImportPhone('+251911000001'), true);
  assert.equal(validImportPhone("' +251911000001"), true);
  assert.equal(validImportPhone('’+251911000001'), true);
  assert.equal(validImportPhone('not-a-phone'), false);
});
