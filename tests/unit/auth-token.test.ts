import { describe, expect, it } from 'vitest';

import {
  generateSessionToken,
  hashSessionToken,
  isValidSessionToken,
  SESSION_TOKEN_BYTES,
  SESSION_TOKEN_LENGTH,
} from '../../src/server/auth/token';

describe('auth-token', () => {
  it('genera un token base64url de 32 bytes', () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(SESSION_TOKEN_LENGTH);
    expect(isValidSessionToken(token)).toBe(true);
  });

  it('hashea de forma determinista con SHA-256 de 64 hex', () => {
    const token = generateSessionToken();
    const first = hashSessionToken(token);
    const second = hashSessionToken(token);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('genera tokens distintos', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it('rechaza tokens manipulados o con longitud incorrecta', () => {
    expect(isValidSessionToken('')).toBe(false);
    expect(isValidSessionToken('abc')).toBe(false);
    expect(isValidSessionToken(`${'a'.repeat(43)}`)).toBe(true);
    expect(isValidSessionToken(`${'a'.repeat(42)}=`)).toBe(false);
  });

  it('la constante de bytes es 32', () => {
    expect(SESSION_TOKEN_BYTES).toBe(32);
  });
});
