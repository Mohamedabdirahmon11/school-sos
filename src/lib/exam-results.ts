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
