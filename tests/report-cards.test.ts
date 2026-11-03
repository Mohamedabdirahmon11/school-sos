import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPdf } from '../src/server/pdf.ts';
import { buildReportCardPdfPage, sanitizeReportCardDesign } from '../src/server/report-card.ts';
import { School, ReportCardDesign } from '../src/types/index.ts';
import { rgbPngDataUrl } from './support/png.ts';

const image = rgbPngDataUrl();

const school = {
  id: 'school-a',
  name: 'Al Noor Academy',
  code: 'NOOR',
  address: 'Main Street',
  city: 'Mogadishu',
  phone: '+252 61 000 0000',
  email: 'office@example.test',
  logoUrl: image,
  brandColor: '#0F766E',
  currency: 'USD',
  academicYear: '2026-2027',
  currentSemester: 'Semester 2',
  defaultClassCapacity: 40,
  studentAccessEnabled: true,
  subscription: { status: 'active' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
} as School;

const design: ReportCardDesign = {
  id: 'design-a',
  schoolId: 'school-a',
  templateId: 'executive',
  primaryColor: '#0F766E',
  secondaryColor: '#0B2B2A',
  logoPosition: 'center',
  titleText: 'Official Academic Achievement Record',
  visibleBlocks: { rank: true, teacherRemarks: true, adminRemarks: true, percentage: true, signatures: true, stamp: true },
  signatureTitleLeft: 'Class Teacher',
  signatureTitleRight: 'Principal',
  stampImageUrl: image,
  signatureImageUrl: image,
  ownDesignImageUrl: image,
  updatedAt: '2026-01-01T00:00:00.000Z'
};

const result = {
  student: { id: 'student-a', firstName: 'Ahmed', middleName: 'Hassan', lastName: 'Ali', studentId: 'A-001' },
  subjectResults: [
    {
      subject: { id: 'subject-math', name: 'Mathematics', code: 'MATH' },
      sem1Marks: { smallExamMarks: 10, bigExamMarks: 40, totalMarks: 50, percentage: 100 },
      sem2Marks: { smallExamMarks: 8, bigExamMarks: 32, totalMarks: 40, percentage: 80 },
      sem1Percentage: 100,
      sem2Percentage: 80,
      yearlyPercentage: 90,
      maxMarks: { small: 10, big: 40, total: 50 }
    },
    {
      subject: { id: 'subject-bio', name: 'Biology', code: 'BIO' },
      sem1Marks: null,
      sem2Marks: null,
      sem1Percentage: null,
      sem2Percentage: null,
      yearlyPercentage: null,
      maxMarks: { small: 10, big: 40, total: 50 }
    }
  ],
  yearlyPercentage: 90,
  yearlyRank: 1,
  isPass: true
};

test('report card page includes student, subject marks, percentages, max marks, ranking, and remarks', () => {
  const page = buildReportCardPdfPage({ school, design, className: 'Grade 10 A', result, totalStudents: 24 });
  const text = page.lines.join('\n');
  assert.ok(text.includes('Ahmed Hassan Ali'));
  assert.ok(text.includes('A-001'));
  assert.ok(text.includes('Grade 10 A'));
  assert.ok(text.includes('Class rank: #1 of 24'));
  assert.ok(text.includes('Mathematics (MATH)'));
  assert.ok(text.includes('10 + 40 = 50/50'));
  assert.ok(text.includes('100%'));
  assert.ok(text.includes('40/50'));
  assert.ok(text.includes('80%'));
  assert.ok(text.includes('90%'));
  assert.ok(text.includes('Exam maximum marks: Small 10 + Big 40 = 50'));
  assert.ok(text.includes('Yearly average: 90%'));
  assert.ok(text.includes('Result: PASS'));
  assert.ok(text.includes('Teacher remarks:'));
  assert.ok(text.includes('Administrator remarks:'));
  assert.ok(text.includes('Class Teacher'));
  assert.ok(text.includes('Principal'));
  assert.ok(text.includes('Official School Seal'));
});

test('report card prints school headers, footers, and configured grade labels', () => {
  const page = buildReportCardPdfPage({
    school: {
      ...school,
      reportCardHeader: 'Knowledge is Light',
      reportCardFooter: 'Verify at the school office',
      gradingScale: [{ minPercentage: 90, label: 'A+' }, { minPercentage: 75, label: 'B' }, { minPercentage: 0, label: 'F' }]
    },
    design,
    className: 'Grade 10 A',
    result,
    totalStudents: 24
  });
  const text = page.lines.join('\n');
  assert.ok(text.includes('Knowledge is Light'));
  assert.ok(text.includes('Verify at the school office'));
  assert.ok(text.includes('| A+'));
  assert.ok(text.includes('Yearly average: 90% | Grade: A+'));
});
test('report card embeds background, logo, signature, and stamp images', () => {
  const page = buildReportCardPdfPage({ school, design, className: 'Grade 10 A', result, totalStudents: 24 });
  assert.equal(page.images?.length, 4);
  const positions = page.images!.map(asset => `${asset.x},${asset.y},${asset.width},${asset.height}`);
  assert.deepEqual(positions, ['0,0,595,842', '275.5,780,44,44', '56,78,120,42', '468,68,82,82']);
});

test('hidden report card blocks remove text and images while invalid image URLs are not embedded', () => {
  const hidden: ReportCardDesign = {
    ...design,
    stampImageUrl: 'https://example.test/stamp.png',
    signatureImageUrl: 'https://example.test/signature.png',
    visibleBlocks: { rank: false, teacherRemarks: false, adminRemarks: false, percentage: false, signatures: false, stamp: false }
  };
  const page = buildReportCardPdfPage({ school, design: hidden, className: 'Grade 10 A', result, totalStudents: 24 });
  const text = page.lines.join('\n');
  assert.ok(!text.includes('Class rank:'));
  assert.ok(!text.includes('Teacher remarks:'));
  assert.ok(!text.includes('Administrator remarks:'));
  assert.ok(!text.includes('Yearly average:'));
  assert.ok(!text.includes('Official School Seal'));
  assert.ok(!text.includes('Class Teacher'));
  assert.equal(page.images?.length, 2);
  assert.ok(page.images!.every(asset => asset.dataUrl.startsWith('data:image/png;base64,')));
});

test('report card PDF output escapes user text and renders a full page', () => {
  const page = buildReportCardPdfPage({
    school: { ...school, name: 'Al Noor (Main) \\ Campus' },
    design,
    className: 'Grade 10 A',
    result,
    totalStudents: 24
  });
  const source = createPdf([page]).toString('ascii');
  assert.match(source, /\/Type \/Pages \/Kids \[3 0 R\] \/Count 1/);
  assert.ok(source.includes('(Al Noor \\(Main\\) \\\\ Campus) Tj'));
  assert.ok(source.includes('/Subtype /Image'));
  assert.ok(source.endsWith('%%EOF'));
});

test('report card design sanitizer whitelists fields and rejects unsafe values', () => {
  const updates = sanitizeReportCardDesign({
    id: 'forged',
    schoolId: 'other-school',
    templateId: 'classic',
    primaryColor: '#0f766e',
    secondaryColor: ' #112233 ',
    logoPosition: 'right',
    titleText: '  Academic Record  ',
    signatureTitleLeft: 'Teacher',
    signatureTitleRight: 'Principal',
    stampImageUrl: image,
    signatureImageUrl: '',
    ownDesignImageUrl: 'https://example.test/background.png',
    visibleBlocks: { rank: false, teacherRemarks: true, adminRemarks: true, percentage: true, signatures: true, stamp: false },
    ignoredField: 'drop me'
  });
  assert.equal((updates as any).id, undefined);
  assert.equal((updates as any).schoolId, undefined);
  assert.equal((updates as any).ignoredField, undefined);
  assert.equal(updates.templateId, 'classic');
  assert.equal(updates.primaryColor, '#0F766E');
  assert.equal(updates.secondaryColor, '#112233');
  assert.equal(updates.logoPosition, 'right');
  assert.equal(updates.titleText, 'Academic Record');
  assert.equal(updates.stampImageUrl, image);
  assert.equal(updates.signatureImageUrl, '');
  assert.equal(updates.ownDesignImageUrl, 'https://example.test/background.png');
  assert.deepEqual(updates.visibleBlocks, { rank: false, teacherRemarks: true, adminRemarks: true, percentage: true, signatures: true, stamp: false });
});

test('report card design sanitizer rejects invalid templates, colors, blocks, and image schemes', () => {
  assert.throws(() => sanitizeReportCardDesign({ templateId: 'hacker' }), /templateId/);
  assert.throws(() => sanitizeReportCardDesign({ primaryColor: 'red' }), /primaryColor/);
  assert.throws(() => sanitizeReportCardDesign({ logoPosition: 'middle' }), /logoPosition/);
  assert.throws(() => sanitizeReportCardDesign({ titleText: '   ' }), /titleText/);
  assert.throws(() => sanitizeReportCardDesign({ visibleBlocks: { rank: 'yes' } }), /visibleBlocks.rank/);
  assert.throws(() => sanitizeReportCardDesign({ stampImageUrl: 'javascript:alert(1)' }), /stampImageUrl/);
  assert.throws(() => sanitizeReportCardDesign({ signatureImageUrl: 'data:image/svg+xml;base64,AAAA' }), /signatureImageUrl/);
  assert.throws(() => sanitizeReportCardDesign([] as any), /must be an object/);
});
