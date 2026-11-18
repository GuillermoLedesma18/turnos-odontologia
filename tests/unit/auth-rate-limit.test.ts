import { describe, expect, it } from 'vitest';

import { createLoginRateLimiter } from '../../src/server/auth/rate-limit';

describe('auth-rate-limit', () => {
  it('bloquea después de 5 fallos y calcula Retry-After', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    const limiter = createLoginRateLimiter({ now: () => now, maxEntries: 100, sweepIntervalMs: 0 });

    for (let i = 0; i < 5; i += 1) {
      expect(limiter.check('1.1.1.1', now).allowed).toBe(true);
      limiter.recordFailure('1.1.1.1', now);
    }

    const blocked = limiter.check('1.1.1.1', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('reinicia el contador con un login exitoso', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    const limiter = createLoginRateLimiter({ now: () => now, maxEntries: 100, sweepIntervalMs: 0 });

    limiter.recordFailure('1.1.1.1', now);
    limiter.reset('1.1.1.1');
    expect(limiter.check('1.1.1.1', now).allowed).toBe(true);
  });

  it('mantiene IPs independientes', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    const limiter = createLoginRateLimiter({ now: () => now, maxEntries: 100, sweepIntervalMs: 0 });

    for (let i = 0; i < 5; i += 1) limiter.recordFailure('1.1.1.1', now);
    expect(limiter.check('2.2.2.2', now).allowed).toBe(true);
  });

  it('limpia entradas expiradas', () => {
    const base = new Date('2026-01-01T10:00:00.000Z');
    const limiter = createLoginRateLimiter({
      now: () => base,
      maxEntries: 100,
      sweepIntervalMs: 0,
    });

    limiter.recordFailure('1.1.1.1', base);
    const later = new Date(base.getTime() + 16 * 60 * 1000);
    expect(limiter.check('1.1.1.1', later).allowed).toBe(true);
    expect(limiter.size).toBe(0);
  });

  it('respeta la capacidad máxima', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    const limiter = createLoginRateLimiter({ now: () => now, maxEntries: 2, sweepIntervalMs: 0 });

    limiter.recordFailure('1.1.1.1', now);
    limiter.recordFailure('2.2.2.2', now);
    limiter.recordFailure('3.3.3.3', now);

    expect(limiter.size).toBe(2);
  });
});
