import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { IMPORT_COLUMNS, parseSchoolImport } from '../src/server/school-import.ts';

test('student import columns match registration and omit DOB/status/reason', () => {
  assert.deepEqual(IMPORT_COLUMNS, ['className','section','studentName','gender','admissionDate','address','parentName','parentPhone','studentPhone','branch']);
  for (const unwanted of ['dateOfBirth','status','reason']) assert.equal((IMPORT_COLUMNS as readonly string[]).includes(unwanted), false);
});

test('XLSX import reads admission date, address and guardian details', () => {
  const sheet = XLSX.utils.aoa_to_sheet([[...IMPORT_COLUMNS], ['Grade 3','B','Sahra Amina Yusuf','female','2026-11-14','Jijiga','Yusuf Omar','+251911000001','','']]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  const rows = parseSchoolImport(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer, 'xlsx');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentName, 'Sahra Amina Yusuf');
  assert.equal(rows[0].admissionDate, '2026-11-14');
  assert.equal(rows[0].address, 'Jijiga');
  assert.equal(rows[0].parentName, 'Yusuf Omar');
});

test('unexpected Status and Reason columns are ignored in CSV and XLSX', () => {
  const headers = [...IMPORT_COLUMNS, 'Status', 'Reason'];
  const values = ['Grade 3','B','Sahra Amina Yusuf','female','2026-11-14','Jijiga','Yusuf Omar','+251911000001','','','inactive','ignore'];
  const csvRows = parseSchoolImport(Buffer.from([headers.join(','), values.join(',')].join('\\n')), 'csv');
  assert.equal(csvRows.length, 1);
  assert.equal('status' in csvRows[0], false);
  assert.equal('reason' in csvRows[0], false);
  const sheet = XLSX.utils.aoa_to_sheet([headers, values]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  const xlsxRows = parseSchoolImport(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer, 'xlsx');
  assert.equal(xlsxRows.length, 1);
  assert.equal('status' in xlsxRows[0], false);
  assert.equal('reason' in xlsxRows[0], false);
});
