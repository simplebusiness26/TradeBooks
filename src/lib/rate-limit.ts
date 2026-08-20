import { env } from '@/lib/env';
import { RateLimitError } from '@/lib/errors';

type Bucket = { count: number; resetAt: number };

/**
 * In-process fixed-window rate limiter for sensitive endpoints.
 *
 * This protects a single instance. A multi-instance deployment should put a
 * shared store (Redis) behind the same interface — see CONNECTIONS_REQUIRED.md.
 */
const buckets = new Map<string, Bucket>();

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  signIn: { limit: 8, windowMs: 10 * 60 * 1000 },
  signUp: { limit: 5, windowMs: 60 * 60 * 1000 },
  upload: { limit: 120, windowMs: 60 * 60 * 1000 },
  import: { limit: 30, windowMs: 60 * 60 * 1000 },
  export: { limit: 60, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;

export function checkRateLimit(key: string, rule: RateLimitRule): void {
  if (env().DISABLE_RATE_LIMIT) return;

  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    pruneOccasionally(now);
    return;
  }

  if (existing.count >= rule.limit) {
    const seconds = Math.ceil((existing.resetAt - now) / 1000);
    throw new RateLimitError(
      `Too many attempts. Please try again in ${seconds > 60 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`}.`,
    );
  }

  existing.count += 1;
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

let lastPrune = 0;
function pruneOccasionally(now: number): void {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
