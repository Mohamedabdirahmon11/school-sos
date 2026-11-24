/**
 * Small bounded promise cache for school-scoped readiness checks.
 * Failed loads are never cached; invalidation also prevents an in-flight result
 * from being reused by requests that start after a successful mutation.
 */
type CacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

export class SchoolReadinessCache<T> {
  private entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 500
  ) {}

  get(schoolId: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(schoolId);
    if (cached && cached.expiresAt > this.now()) return cached.promise;
    if (cached) this.entries.delete(schoolId);

    const entry: CacheEntry<T> = {
      expiresAt: this.now() + this.ttlMs,
      promise: Promise.resolve().then(load)
    };
    this.entries.set(schoolId, entry);
    entry.promise.catch(() => {
      if (this.entries.get(schoolId) === entry) this.entries.delete(schoolId);
    });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return entry.promise;
  }

  invalidate(schoolId: string): void {
    this.entries.delete(schoolId);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
