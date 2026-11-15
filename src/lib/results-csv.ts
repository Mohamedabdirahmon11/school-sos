/** CSV export of class result rankings (Excel-safe: quoted cells, BOM, CRLF). */
const cell = (value: unknown) => {
  const text = String(value ?? '');
  // Neutralise spreadsheet formulas in names/ids.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return '"' + safe.replace(/"/g, '""') + '"';
};

const fullName = (student: any) => [student?.firstName, student?.middleName, student?.lastName].filter(Boolean).join(' ');

export function buildResultsCsv(
  kind: 'semester' | 'yearly',
  rows: any[],
  gradeFor: (percentage: number) => string,
  passMark: number
): string {
  const header = kind === 'semester'
    ? ['Rank', 'Student ID', 'Student Name', 'Subjects Graded', 'Average (%)', 'Grade', 'Status']
    : ['Yearly Rank', 'Student ID', 'Student Name', 'Yearly Total (%)', 'Grade', 'Decision'];
  const lines = rows.map(row => {
    if (kind === 'semester') {
      const average = Number(row.averagePercentage) || 0;
      return [row.rank, row.student?.studentId, fullName(row.student), row.subjectCount, average, gradeFor(average), average >= passMark ? 'Passing' : 'Below Pass Mark'];
    }
    const yearly = Number(row.yearlyPercentage) || 0;
    return [row.yearlyRank, row.student?.studentId, fullName(row.student), yearly, gradeFor(yearly), row.isPass ? 'Promote Candidate' : 'Repeat Required'];
  });
  return '﻿' + [header, ...lines].map(line => line.map(cell).join(',')).join('\r\n');
}
