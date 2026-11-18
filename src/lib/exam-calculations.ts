export interface ExamAssessmentPart {
  id: string;
  name: string;
  maxMarks: number;
  category?: 'continuous' | 'final';
  order?: number;
}

export interface ExamSubjectResult {
  subjectId: string;
  score: number | null;
  max: number;
}

export interface ExamStudentResult {
  studentId: string;
  total: number;
  average: number;
  subjectCount: number;
  complete: boolean;
  rank: number | null;
}

/** Returns null until every configured component has a saved numeric mark. */
export function calculateExamSubjectTotal(
  scores: Record<string, number | undefined> | null | undefined,
  parts: readonly ExamAssessmentPart[]
): number | null {
  if (!parts.length || !scores) return null;
  let total = 0;
  for (const part of parts) {
    const value = scores[part.id];
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > part.maxMarks) return null;
    total += value;
  }
  return total;
}

/** Totals include only active subjects; an incomplete active subject blocks ranking. */
export function calculateExamStudentResult(
  subjects: readonly ExamSubjectResult[]
): Omit<ExamStudentResult, 'studentId' | 'rank'> {
  const entered = subjects.filter(subject => subject.score !== null);
  const complete = subjects.length > 0 && entered.length === subjects.length;
  const total = entered.reduce((sum, subject) => sum + (subject.score || 0), 0);
  return {
    total,
    average: entered.length ? total / entered.length : 0,
    subjectCount: entered.length,
    complete
  };
}

/** Competition ranking: ties share a rank and the next rank skips the tied places. */
export function rankExamStudentResults<T extends { studentId: string; total: number; complete: boolean }>(
  rows: readonly T[]
): Array<T & { rank: number | null }> {
  if (!rows.length || rows.some(row => !row.complete)) {
    return rows.map(row => ({ ...row, rank: null }));
  }
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.studentId.localeCompare(b.studentId));
  const ranks = new Map<string, number>();
  let previousTotal: number | null = null;
  let previousRank = 0;
  sorted.forEach((row, index) => {
    if (previousTotal === null || row.total !== previousTotal) previousRank = index + 1;
    ranks.set(row.studentId, previousRank);
    previousTotal = row.total;
  });
  return rows.map(row => ({ ...row, rank: ranks.get(row.studentId) ?? null }));
}

/** A final subject score is available only when both term scores exist. */
export function calculateFinalSubjectScore(term1: number | null, term2: number | null): number | null {
  if (term1 === null || term2 === null || !Number.isFinite(term1) || !Number.isFinite(term2)) return null;
  return (term1 + term2) / 2;
}

export function formatExamScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
