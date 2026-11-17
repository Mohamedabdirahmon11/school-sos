import {
  countAttendance, escapePlainText, monthDays, paginate, passThreshold, sumMarks,
  summarizeOutcomes, type AttendanceEntry, type MarkValue, type PassRule, type StudentOutcome,
  type TemplateSubject
} from './template-engine.ts';

export interface ExamResultStudent {
  id: string;
  name: string;
  marks: Record<string, MarkValue>;
  outcome: StudentOutcome;
}

export interface ExamResultData {
  schoolName: string;
  ministryName?: string;
  examinationOffice?: string;
  examTitle: string;
  academicYear: string;
  subjects: TemplateSubject[];
  students: ExamResultStudent[];
  passRule: PassRule;
  qrVerificationId?: string;
  page?: number;
  rowsPerPage?: number;
}

export interface ReportCardData {
  schoolName: string;
  student: { id: string; name: string; className: string; academicYear: string };
  subjects: Array<{ name: string; term1?: number | null; term2?: number | null; final?: number | null; grade?: string }>;
  total?: number;
  average?: number;
  grade?: string;
  rank?: string | number;
  outcome?: StudentOutcome;
  comment?: string;
}

export interface AttendanceSheetData {
  schoolName: string;
  className: string;
  month: number;
  year: number;
  students: Array<{ id: string; name: string }>;
  entries: AttendanceEntry[];
  holidays?: string[];
  weekendDays?: number[];
  rowsPerPage?: number;
}

export interface CertificateData {
  schoolName: string;
  title: string;
  studentName: string;
  body: string;
  rankOrTotal?: string;
  date: string;
  signatories?: string[];
}

export interface StudentIdSheetData {
  schoolName: string;
  year: string;
  cards: Array<{ id: string; name: string; className: string; photoUrl?: string }>;
  accentColor?: string;
}

export interface OfficialLetterData {
  schoolName: string;
  date: string;
  recipient: string;
  subject: string;
  paragraphs: string[];
  signatory: string;
  designation?: string;
}

export interface FeeReceiptData {
  schoolName: string;
  receiptNumber: string;
  date: string;
  student: { id: string; name: string; className: string; parentName?: string };
  items: Array<{ description: string; amount: number }>;
  currency?: string;
  receivedBy?: string;
}

export interface TimetableData {
  schoolName: string;
  className: string;
  days: string[];
  periods: Array<{ label: string; start: string; end: string }>;
  cells: Record<string, Record<string, string>>;
}

export interface ClassListData {
  schoolName: string;
  className: string;
  students: Array<{ id: string; name: string; gender?: string; parentPhone?: string }>;
  rowsPerPage?: number;
}

function text(value: unknown): string {
  return escapePlainText(value);
}

function paper(title: string, body: string, schoolName: string, accentColor = '#176b5b', footer = 'SchoolOS'): string {
  const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#176b5b';
  return `<article class="schoolos-a4" style="box-sizing:border-box;width:190mm;min-height:277mm;margin:0 auto;padding:10mm;background:#fff;color:#17212b;font-family:Arial,sans-serif;font-size:11pt;direction:rtl">
<header style="border-bottom:3px solid ${safeAccent};padding-bottom:8px;margin-bottom:16px;text-align:center">
<div style="font-size:19pt;font-weight:700;color:${safeAccent}">${text(schoolName)}</div>
</header><h1 style="font-size:16pt;text-align:center;margin:14px 0">${text(title)}</h1>
${body}
<footer style="border-top:1px solid #94a3b8;margin-top:20px;padding-top:6px;text-align:center;font-size:8pt;color:#64748b">${text(footer)}</footer>
</article>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map(value => `<th style="border:1px solid #64748b;padding:5px;background:#e8f0ee">${text(value)}</th>`).join('');
  const body = rows.map((row, index) => `<tr style="background:${index % 2 ? '#f5f8f7' : '#fff'}">${row.map(value => `<td style="border:1px solid #94a3b8;padding:5px">${text(value)}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;table-layout:auto"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderExamResultList(data: ExamResultData): string {
  const threshold = passThreshold(data.subjects, data.passRule);
  const outcomes = summarizeOutcomes(data.students.map(student => student.outcome));
  const pageSize = Math.max(5, Math.min(25, data.rowsPerPage ?? 20));
  const page = paginate(data.students, data.page ?? 1, pageSize);
  const headers = ['Lr.', 'Aqoonsi', 'Magaca ardayga', ...data.subjects.map(subject => subject.name), 'Wadar', 'Xaalad'];
  const rows = page.items.map((student, index) => [
    String((page.page - 1) * page.pageSize + index + 1), student.id, student.name,
    ...data.subjects.map(subject => {
      const mark = student.marks[subject.id];
      return mark === undefined ? '—' : String(mark);
    }),
    String(sumMarks(data.subjects.map(subject => student.marks[subject.id] ?? 'LB'))),
    student.outcome
  ]);
  const summary = `Wadar Arday: ${outcomes.total} · Gudub: ${outcomes.passed} · Aan Gudbin: ${outcomes.failed} · Maqan: ${outcomes.absent} · Laga Baabiyey: ${outcomes.exempted}`;
  const header = `<p style="text-align:center">${text(data.ministryName || 'Jamhuuriyadda Federaalka')}<br/>${text(data.examinationOffice || 'Xafiiska Imtixaanaadka')}</p><p style="text-align:center">${text(data.examTitle)} · ${text(data.academicYear)}</p>`;
  const qr = data.qrVerificationId ? `<p style="text-align:left;font-size:8pt">QR / Aqoonsiga xaqiijinta: ${text(data.qrVerificationId)}</p>` : '';
  return paper('GO’AANKA IMTIXAANKA', header + `<p style="font-weight:700;text-align:center">Xadka gudbidda: ${threshold} dhibco</p>` + table(headers, rows) + `<p style="font-weight:700">${text(summary)}</p>` + qr + `<p style="text-align:left">Bogga ${page.page} / ${page.pageCount}</p>`, data.schoolName);
}

export function renderIndividualReportCard(data: ReportCardData): string {
  const rows = data.subjects.map(subject => [subject.name, subject.term1 == null ? '—' : String(subject.term1), subject.term2 == null ? '—' : String(subject.term2), subject.final == null ? '—' : String(subject.final), subject.grade || '—']);
  const details = `<p>Arday: <strong>${text(data.student.name)}</strong> · ID: ${text(data.student.id)}</p><p>Fasal: ${text(data.student.className)} · Sanad: ${text(data.student.academicYear)}</p>`;
  const totals = `<p>Wadar: ${text(data.total ?? '—')} · Celcelis: ${text(data.average ?? '—')} · Darajo: ${text(data.grade ?? '—')} · Kaalin: ${text(data.rank ?? '—')}</p><p>Xaalad: ${text(data.outcome ?? '—')}</p><p>Faallo: ${text(data.comment ?? '')}</p>`;
  return paper('WARQADDA NATIIJADA ARDAYGA', details + table(['Maaddada', 'Term 1', 'Term 2', 'Final', 'Grade'], rows) + totals + '<p>Macallinka: __________________ · Maamulaha: __________________ · Waalidka: __________________</p>', data.schoolName);
}

export function renderAttendanceSheet(data: AttendanceSheetData): string[] {
  const days = monthDays(data.year, data.month, data.weekendDays, data.holidays);
  const rowsPerPage = Math.max(5, Math.min(25, data.rowsPerPage ?? 20));
  const pages = Math.max(1, Math.ceil(data.students.length / rowsPerPage));
  return Array.from({ length: pages }, (_, pageIndex) => {
    const slice = paginate(data.students, pageIndex + 1, rowsPerPage);
    const headers = ['Lr.', 'Magaca ardayga', ...days.map(day => String(day.day)), 'J', 'M'];
    const rows = slice.items.map((student, index) => {
      const attendance = countAttendance(data.entries, student.id);
      const marks = days.map(day => {
        const entry = data.entries.find(item => item.studentId === student.id && item.date === day.date);
        return entry?.status || (day.isWeekend || day.isHoliday ? '—' : '');
      });
      return [String((pageIndex * rowsPerPage) + index + 1), student.name, ...marks, String(attendance.present), String(attendance.absent)];
    });
    const monthLabel = new Intl.DateTimeFormat('so', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(data.year, data.month - 1, 1)));
    const body = `<p>Fasal: ${text(data.className)} · Bil: ${text(monthLabel)} ${data.year}</p>` + table(headers, rows)
      + `<p>Furaha: J = Joogay · M = Maqnaa · — = Fasax / dhammaadka toddobaadka</p><p>Bogga ${pageIndex + 1} / ${pages}</p>`;
    return paper('XAADIRINTA ARDAYDA', body, data.schoolName);
  });
}

export function renderCertificate(data: CertificateData): string {
  const signatures = (data.signatories || ['Maamulaha', 'Macallinka']).map(name => `<div style="display:inline-block;width:42%;margin:18px 3% 0;text-align:center;border-top:1px solid #475569;padding-top:6px">${text(name)}</div>`).join('');
  const body = `<section style="border:8px double #b7791f;min-height:170mm;padding:24mm 14mm;text-align:center"><p>Waxaa halkan lagu caddeynayaa in</p><h2 style="font-size:24pt">${text(data.studentName)}</h2><p style="font-size:13pt;line-height:1.8">${text(data.body)}</p><p>${text(data.rankOrTotal || '')}</p><p>Taariikh: ${text(data.date)}</p><div>${signatures}</div></section>`;
  return paper(data.title, body, data.schoolName, '#b7791f');
}

export function renderStudentIdCards(data: StudentIdSheetData): string {
  const cards = data.cards.slice(0, 8).map(card => `<section style="height:83mm;border:1px solid #64748b;border-radius:8px;overflow:hidden;break-inside:avoid;background:#fff">
<div style="height:12mm;background:${/^#[0-9a-fA-F]{6}$/.test(data.accentColor || '') ? data.accentColor : '#176b5b'};color:#fff;text-align:center;padding:3mm;font-weight:700">${text(data.schoolName)}</div>
<div style="display:flex;gap:5mm;padding:5mm;align-items:center">${card.photoUrl && /^https:\/\//i.test(card.photoUrl) ? `<img src="${text(card.photoUrl)}" alt="" style="width:24mm;height:30mm;object-fit:cover;border:1px solid #94a3b8"/>` : '<div style="width:24mm;height:30mm;border:1px solid #94a3b8"></div>'}
<div><strong>${text(card.name)}</strong><p>ID: ${text(card.id)}</p><p>Fasal: ${text(card.className)}</p><p>Sanad: ${text(data.year)}</p></div></div></section>`).join('');
  return `<article class="schoolos-a4" style="width:190mm;margin:0 auto;padding:10mm;display:grid;grid-template-columns:1fr 1fr;gap:5mm;background:#fff;color:#17212b;font-family:Arial,sans-serif">${cards}</article>`;
}

export function renderOfficialLetter(data: OfficialLetterData): string {
  const paragraphs = data.paragraphs.map(paragraph => `<p style="line-height:1.8;margin:12px 0">${text(paragraph)}</p>`).join('');
  return paper('WARQAD RASMI AH', `<p>Taariikh: ${text(data.date)}</p><p>Ku: ${text(data.recipient)}</p><p><strong>Ujeeddo: ${text(data.subject)}</strong></p>${paragraphs}<p>Si xushmad leh,</p><p style="margin-top:36px">${text(data.signatory)}<br/>${text(data.designation || '')}</p>`, data.schoolName);
}

export function renderFeeReceipt(data: FeeReceiptData): string {
  const total = data.items.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
  const currency = data.currency || 'ETB';
  const rows = data.items.map(item => [item.description, `${currency} ${item.amount.toFixed(2)}`]);
  rows.push(['WADARTA', `${currency} ${total.toFixed(2)}`]);
  return paper('RASIID LACAG-BIXIN', `<p>Rasiid No: ${text(data.receiptNumber)} · Taariikh: ${text(data.date)}</p><p>Arday: ${text(data.student.name)} · ID: ${text(data.student.id)} · Fasal: ${text(data.student.className)}</p><p>Waalid: ${text(data.student.parentName || '')}</p>` + table(['Faahfaahin', 'Lacag'], rows) + `<p>Lacagta waxaa qabtay: ${text(data.receivedBy || '')}</p><p>Saxiixa bixiyaha: __________ · Saxiixa qaataha: __________</p>`, data.schoolName);
}

export function renderClassTimetable(data: TimetableData): string {
  const rows = data.periods.map(period => [
    `${period.label} (${period.start}–${period.end})`,
    ...data.days.map(day => data.cells[day]?.[period.label] || '—')
  ]);
  return paper('JADWALKA FASALKA', `<p>Fasal: ${text(data.className)}</p>` + table(['Waqti', ...data.days], rows), data.schoolName);
}

export function renderClassList(data: ClassListData): string[] {
  const rowsPerPage = Math.max(5, Math.min(25, data.rowsPerPage ?? 20));
  const pageCount = Math.max(1, Math.ceil(data.students.length / rowsPerPage));
  return Array.from({ length: pageCount }, (_, pageIndex) => {
    const page = paginate(data.students, pageIndex + 1, rowsPerPage);
    const rows = page.items.map((student, index) => [
      String((pageIndex * rowsPerPage) + index + 1), student.id, student.name,
      student.gender || '—', student.parentPhone || '—'
    ]);
    return paper('LIISKA ARDAYDA FASALKA', `<p>Fasal: ${text(data.className)}</p>` + table(['Lr.', 'Aqoonsi', 'Magaca', 'Jinsi', 'Telefoonka waalidka'], rows) + `<p>Bogga ${pageIndex + 1} / ${pageCount}</p>`, data.schoolName);
  });
}
