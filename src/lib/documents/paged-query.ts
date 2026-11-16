export type PagedResult<T> = { items: T[]; total: number };

/**
 * Collects a bounded, complete paginated query. The total is taken from the
 * first page so callers never silently truncate a roster at the first page.
 */
export async function collectPagedItems<T>(
  loadPage: (page: number, pageSize: number) => Promise<PagedResult<T>>,
  options: { pageSize?: number; maxItems?: number } = {}
): Promise<T[]> {
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 100)));
  const maxItems = Math.max(pageSize, Math.floor(options.maxItems ?? 5000));
  const items: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const result = await loadPage(page, pageSize);
    if (page === 1) total = Math.max(0, Number(result.total) || 0);
    if (!Array.isArray(result.items)) throw new TypeError('Paged query returned an invalid item list.');
    items.push(...result.items);
    if (items.length > maxItems || total > maxItems) {
      throw new RangeError('Paged query exceeded the configured item limit.');
    }
    if (result.items.length === 0) break;
    page += 1;
  } while (items.length < total);

  if (items.length < total) throw new Error('Paged query ended before all records were loaded.');
  return items;
}
