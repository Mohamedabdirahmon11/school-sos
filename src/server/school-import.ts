import * as XLSX from 'xlsx';

export const IMPORT_COLUMNS = ['className', 'section', 'studentName', 'gender', 'dateOfBirth', 'parentName', 'parentPhone', 'studentPhone', 'branch'] as const;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface SchoolImportRow {
  className: string;
  section: string;
  studentName: string;
  gender: string;
  dateOfBirth: string;
  parentName: string;
  parentPhone: string;
  studentPhone: string;
  branch: string;
}

export function extractImportFile(body: Buffer, contentType: string): { file: Buffer; extension: 'csv' | 'xlsx' } {
  if (body.length > MAX_IMPORT_BYTES) throw new Error('File exceeds the 5 MB limit.');
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.slice(1).find(Boolean)?.trim();
  if (!boundary) throw new Error('Upload a CSV or XLSX file.');
  const source = body.toString('latin1');
  const part = source.split(`--${boundary}`).find(section => /name="file"/i.test(section) && /filename="[^"]+\.(csv|xlsx)"/i.test(section));
  if (!part) throw new Error('Choose a CSV or XLSX file.');
  const filename = /filename="[^"]+\.(csv|xlsx)"/i.exec(part)?.[0].toLowerCase() || '';
  const extension = filename.endsWith('.xlsx"') ? 'xlsx' : 'csv';
  const splitAt = part.indexOf('\r\n\r\n');
  if (splitAt < 0) throw new Error('Uploaded file is malformed.');
  const content = part.slice(splitAt + 4).replace(/\r\n$/, '');
  return { file: Buffer.from(content, 'latin1'), extension };
}

export function parseSchoolImport(file: Buffer, extension: 'csv' | 'xlsx'): SchoolImportRow[] {
  if (extension === 'csv') {
    const text = file.toString('utf8').replace(/^\uFEFF/, '');
    const records: string[][] = [];
    let record: string[] = []; let field = ''; let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted && character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = !quoted;
      else if (!quoted && character === ',') { record.push(field); field = ''; }
      else if (!quoted && (character === '\n' || character === '\r')) {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        record.push(field); field = '';
        if (record.some(value => value.trim())) records.push(record);
        record = [];
      } else field += character;
    }
    if (quoted) throw new Error('The CSV file contains an unclosed quoted field.');
    if (field || record.length) { record.push(field); if (record.some(value => value.trim())) records.push(record); }
    if (!records.length) return [];
    const headers = records.shift()!.map(value => value.trim());
    if (records.length > MAX_IMPORT_ROWS) throw new Error('File exceeds the 2,000 row limit.');
    return records.map(values => Object.fromEntries(IMPORT_COLUMNS.map(column => [column, String(values[headers.indexOf(column)] ?? '').trim()])) as unknown as SchoolImportRow);
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file, { type: 'buffer', cellDates: false, raw: false });
  } catch {
    throw new Error(`The ${extension.toUpperCase()} file could not be read.`);
  }
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error('The file has no worksheet.');
  const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: true });
  if (values.length > MAX_IMPORT_ROWS) throw new Error('File exceeds the 2,000 row limit.');
  return values.map(value => {
    const normalized = Object.fromEntries(Object.entries(value).map(([key, field]) => {
      if (key.trim() === 'dateOfBirth' && typeof field === 'number') {
        const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(field) * 86_400_000);
        return [key.trim(), date.toISOString().slice(0, 10)];
      }
      return [key.trim(), String(field ?? '').trim()];
    }));
    return Object.fromEntries(IMPORT_COLUMNS.map(column => [column, normalized[column] || ''])) as unknown as SchoolImportRow;
  });
}

export function isExampleImportRow(row: SchoolImportRow): boolean {
  return row.studentName.trim().toUpperCase().startsWith('EXAMPLE');
}

export function validImportPhone(value: string): boolean {
  return /^\+?[1-9]\d{6,14}$/.test(value.replace(/[\s()-]/g, ''));
}

export function splitStudentName(value: string): { firstName: string; middleName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) throw new Error('Student name must contain at least two names.');
  return { firstName: parts[0], middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '', lastName: parts.at(-1)! };
}
