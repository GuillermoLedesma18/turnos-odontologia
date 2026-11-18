import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { extractClientIp, hasValidOrigin, hasJsonContentType } from '../../src/server/auth/request';

describe('auth-request', () => {
  it('extrae una IP válida de los headers de proxy', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(extractClientIp(headers)).toBe('203.0.113.9');
  });

  it('devuelve null para headers inválidos', () => {
    const headers = new Headers({ 'x-forwarded-for': 'no-es-ip' });
    expect(extractClientIp(headers)).toBeNull();
  });

  it('valida el origen contra la URL del request', () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(hasValidOrigin(request)).toBe(true);

    const cross = new NextRequest('http://localhost:3000/api/auth/login', {
      headers: { origin: 'https://evil.example' },
    });
    expect(hasValidOrigin(cross)).toBe(false);
  });

  it('detecta content-type JSON', () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    expect(hasJsonContentType(request)).toBe(true);
  });
});
