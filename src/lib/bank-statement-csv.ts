export type BankStatementImportRow = {
  statementDate: string;
  description: string;
  direction: 'credit' | 'debit';
  amount: number;
  reference?: string;
  bankAccountLabel?: string;
};

export type BankStatementCsvIssue = { line: number; message: string };

function parseCsvRecords(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field.trim()); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some(value => value.length)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(value => value.length)) rows.push(row);
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  return rows;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, '').replace(/[^a-z0-9]/g, '');
}

function parseStatementDate(value: string): string | null {
  const input = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const date = new Date(input + 'T00:00:00.000Z');
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? null : input;
  }
  const match = input.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseAmount(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const negative = raw.includes('-') || /^\(.*\)$/.test(raw);
  let cleaned = raw.replace(/[^0-9,.]/g, '');
  if (!cleaned) return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    else cleaned = cleaned.replace(/,/g, '');
  } else if (comma >= 0) {
    const groups = cleaned.split(',');
    if (groups.length === 2 && groups[1].length > 0 && groups[1].length <= 2) cleaned = cleaned.replace(',', '.');
    else if (groups.length >= 2 && groups.slice(1).every(group => group.length === 3)) cleaned = groups.join('');
    else return null;
  } else if (dot >= 0 && cleaned.split('.').length > 2) {
    const groups = cleaned.split('.');
    if (groups.slice(1).every(group => group.length === 3)) cleaned = groups.join('');
    else return null;
  }
  const amount = Number(cleaned) * (negative ? -1 : 1);
  return Number.isFinite(amount) && amount !== 0 ? amount : null;
}

export function parseBankStatementCsv(source: string): { rows: BankStatementImportRow[]; issues: BankStatementCsvIssue[] } {
  if (source.length > 2_000_000) return { rows: [], issues: [{ line: 1, message: 'CSV file must be smaller than 2 MB.' }] };
  let records: string[][];
  try { records = parseCsvRecords(source); }
  catch (error) { return { rows: [], issues: [{ line: 1, message: error instanceof Error ? error.message : 'CSV could not be read.' }] }; }
  if (records.length < 2) return { rows: [], issues: [{ line: 1, message: 'CSV must include a header and at least one transaction row.' }] };
  const headers = records[0].map(normalizeHeader);
  const find = (...names: string[]) => headers.findIndex(header => names.includes(header));
  const dateIndex = find('date', 'statementdate', 'transactiondate', 'valuedate');
  const descriptionIndex = find('description', 'details', 'narration', 'memo', 'transactiondescription');
  const amountIndex = find('amount', 'transactionamount');
  const directionIndex = find('direction', 'type', 'transactiontype');
  const creditIndex = find('credit', 'deposit', 'moneyin');
  const debitIndex = find('debit', 'withdrawal', 'moneyout');
  const referenceIndex = find('reference', 'referenceno', 'transactionid', 'ref');
  const accountIndex = find('account', 'accountname', 'bankaccount', 'bankaccountlabel');
  const missing = [
    dateIndex < 0 ? 'date' : '',
    descriptionIndex < 0 ? 'description' : '',
    amountIndex < 0 && creditIndex < 0 && debitIndex < 0 ? 'amount or credit/debit' : ''
  ].filter(Boolean);
  if (missing.length) return { rows: [], issues: [{ line: 1, message: `Missing required column(s): ${missing.join(', ')}.` }] };

  const rows: BankStatementImportRow[] = [];
  const issues: BankStatementCsvIssue[] = [];
  if (records.length - 1 > 500) return { rows: [], issues: [{ line: 1, message: 'Import is limited to 500 transactions per file.' }] };
  records.slice(1).forEach((record, index) => {
    const line = index + 2;
    const value = (column: number) => column < 0 ? '' : String(record[column] ?? '').trim();
    const statementDate = parseStatementDate(value(dateIndex));
    const description = value(descriptionIndex);
    let amount = amountIndex >= 0 ? parseAmount(value(amountIndex)) : null;
    let direction: 'credit' | 'debit' | null = null;
    if (creditIndex >= 0 || debitIndex >= 0) {
      const credit = creditIndex >= 0 ? parseAmount(value(creditIndex)) : null;
      const debit = debitIndex >= 0 ? parseAmount(value(debitIndex)) : null;
      if ((credit && debit) || (!credit && !debit)) amount = null;
      else if (credit) { amount = Math.abs(credit); direction = 'credit'; }
      else if (debit) { amount = Math.abs(debit); direction = 'debit'; }
    }
    const rawDirection = value(directionIndex).toLowerCase();
    if (!direction) {
      if (['credit', 'deposit', 'incoming', 'money in', 'in'].includes(rawDirection)) direction = 'credit';
      else if (['debit', 'withdrawal', 'outgoing', 'money out', 'out'].includes(rawDirection)) direction = 'debit';
      else if (amount !== null) direction = amount < 0 ? 'debit' : 'credit';
    }
    if (!statementDate || description.length < 2 || description.length > 500 || amount === null || Math.abs(amount) > 9999999999.99 || !direction) {
      issues.push({ line, message: 'Provide a valid date, description, positive amount, and credit/debit direction.' });
      return;
    }
    rows.push({
      statementDate, description, direction, amount: Math.abs(amount),
      ...(value(referenceIndex) ? { reference: value(referenceIndex).slice(0, 160) } : {}),
      ...(value(accountIndex) ? { bankAccountLabel: value(accountIndex).slice(0, 120) } : {})
    });
  });
  return { rows, issues };
}

export const BANK_STATEMENT_CSV_TEMPLATE = [
  'date,description,direction,amount,reference,account',
  '2026-11-01,Tuition payment,credit,1500,TXN-001,Main account',
  '2026-11-02,Electricity bill,debit,320,TXN-002,Main account'
].join('\r\n');
