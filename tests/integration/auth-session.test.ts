import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST as loginPOST } from '../../src/app/api/auth/login/route';
import { GET as meGET } from '../../src/app/api/auth/me/route';
import { POST as logoutPOST } from '../../src/app/api/auth/logout/route';
import { seed } from '../../prisma/seed';
import { cleanupAll } from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';
import { SESSION_COOKIE_NAME } from '../../src/server/auth/constants';

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

async function login() {
  const request = new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  });
  const response = await loginPOST(request);
  return response.cookies.get(SESSION_COOKIE_NAME)?.value ?? '';
}

describe('auth session', () => {
  it('consulta la sesión actual con cookie válida', async () => {
    const token = await login();
    const request = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const response = await meGET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.dentist.email).toBe(DEV_EMAIL);
    expect(body.dentist).not.toHaveProperty('phone');
  });

  it('rechaza /me sin cookie', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/me');
    const response = await meGET(request);
    expect(response.status).toBe(401);
  });

  it('rechaza token manipulado', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=token-invalido` },
    });
    const response = await meGET(request);
    expect(response.status).toBe(401);
  });

  it('cierra sesión y revoca el token', async () => {
    const token = await login();
    const logoutRequest = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const logoutResponse = await logoutPOST(logoutRequest);
    expect(logoutResponse.status).toBe(204);

    const meRequest = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const meResponse = await meGET(meRequest);
    expect(meResponse.status).toBe(401);
  });

  it('logout es idempotente', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    const response = await logoutPOST(request);
    expect(response.status).toBe(204);
  });

  it('no revoca otras sesiones del mismo odontólogo', async () => {
    const token1 = await login();
    const token2 = await login();

    const logoutRequest = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: `${SESSION_COOKIE_NAME}=${token1}` },
    });
    await logoutPOST(logoutRequest);

    const meRequest = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token2}` },
    });
    const meResponse = await meGET(meRequest);
    expect(meResponse.status).toBe(200);
  });
});
