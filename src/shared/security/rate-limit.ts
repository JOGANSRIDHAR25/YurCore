import "server-only";

/**
 * Best-effort in-memory sliding-window rate limiter.
 *
 * This process holds the counters, so it only protects a single running
 * instance — it resets on redeploy and does not share state across
 * horizontally-scaled instances/pods. That's an acceptable first layer for
 * this app's current single-instance deployment, but if this ever runs on
 * multiple instances (e.g. serverless with concurrent invocations), replace
 * the Map below with a shared store (Redis/Upstash) behind the same
 * `checkRateLimit` signature — no caller needs to change.
 */

type Bucket = {
  count: number;
  windowStart: number;
};

const buckets = new Map<string, Bucket>();

// Periodically drop stale buckets so this doesn't grow unbounded over the
// life of the process.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > SWEEP_INTERVAL_MS) {
      buckets.delete(key);
    }
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * @param key Unique bucket key, e.g. `otp:send:${ip}:${email}`
 * @param limit Max requests allowed per window
 * @param windowSeconds Window length in seconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const windowMs = windowSeconds * 1000;
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil(
      (existing.windowStart + windowMs - now) / 1000,
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}
