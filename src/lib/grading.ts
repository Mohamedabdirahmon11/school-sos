import type { GradingBand } from '../types/index.ts';

export function getGradeBand(percentage: number | null | undefined, gradingScale?: GradingBand[]): GradingBand | null {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
  if (!Array.isArray(gradingScale) || gradingScale.length === 0) return null;
  const bands = [...gradingScale].sort((a, b) => b.minPercentage - a.minPercentage);
  return bands.find(band => percentage >= band.minPercentage) || null;
}

export function getGradeLabel(percentage: number | null | undefined, gradingScale?: GradingBand[]): string {
  return getGradeBand(percentage, gradingScale)?.label || '—';
}
