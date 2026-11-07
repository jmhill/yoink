import { decideRateLimitConsume } from './rate-limit-policy.js';

export type RateLimitConsume = (userId: string) => {
  limited: boolean;
  retryAfterSeconds: number;
};

export type InMemoryRateLimitConsumeOptions = {
  max: number;
  windowMs: number;
  now: () => number;
};

/**
 * Shell store for the post-auth user limiter. Decision is pure
 * (`decideRateLimitConsume`); this only holds bucket snapshots.
 */
export const createInMemoryRateLimitConsume = (
  options: InMemoryRateLimitConsumeOptions
): RateLimitConsume => {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (userId) => {
    const current = buckets.get(userId) ?? { count: 0, resetAt: 0 };
    const decided = decideRateLimitConsume({
      count: current.count,
      resetAt: current.resetAt,
      nowMs: options.now(),
      max: options.max,
      windowMs: options.windowMs,
    });
    buckets.set(userId, { count: decided.nextCount, resetAt: decided.nextResetAt });
    return {
      limited: decided.limited,
      retryAfterSeconds: decided.retryAfterSeconds,
    };
  };
};
