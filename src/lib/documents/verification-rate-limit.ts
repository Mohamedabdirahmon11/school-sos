export type VerificationRateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };

export class VerificationRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit = 120,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxKeys = 10_000
  ) {}

  consume(key: string, now = Date.now()): VerificationRateLimitDecision {
    const normalizedKey = key.trim().slice(0, 160) || 'unknown';
    let bucket = this.buckets.get(normalizedKey);

    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) {
        for (const [candidate, value] of this.buckets) {
          if (value.resetAt <= now) this.buckets.delete(candidate);
        }
        if (this.buckets.size >= this.maxKeys) {
          const oldest = this.buckets.keys().next().value;
          if (oldest !== undefined) this.buckets.delete(oldest);
        }
      }
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(normalizedKey, bucket);
    }

    if (bucket.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export const documentVerificationRateLimiter = new VerificationRateLimiter();
