import { describe, expect, it } from 'vitest';

import {
  computeInitialExpiry,
  computeRenewedExpiry,
  isSessionExpired,
  shouldTouch,
} from '../../src/server/auth/expiry';

describe('auth-expiry', () => {
  it('calcula la expiración inicial a 30 minutos', () => {
    const now = new Date('2026-01-01T10:00:00.000Z');
    expect(computeInitialExpiry(now).getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it('renueva solo después del intervalo de 5 minutos', () => {
    const createdAt = new Date('2026-01-01T09:00:00.000Z');
    const lastUsedAt = new Date('2026-01-01T09:56:00.000Z');
    const expiresAt = new Date('2026-01-01T10:26:00.000Z');
    const now = new Date('2026-01-01T09:58:00.000Z');

    const session = { createdAt, lastUsedAt, expiresAt, revokedAt: null };
    expect(shouldTouch(session, now)).toBe(false);
    expect(computeRenewedExpiry(session, now).getTime()).toBe(expiresAt.getTime());
  });

  it('extiende la expiración sin superar el tope absoluto', () => {
    const createdAt = new Date('2026-01-01T09:00:00.000Z');
    const lastUsedAt = new Date('2026-01-01T09:50:00.000Z');
    const expiresAt = new Date('2026-01-01T10:20:00.000Z');
    const now = new Date('2026-01-01T09:56:00.000Z');

    const session = { createdAt, lastUsedAt, expiresAt, revokedAt: null };
    expect(shouldTouch(session, now)).toBe(true);
    const renewed = computeRenewedExpiry(session, now);
    expect(renewed.getTime()).toBeLessThanOrEqual(createdAt.getTime() + 12 * 60 * 60 * 1000);
    expect(renewed.getTime()).toBeGreaterThan(expiresAt.getTime());
  });

  it('marca como expirada una sesión vencida o revocada', () => {
    const now = new Date('2026-01-01T10:31:00.000Z');
    const session = {
      createdAt: new Date('2026-01-01T09:00:00.000Z'),
      lastUsedAt: new Date('2026-01-01T10:00:00.000Z'),
      expiresAt: new Date('2026-01-01T10:30:00.000Z'),
      revokedAt: null,
    };
    expect(isSessionExpired(session, now)).toBe(true);
  });
});
