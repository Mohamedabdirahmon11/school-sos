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
  return `<div style="width:190mm;margin:0 auto;padding:10mm;background-color:#fff;color:#17212b;font-family:Arial,sans-serif;font-size:11pt;direction:rtl">
<div style="border-bottom:3px solid ${safeAccent};padding-bottom:8px;margin-bottom:16px;text-align:center">
<div style="font-size:19pt;font-weight:700;color:${safeAccent}">${text(schoolName)}</div>
</div><h1 style="font-size:16pt;text-align:center;margin:14px 0">${text(title)}</h1>
${body}
<p style="border-top:1px solid #94a3b8;margin-top:20px;padding-top:6px;text-align:center;font-size:8pt;color:#64748b">${text(footer)}</p>
</div>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = headers.map(value => `<th style="border:1px solid #64748b;padding:5px;background-color:#e8f0ee">${text(value)}</th>`).join('');
  const body = rows.map((row, index) => `<tr style="background-color:${index % 2 ? '#f5f8f7' : '#fff'}">${row.map(value => `<td style="border:1px solid #94a3b8;padding:5px">${text(value)}</td>`).join('')}</tr>`).join('');
  return `<table style="width:100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderExamResultList(data: ExamResultData): string {
  const threshold = passThreshold(data.subjects, data.passRule);
  const outcomes = summarizeOutcomes(data.students.map(student => student.outcome));
  const pageSize = Math.max(5, Math.min(25, data.rowsPerPage ?? 20));
  const pageCount = Math.max(1, Math.ceil(data.students.length / pageSize));
  const headers = ['Lr.', 'Aqoonsi', 'Magaca ardayga', ...data.subjects.map(subject => subject.name), 'Wadar', 'Xaalad'];
  const summary = `Wadar Arday: ${outcomes.total} · Gudub: ${outcomes.passed} · Aan Gudbin: ${outcomes.failed} · Maqan: ${outcomes.absent} · Laga Baabiyey: ${outcomes.exempted}`;
  const header = `<p style="text-align:center">${text(data.ministryName || 'Jamhuuriyadda Federaalka')}<br/>${text(data.examinationOffice || 'Xafiiska Imtixaanaadka')}</p><p style="text-align:center">${text(data.examTitle)} · ${text(data.academicYear)}</p>`;
  const qr = data.qrVerificationId ? `<p style="text-align:left;font-size:8pt">QR / Aqoonsiga xaqiijinta: ${text(data.qrVerificationId)}</p>` : '';
  return Array.from({length:pageCount},(_,pageIndex)=>{
    const page = paginate(data.students,pageIndex+1,pageSize);
    const rows = page.items.map((student,index)=>[
      String((page.page-1)*page.pageSize+index+1),student.id,student.name,
      ...data.subjects.map(subject=>{const mark=student.marks[subject.id];return mark===undefined?'—':String(mark);}),
      String(sumMarks(data.subjects.map(subject=>student.marks[subject.id]??'LB'))),student.outcome
    ]);
    return paper('GO’AANKA IMTIXAANKA',header+`<p style="font-weight:700;text-align:center">Xadka gudbidda: ${threshold} dhibco</p>`+table(headers,rows)+`<p style="font-weight:700">${text(summary)}</p>`+qr+`<p style="text-align:left">Bogga ${page.page} / ${page.pageCount}</p>`,data.schoolName);
  }).join('<div style="page-break-after:always"></div>');
}

export function renderIndividualReportCard(data: ReportCardData): string {
  const rows = data.subjects.map(subject => [subject.name, subject.term1 == null ? '—' : String(subject.term1), subject.term2 == null ? '—' : String(subject.term2), subject.final == null ? '—' : String(subject.final), subject.grade || '—']);
  const details = `<p>Arday: <strong>${text(data.student.name)}</strong> · ID: ${text(data.student.id)}</p><p>Fasal: ${text(data.student.className)} · Sanad: ${text(data.student.academicYear)}</p>`;
  const totals = `<p>Wadar: ${text(data.total ?? '—')} · Celcelis: ${text(data.average ?? '—')} · Darajo: ${text(data.grade ?? '—')} · Kaalin: ${text(data.rank ?? '—')}</p><p>Xaalad: ${text(data.outcome ?? '—')}</p><p>Faallo: ${text(data.comment ?? '')}</p>`;
  const signatures=(data.signatories||['Macallinka','Maamulaha','Waalidka']).map(name=>`<td style="width:33%;padding-top:18px;text-align:center"><p style="border-top:1px solid #475569;padding-top:5px">${text(name)}</p></td>`).join('');
  return paper('WARQADDA NATIIJADA ARDAYGA', details + table(['Maaddada', 'Term 1', 'Term 2', 'Final', 'Grade'], rows) + totals + `<table style="width:100%"><tr>${signatures}</tr></table>`, data.schoolName);
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
  const signatures = (data.signatories || ['Maamulaha', 'Macallinka']).map(name => `<td style="width:50%;padding:18px 3% 0;text-align:center;vertical-align:bottom"><p style="border-top:1px solid #475569;padding-top:6px">${text(name)}</p></td>`).join('');
  const body = `<div style="border:8px double #b7791f;height:170mm;padding:24mm 14mm;text-align:center"><p>Waxaa halkan lagu caddeynayaa in</p><h2 style="font-size:24pt">${text(data.studentName)}</h2><p style="font-size:13pt;line-height:1.8">${text(data.body)}</p><p>${text(data.rankOrTotal || '')}</p><p>Taariikh: ${text(data.date)}</p><table style="width:100%"><tr>${signatures}</tr></table></div>`;
  return paper(data.title, body, data.schoolName, '#b7791f');
}

export function renderStudentIdCards(data: StudentIdSheetData): string {
  const pages=Math.max(1,Math.ceil(data.cards.length/8));
  return Array.from({length:pages},(_,pageIndex)=>{
    const pageCards=data.cards.slice(pageIndex*8,(pageIndex+1)*8);
    const rows=Array.from({length:4},(_,rowIndex)=>{
      const cells=pageCards.slice(rowIndex*2,rowIndex*2+2).map(card=>{
        const photoPath=card.photoUrl?.startsWith('/api/documents/images?path=') ? card.photoUrl.split('path=')[1] : '';
        const safePhoto=photoPath && /^[A-Za-z0-9%._/-]+$/.test(photoPath) ? `<img src="/api/documents/images?path=${text(photoPath)}" alt="" style="width:24mm;height:30mm;border:1px solid #94a3b8"/>` : '<div style="width:24mm;height:30mm;border:1px solid #94a3b8"></div>';
        return `<td style="width:50%;height:61mm;border:1px solid #64748b;padding:2mm;vertical-align:top">
<div style="background-color:${/^#[0-9a-fA-F]{6}$/.test(data.accentColor || '') ? data.accentColor : '#176b5b'};color:#fff;text-align:center;padding:3mm;font-weight:700">${text(data.schoolName)}<br/>KAARKA AQOONSIGA ARDAYGA</div>
<table style="width:100%"><tr><td style="width:28mm;vertical-align:top">${safePhoto}</td><td style="vertical-align:top"><strong>${text(card.name)}</strong><p>ID: ${text(card.id)}</p><p>Fasal: ${text(card.className)}</p><p>Sanad: ${text(data.year)}</p></td></tr></table>
</td>`;
      });
      while(cells.length<2)cells.push('<td style="width:50%;height:61mm"></td>');
      return `<tr>${cells.join('')}</tr>`;
    }).join('');
    return `<div style="width:190mm;margin:0 auto;padding:10mm;background-color:#fff;color:#17212b;font-family:Arial,sans-serif;direction:rtl"><h2 style="text-align:center">${text(data.schoolName)} · KAARKA AQOONSIGA ARDAYGA</h2><table style="width:100%">${rows}</table><p style="text-align:left;font-size:8pt">Bogga ${pageIndex+1} / ${pages}</p></div>`;
  }).join('<div style="page-break-after:always"></div>');
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
