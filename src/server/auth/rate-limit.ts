import {
  LOGIN_RATE_LIMIT_MAX_ENTRIES,
  LOGIN_RATE_LIMIT_MAX_FAILURES,
  LOGIN_RATE_LIMIT_SWEEP_INTERVAL_MS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
} from './constants';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type LoginRateLimiter = {
  check: (ip: string, now?: Date) => { allowed: boolean; retryAfterSeconds: number };
  recordFailure: (ip: string, now?: Date) => void;
  reset: (ip: string) => void;
  get size(): number;
};

export function createLoginRateLimiter(
  options: {
    now?: () => Date;
    maxEntries?: number;
    sweepIntervalMs?: number;
  } = {},
): LoginRateLimiter {
  const maxEntries = options.maxEntries ?? LOGIN_RATE_LIMIT_MAX_ENTRIES;
  const sweepIntervalMs = options.sweepIntervalMs ?? LOGIN_RATE_LIMIT_SWEEP_INTERVAL_MS;
  const nowFn = options.now ?? (() => new Date());

  const entries = new Map<string, RateLimitEntry>();
  let lastSweep = nowFn().getTime();

  function sweep(now: number): void {
    if (now - lastSweep < sweepIntervalMs && entries.size < maxEntries) {
      // Still sweep expired entries opportunistically when at capacity.
      if (entries.size < maxEntries) return;
    }

    lastSweep = now;
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) entries.delete(key);
    }
  }

  function check(ip: string, nowDate?: Date): { allowed: boolean; retryAfterSeconds: number } {
    const now = (nowDate ?? nowFn()).getTime();
    sweep(now);
    const entry = entries.get(ip);
    if (!entry || entry.resetAt <= now) {
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= LOGIN_RATE_LIMIT_MAX_FAILURES) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  function recordFailure(ip: string, nowDate?: Date): void {
    const now = (nowDate ?? nowFn()).getTime();
    sweep(now);

    const existing = entries.get(ip);
    if (!existing || existing.resetAt <= now) {
      if (entries.size >= maxEntries) {
        sweep(now);
        if (entries.size >= maxEntries) {
          let oldestKey: string | null = null;
          let oldestReset = Infinity;
          for (const [key, entry] of entries) {
            if (entry.resetAt < oldestReset) {
              oldestReset = entry.resetAt;
              oldestKey = key;
            }
          }
          if (oldestKey !== null) entries.delete(oldestKey);
        }
      }
      entries.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
      return;
    }

    existing.count += 1;
    if (existing.count >= LOGIN_RATE_LIMIT_MAX_FAILURES) {
      // Keep the original window end; do not extend it on every failure.
    }
  }

  function reset(ip: string): void {
    entries.delete(ip);
  }

  return {
    check,
    recordFailure,
    reset,
    get size() {
      return entries.size;
    },
  };
}

const globalForRateLimit = globalThis as unknown as { loginRateLimiter?: LoginRateLimiter };

export function getLoginRateLimiter(): LoginRateLimiter {
  if (!globalForRateLimit.loginRateLimiter) {
    globalForRateLimit.loginRateLimiter = createLoginRateLimiter();
  }
  return globalForRateLimit.loginRateLimiter;
}

export function resetLoginRateLimiterForTests(): void {
  globalForRateLimit.loginRateLimiter = createLoginRateLimiter();
}
