import { describe, expect, it } from 'vitest';

import { clearedSessionCookieOptions, sessionCookieOptions } from '../../src/server/auth/cookie';

describe('auth-cookie', () => {
  it('define los atributos de seguridad esperados', () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(12 * 60 * 60);
  });

  it('borra la cookie con expiración en el pasado', () => {
    const options = clearedSessionCookieOptions();
    expect(options.maxAge).toBe(0);
    expect(options.expires.getTime()).toBe(0);
  });
});
