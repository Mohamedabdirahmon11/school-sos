export function teacherRemark(percentage: number): string {
  if (percentage >= 80) return 'Demonstrated outstanding academic performance, exemplary focus, and disciplined study habits throughout the academic year.';
  if (percentage >= 50) return 'Steady progress shown across all subjects. Recommended for sustained effort and consistent revision.';
  return 'Requires reinforced tutoring and parent consultation before promotion consideration.';
}

export function adminRemark(isPass: boolean): string {
  return isPass
    ? 'Approved for academic progression to the next grade cohort with honors.'
    : 'Academic intervention plan mandated prior to re-examination.';
}

const FALLBACK_GRADING_SCALE = [
  { minPercentage: 90, label: 'A' },
  { minPercentage: 80, label: 'B' },
  { minPercentage: 70, label: 'C' },
  { minPercentage: 60, label: 'D' },
  { minPercentage: 0, label: 'F' }
];

export function gradeLabelForPercentage(percentage: number | null | undefined, scale?: Array<{ minPercentage: number; label: string }>): string {
  if (percentage === null || percentage === undefined || !Number.isFinite(percentage)) return '-';
  const bands = (scale && scale.length ? scale : FALLBACK_GRADING_SCALE).slice().sort((a, b) => b.minPercentage - a.minPercentage);
  return bands.find(band => percentage >= band.minPercentage)?.label || bands[bands.length - 1]?.label || '-';
}

export interface ReportCardMarkSummary {
  smallExamMarks: number;
  bigExamMarks: number;
  totalMarks: number;
  percentage: number;
  status?: string;
}

export interface ReportCardMaxMarks {
  small: number;
  big: number;
  total: number;
}

export function formatReportCardMark(mark: ReportCardMarkSummary | null | undefined, maxMarks: ReportCardMaxMarks): string {
  if (!mark) return '-';
  return `${mark.smallExamMarks} + ${mark.bigExamMarks} = ${mark.totalMarks}/${maxMarks.total}`;
}

export function isEmbeddableImageSource(value?: string | null): boolean {
  return typeof value === 'string' && /^data:image\/(png|jpe?g);base64,/i.test(value);
}

export function initialsFor(name?: string, code?: string): string {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (code) return code.slice(0, 2).toUpperCase();
  return 'SC';
}
