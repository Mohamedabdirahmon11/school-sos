export interface MarkSchemeMaximums {
  small: number;
  big: number;
  total: number;
}

/**
 * Resolve the denominator from the immutable assessment scheme saved with a
 * mark. Legacy rows without a snapshot use the supplied compatibility totals.
 */
export function getMarkSchemeMaximums(
  snapshot: Array<{ category?: string; maxMarks?: number }> | null | undefined,
  fallbackSmall = 0,
  fallbackBig = 0
): MarkSchemeMaximums {
  if (!Array.isArray(snapshot) || snapshot.length === 0) {
    const small = Number.isFinite(fallbackSmall) ? Math.max(0, fallbackSmall) : 0;
    const big = Number.isFinite(fallbackBig) ? Math.max(0, fallbackBig) : 0;
    return { small, big, total: small + big };
  }

  const small = snapshot
    .filter(component => component.category === 'continuous')
    .reduce((sum, component) => sum + (Number.isFinite(component.maxMarks) ? Math.max(0, Number(component.maxMarks)) : 0), 0);
  const big = snapshot
    .filter(component => component.category === 'final')
    .reduce((sum, component) => sum + (Number.isFinite(component.maxMarks) ? Math.max(0, Number(component.maxMarks)) : 0), 0);
  return { small, big, total: small + big };
}

export interface SemesterRankCandidate {
  isComplete: boolean;
  averagePercentage: number;
  rank: number;
  isTopThree: boolean;
}

/** Competition ranking: ties share a rank; incomplete rows remain unranked. */
export function assignSemesterRanks<T extends SemesterRankCandidate>(rows: T[]): T[] {
  const ordered = [...rows].sort((a, b) =>
    Number(b.isComplete) - Number(a.isComplete) ||
    b.averagePercentage - a.averagePercentage
  );
  let completed = 0;
  let previousAverage: number | null = null;
  let previousRank = 0;
  for (const row of ordered) {
    row.rank = 0;
    row.isTopThree = false;
    if (!row.isComplete) continue;
    completed += 1;
    if (previousAverage !== null && row.averagePercentage === previousAverage) {
      row.rank = previousRank;
    } else {
      row.rank = completed;
      previousRank = completed;
      previousAverage = row.averagePercentage;
    }
    row.isTopThree = row.rank > 0 && row.rank <= 3;
  }
  return ordered;
}
