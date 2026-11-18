import { describe, expect, it } from 'vitest';

import { sanitizeNext } from '../../src/server/auth/schemas';

describe('auth-redirect', () => {
  it('acepta rutas relativas válidas', () => {
    expect(sanitizeNext('/agenda')).toBe('/agenda');
    expect(sanitizeNext('/agenda?x=1')).toBe('/agenda?x=1');
  });

  it('rechaza redirecciones abiertas', () => {
    expect(sanitizeNext('//evil.com')).toBe('/agenda');
    expect(sanitizeNext('https://evil.com')).toBe('/agenda');
    expect(sanitizeNext('/\\evil')).toBe('/agenda');
    expect(sanitizeNext('')).toBe('/agenda');
  });
});
