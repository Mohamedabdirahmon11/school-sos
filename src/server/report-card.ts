import { ReportCardDesign, School } from '../types/index.ts';
import { PdfImageAsset, PdfPage } from './pdf.ts';
import { adminRemark, formatReportCardMark, gradeLabelForPercentage, isEmbeddableImageSource, teacherRemark } from '../lib/report-card.ts';

export const REPORT_CARD_TEMPLATES: ReportCardDesign['templateId'][] = ['modern', 'classic', 'minimal', 'executive'];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_IMAGE_CHARS = 3_000_000;

function cleanText(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text.`);
  const text = value.trim();
  if (!allowEmpty && !text) throw new Error(`${field} is required.`);
  if (text.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  return text;
}

function cleanColor(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value.trim())) throw new Error(`${field} must be a six-digit hex color.`);
  return value.trim().toUpperCase();
}

function cleanImage(value: unknown, field: string): string {
  if (value === undefined) return undefined as unknown as string;
  if (value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error(`${field} must be an image upload or URL.`);
  const trimmed = value.trim();
  if (trimmed.length > MAX_IMAGE_CHARS) throw new Error(`${field} must be 3 MB or smaller.`);
  if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) return trimmed;
  if (/^https?:\/\/[^\s]+$/i.test(trimmed) && trimmed.length <= 2048) return trimmed;
  throw new Error(`${field} must be an uploaded PNG/JPG image, a WebP image, or an http(s) URL.`);
}

export function sanitizeReportCardDesign(body: Record<string, unknown>): Partial<ReportCardDesign> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Report card design must be an object.');
  const updates: Partial<ReportCardDesign> = {};
  if (body.templateId !== undefined) {
    if (!REPORT_CARD_TEMPLATES.includes(body.templateId as ReportCardDesign['templateId'])) throw new Error(`templateId must be one of ${REPORT_CARD_TEMPLATES.join(', ')}.`);
    updates.templateId = body.templateId as ReportCardDesign['templateId'];
  }
  if (body.primaryColor !== undefined) updates.primaryColor = cleanColor(body.primaryColor, 'primaryColor');
  if (body.secondaryColor !== undefined) updates.secondaryColor = cleanColor(body.secondaryColor, 'secondaryColor');
  if (body.logoPosition !== undefined) {
    if (!['left', 'center', 'right'].includes(String(body.logoPosition))) throw new Error('logoPosition must be left, center, or right.');
    updates.logoPosition = body.logoPosition as ReportCardDesign['logoPosition'];
  }
  if (body.titleText !== undefined) updates.titleText = cleanText(body.titleText, 'titleText', 150);
  if (body.signatureTitleLeft !== undefined) updates.signatureTitleLeft = cleanText(body.signatureTitleLeft, 'signatureTitleLeft', 100);
  if (body.signatureTitleRight !== undefined) updates.signatureTitleRight = cleanText(body.signatureTitleRight, 'signatureTitleRight', 100);
  if (body.stampImageUrl !== undefined) updates.stampImageUrl = cleanImage(body.stampImageUrl, 'stampImageUrl');
  if (body.signatureImageUrl !== undefined) updates.signatureImageUrl = cleanImage(body.signatureImageUrl, 'signatureImageUrl');
  if (body.ownDesignImageUrl !== undefined) updates.ownDesignImageUrl = cleanImage(body.ownDesignImageUrl, 'ownDesignImageUrl');
  if (body.visibleBlocks !== undefined) {
    if (!body.visibleBlocks || typeof body.visibleBlocks !== 'object' || Array.isArray(body.visibleBlocks)) throw new Error('visibleBlocks must be an object.');
    const source = body.visibleBlocks as Record<string, unknown>;
    const blocks: ReportCardDesign['visibleBlocks'] = { rank: false, teacherRemarks: false, adminRemarks: false, percentage: false, signatures: false, stamp: false };
    for (const key of Object.keys(blocks) as Array<keyof ReportCardDesign['visibleBlocks']>) {
      if (source[key] !== undefined) {
        if (typeof source[key] !== 'boolean') throw new Error(`visibleBlocks.${key} must be true or false.`);
        blocks[key] = source[key] as boolean;
      }
    }
    updates.visibleBlocks = blocks;
  }
  return updates;
}

interface ReportCardResult {
  student: { firstName: string; middleName?: string; lastName: string; studentId: string };
  subjectResults: Array<{
    subject: { name: string; code?: string };
    isActive?: boolean;
    sem1Marks?: { smallExamMarks: number; bigExamMarks: number; totalMarks: number; percentage: number; teacherRemarks?: string } | null;
    sem2Marks?: { smallExamMarks: number; bigExamMarks: number; totalMarks: number; percentage: number; teacherRemarks?: string } | null;
    sem1Percentage: number | null;
    sem2Percentage: number | null;
    yearlyMarks: number | null;
    yearlyPercentage: number | null;
    maxMarks: { small: number; big: number; total: number };
  }>;
  annualComplete: boolean;
  annualPublished: boolean;
  semester1Rank: number;
  semester2Rank: number;
  yearlyTotal: number;
  yearlyPercentage: number;
  yearlyRank: number;
  isPass: boolean;
}

export interface ReportCardPdfContext {
  school: School;
  design: ReportCardDesign;
  className: string;
  result: ReportCardResult;
  totalStudents: number;
}

function imageAsset(dataUrl: string | undefined, x: number, y: number, width: number, height: number): PdfImageAsset | null {
  return isEmbeddableImageSource(dataUrl) ? { dataUrl: dataUrl!, x, y, width, height } : null;
}

export function buildReportCardPdfPage({ school, design, className, result, totalStudents }: ReportCardPdfContext): PdfPage {
  if (!result.annualComplete || !result.annualPublished) throw new Error('Annual report cards are available only after School Admin publishes both complete semesters.');
  const blocks = design.visibleBlocks || { rank: true, teacherRemarks: true, adminRemarks: true, percentage: true, signatures: true, stamp: true };
  const lines = [
    school.name,
    ...(school.reportCardHeader ? [school.reportCardHeader] : []),
    design.titleText || 'Official Academic Achievement Record',
    `Academic Year: ${school.academicYear || 'Current'}`,
    `Template: ${design.templateId} | Colors: ${design.primaryColor} / ${design.secondaryColor}`,
    `Student: ${result.student.firstName} ${result.student.middleName || ''} ${result.student.lastName} (${result.student.studentId})`,
    `Class: ${className}`
  ];
  if (blocks.rank) lines.push(`Term 1 rank: #${result.semester1Rank} of ${totalStudents}`, `Term 2 rank: #${result.semester2Rank} of ${totalStudents}`, `Final class rank: #${result.yearlyRank} of ${totalStudents}`);
  lines.push('', 'SUBJECT | TERM 1 MARKS | TERM 1 % | TERM 2 MARKS | TERM 2 % | FINAL MARKS | FINAL % | GRADE');
  for (const row of result.subjectResults) {
    lines.push([
      `${row.subject.name}${row.subject.code ? ` (${row.subject.code})` : ''}`,
      formatReportCardMark(row.sem1Marks, row.maxMarks),
      row.sem1Percentage === null ? '-' : `${row.sem1Percentage}%`,
      formatReportCardMark(row.sem2Marks, row.maxMarks),
      row.sem2Percentage === null ? '-' : `${row.sem2Percentage}%`,
      row.yearlyMarks === null ? '-' : String(row.yearlyMarks),
      row.yearlyPercentage === null ? '-' : `${row.yearlyPercentage}%`,
      gradeLabelForPercentage(row.yearlyPercentage, school.gradingScale)
    ].join(' | '));
  }
  const activeRows = result.subjectResults.filter(row => row.isActive !== false);
  const term1Total = activeRows.reduce((sum, row) => sum + (row.sem1Marks?.totalMarks || 0), 0);
  const term2Total = activeRows.reduce((sum, row) => sum + (row.sem2Marks?.totalMarks || 0), 0);
  const finalTotal = activeRows.reduce((sum, row) => sum + (row.yearlyMarks || 0), 0);
  const term1Average = activeRows.length ? term1Total / activeRows.length : 0;
  const term2Average = activeRows.length ? term2Total / activeRows.length : 0;
  lines.push('', `Term 1 total: ${term1Total} | average: ${term1Average}`, `Term 2 total: ${term2Total} | average: ${term2Average}`, `Final total: ${finalTotal} | average: ${result.yearlyPercentage}`);
  lines.push(`Exam maximum marks: Small ${result.subjectResults[0]?.maxMarks.small ?? 0} + Big ${result.subjectResults[0]?.maxMarks.big ?? 0} = ${result.subjectResults[0]?.maxMarks.total ?? 0}`);
  if (blocks.percentage) lines.push(`Yearly average: ${result.yearlyPercentage}% | Grade: ${gradeLabelForPercentage(result.yearlyPercentage, school.gradingScale)}`);
  lines.push(`Result: ${result.isPass ? 'PASS' : 'BELOW PASS MARK'}`);
  if (blocks.teacherRemarks) {
    const term1Comments = activeRows.filter(row => row.sem1Marks?.teacherRemarks?.trim()).map(row => `${row.subject.name}: ${row.sem1Marks?.teacherRemarks}`);
    const term2Comments = activeRows.filter(row => row.sem2Marks?.teacherRemarks?.trim()).map(row => `${row.subject.name}: ${row.sem2Marks?.teacherRemarks}`);
    lines.push('', `Term 1 teacher comments: ${term1Comments.join(' | ') || teacherRemark(result.yearlyPercentage)}`, `Term 2 teacher comments: ${term2Comments.join(' | ') || teacherRemark(result.yearlyPercentage)}`);
  }
  if (blocks.adminRemarks) lines.push(`Administrator remarks: ${adminRemark(result.isPass)}`);
  if (blocks.signatures) lines.push('', `Teacher: ${design.signatureTitleLeft || 'Class Teacher'}`, `Administrator: ${design.signatureTitleRight || 'Principal'}`);
  if (blocks.stamp) lines.push('Official School Seal');
  if (school.reportCardFooter) lines.push('', school.reportCardFooter);

  const images: PdfImageAsset[] = [];
  const background = imageAsset(design.ownDesignImageUrl, 0, 0, 595, 842);
  if (background) images.push(background);
  if (isEmbeddableImageSource(school.logoUrl)) {
    const x = design.logoPosition === 'left' ? 48 : design.logoPosition === 'right' ? 503 : 275.5;
    images.push({ dataUrl: school.logoUrl!, x, y: 780, width: 44, height: 44 });
  }
  if (blocks.signatures && design.signatureImageUrl) {
    const signature = imageAsset(design.signatureImageUrl, 56, 78, 120, 42);
    if (signature) images.push(signature);
  }
  if (blocks.stamp && design.stampImageUrl) {
    const stamp = imageAsset(design.stampImageUrl, 468, 68, 82, 82);
    if (stamp) images.push(stamp);
  }
  return { lines, images };
}
