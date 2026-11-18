import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST as loginPOST } from '../../src/app/api/auth/login/route';
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

describe('auth audit', () => {
  it('registra LOGIN al iniciar sesión', async () => {
    const response = await loginPOST(
      new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
      }),
    );
    expect(response.status).toBe(200);
    const audits = await testPrisma.auditLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('LOGIN');
  });

  it('registra LOGIN_FAILED solo para cuenta existente', async () => {
    await loginPOST(
      new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: DEV_EMAIL, password: 'incorrecta' }),
      }),
    );
    expect(await testPrisma.auditLog.count()).toBe(1);

    await loginPOST(
      new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'no-existe@example.com', password: 'incorrecta' }),
      }),
    );
    expect(await testPrisma.auditLog.count()).toBe(1);
  });

  it('registra LOGOUT al cerrar sesión', async () => {
    const loginResponse = await loginPOST(
      new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
      }),
    );
    const token = loginResponse.cookies.get(SESSION_COOKIE_NAME)?.value ?? '';

    await logoutPOST(
      new NextRequest('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', cookie: `${SESSION_COOKIE_NAME}=${token}` },
      }),
    );

    const actions = (await testPrisma.auditLog.findMany()).map((row) => row.action);
    expect(actions).toContain('LOGOUT');
  });
});
