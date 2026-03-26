type RateLimitWindow = {
  startedAtMs: number;
  count: number;
};

const windows = new Map<string, RateLimitWindow>();

export type RateLimitOptions = {
  key: string;
  maxRequests: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  resetInSec: number;
};

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(options.key);

  if (!existing || now - existing.startedAtMs >= options.windowMs) {
    windows.set(options.key, { startedAtMs: now, count: 1 });
    return {
      allowed: true,
      remaining: Math.max(0, options.maxRequests - 1),
      retryAfterSec: Math.ceil(options.windowMs / 1000),
      resetInSec: Math.ceil(options.windowMs / 1000),
    };
  }

  if (existing.count >= options.maxRequests) {
    const retryAfterMs = options.windowMs - (now - existing.startedAtMs);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      resetInSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  existing.count += 1;
  windows.set(options.key, existing);
  const resetInSec = Math.ceil((options.windowMs - (now - existing.startedAtMs)) / 1000);
  return {
    allowed: true,
    remaining: Math.max(0, options.maxRequests - existing.count),
    retryAfterSec: resetInSec,
    resetInSec,
  };
}

export function peekRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(options.key);

  if (!existing || now - existing.startedAtMs >= options.windowMs) {
    return {
      allowed: true,
      remaining: options.maxRequests,
      retryAfterSec: Math.ceil(options.windowMs / 1000),
      resetInSec: Math.ceil(options.windowMs / 1000),
    };
  }

  const resetInSec = Math.max(1, Math.ceil((options.windowMs - (now - existing.startedAtMs)) / 1000));
  const remaining = Math.max(0, options.maxRequests - existing.count);
  return {
    allowed: remaining > 0,
    remaining,
    retryAfterSec: resetInSec,
    resetInSec,
  };
}
