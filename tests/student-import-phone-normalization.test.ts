import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IMPORT_COLUMNS, parseSchoolImport, validImportPhone } from '../src/server/school-import.ts';

test('CSV import removes spreadsheet apostrophe markers from guardian phone fields', () => {
  const values: Record<string, string> = {
    className: 'Grade 1',
    section: 'A',
    studentName: 'Abdi Hassan',
    gender: 'male',
    parentName: 'Parent Name',
    parentPhone: "'+251911000001",
    fatherPhone: "'+251911000001",
    motherName: 'Mother Name',
    motherPhone: "'+251911000002"
  };
  const csv = [
    IMPORT_COLUMNS.join(','),
    IMPORT_COLUMNS.map(column => JSON.stringify(values[column] || '')).join(',')
  ].join('\n');
  const [row] = parseSchoolImport(Buffer.from(csv, 'utf8'), 'csv');
  assert.equal(row.parentPhone, '+251911000001');
  assert.equal(row.fatherPhone, '+251911000001');
  assert.equal(row.motherPhone, '+251911000002');
  assert.equal(validImportPhone(row.parentPhone), true);
  assert.equal(validImportPhone(row.fatherPhone), true);
  assert.equal(validImportPhone(row.motherPhone), true);
});

test('XLSX import normalizes apostrophe-prefixed phone cells as well', () => {
  const csv = [
    IMPORT_COLUMNS.join(','),
    IMPORT_COLUMNS.map(column => JSON.stringify(column === 'studentPhone' ? "'+251911000003" : '')).join(',')
  ].join('\n');
  const [row] = parseSchoolImport(Buffer.from(csv, 'utf8'), 'csv');
  assert.equal(row.studentPhone, '+251911000003');
});

test('international phone validation accepts text markers and rejects malformed values', () => {
  assert.equal(validImportPhone('+251911000001'), true);
  assert.equal(validImportPhone("' +251911000001"), true);
  assert.equal(validImportPhone('’+251911000001'), true);
  assert.equal(validImportPhone('not-a-phone'), false);
});
