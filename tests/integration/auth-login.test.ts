import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST as loginPOST } from '../../src/app/api/auth/login/route';
import { seed } from '../../prisma/seed';
import { cleanupAll } from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';

const DEV_EMAIL = 'odontologo@example.com';
const DEV_PASSWORD = 'dev-only-password';

beforeEach(async () => {
  await cleanupAll();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await seed(testPrisma);
});

afterEach(async () => {
  await cleanupAll();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

function loginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body: JSON.stringify(body),
  });
}

describe('auth login', () => {
  it('inicia sesión con credenciales válidas y crea sesión', async () => {
    const response = await loginPOST(loginRequest({ email: DEV_EMAIL, password: DEV_PASSWORD }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('turnos_session');
    const body = await response.json();
    expect(body.dentist.email).toBe(DEV_EMAIL);
    expect(await testPrisma.dentistSession.count()).toBe(1);
  });

  it('rechaza contraseña incorrecta con 401 genérico', async () => {
    const response = await loginPOST(loginRequest({ email: DEV_EMAIL, password: 'incorrecta' }));
    expect(response.status).toBe(401);
    expect(await testPrisma.dentistSession.count()).toBe(0);
  });

  it('rechaza email inexistente con el mismo estado y cuerpo', async () => {
    const wrongPassword = await loginPOST(
      loginRequest({ email: DEV_EMAIL, password: 'incorrecta' }),
    );
    const unknownEmail = await loginPOST(
      loginRequest({ email: 'no-existe@example.com', password: 'incorrecta' }),
    );

    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(await wrongPassword.text()).toBe(await unknownEmail.text());
  });

  it('devuelve 400 para payload inválido y no consume rate limit', async () => {
    const response = await loginPOST(loginRequest({ email: 'no-es-email', password: '' }));
    expect(response.status).toBe(400);
  });

  it('bloquea por rate limit después de 5 fallos', async () => {
    for (let i = 0; i < 5; i += 1) {
      await loginPOST(loginRequest({ email: DEV_EMAIL, password: 'incorrecta' }));
    }
    const response = await loginPOST(loginRequest({ email: DEV_EMAIL, password: 'incorrecta' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBeTruthy();
  });

  it('rechaza origen cruzado', async () => {
    const request = loginRequest(
      { email: DEV_EMAIL, password: DEV_PASSWORD },
      { origin: 'https://evil.example' },
    );
    const response = await loginPOST(request);
    expect(response.status).toBe(403);
  });

  it('rechaza content-type incorrecto', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'http://localhost:3000' },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
    });
    const response = await loginPOST(request);
    expect(response.status).toBe(415);
  });
});
