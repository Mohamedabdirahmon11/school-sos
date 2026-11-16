import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, escapeSpreadsheetHtml, rowsToCsv } from '../src/lib/documents/spreadsheet.ts';

test('CSV export quotes cells and preserves commas, quotes, and newlines', () => {
  assert.equal(csvCell('A, "B"'),'"A, ""B"""');
  assert.match(rowsToCsv([['Name','Note'],['Asha','line 1\nline 2']]),/^\uFEFF"Name","Note"\r\n/);
});

test('CSV export neutralizes formula-like values from spreadsheet injection', () => {
  for (const value of ['=1+1',' +SUM(A1:A2)','-2+3','@SUM(1,2)','\tcmd']) {
    assert.equal(csvCell(value).startsWith('"\''),true);
  }
  assert.equal(csvCell('ordinary text'), '"ordinary text"');
});

test('spreadsheet cell text is escaped before becoming editor HTML', () => {
  assert.equal(escapeSpreadsheetHtml('<img src=x onerror=1> & "x"'),'&lt;img src=x onerror=1&gt; &amp; &quot;x&quot;');
});
