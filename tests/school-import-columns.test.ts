import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { IMPORT_COLUMNS, parseSchoolImport } from '../src/server/school-import.ts';

test('import input columns do not include Status or Reason', () => {
  const lower = IMPORT_COLUMNS.map(column => column.toLowerCase());
  assert.equal(lower.includes('status'), false);
  assert.equal(lower.includes('reason'), false);
});

test('XLSX without a Status column parses every required field', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['className', 'section', 'studentName', 'gender', 'dateOfBirth', 'parentName', 'parentPhone', 'studentPhone', 'branch'],
    ['Grade 3', 'B', 'Sahra Yusuf', 'female', '2016-01-02', 'Yusuf Omar', '+252611555104', '', '']
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const rows = parseSchoolImport(buffer, 'xlsx');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].studentName, 'Sahra Yusuf');
  assert.equal(rows[0].className, 'Grade 3');
  assert.equal('status' in rows[0], false);
});

test('a Status column in an uploaded CSV or XLSX is ignored', () => {
  const csvRows = parseSchoolImport(Buffer.from('className,section,studentName,gender,dateOfBirth,parentName,parentPhone,studentPhone,branch,Status\nGrade 3,B,Sahra Yusuf,female,2016-01-02,Yusuf Omar,+252611555104,,,inactive'), 'csv');
  assert.equal(csvRows.length, 1);
  assert.equal('status' in csvRows[0], false);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['className', 'section', 'studentName', 'gender', 'dateOfBirth', 'parentName', 'parentPhone', 'studentPhone', 'branch', 'Status'],
    ['Grade 3', 'B', 'Sahra Yusuf', 'female', '2016-01-02', 'Yusuf Omar', '+252611555104', '', '', 'inactive']
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Students');
  const xlsxRows = parseSchoolImport(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer, 'xlsx');
  assert.equal(xlsxRows.length, 1);
  assert.equal('status' in xlsxRows[0], false);
});
