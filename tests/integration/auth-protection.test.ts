import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { middleware } from '../../src/middleware';
import { requireDentistPageSession, resolveLoginPage } from '../../src/server/auth/guards';
import { seed } from '../../prisma/seed';
import { cleanupAll } from '../helpers/fixtures';
import { testPrisma } from '../helpers/test-db';
import { createSession } from '../../src/server/auth/session';
import { SESSION_COOKIE_NAME } from '../../src/server/auth/constants';

const DEV_EMAIL = 'odontologo@example.com';

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

describe('auth protection', () => {
  it('el middleware redirige a /login cuando falta la cookie en una ruta privada', () => {
    const request = new NextRequest('http://localhost:3000/agenda');
    const response = middleware(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
  });

  it('el middleware no redirige cuando hay cookie', () => {
    const request = new NextRequest('http://localhost:3000/agenda', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=token` },
    });
    const response = middleware(request);
    expect(response.status).toBe(200);
  });

  it('requireDentistPageSession devuelve null sin token', async () => {
    expect(await requireDentistPageSession(undefined)).toBeNull();
  });

  it('resolveLoginPage devuelve /agenda con sesión válida', async () => {
    const dentist = await testPrisma.dentist.findUniqueOrThrow({ where: { email: DEV_EMAIL } });
    const { token } = await createSession(testPrisma, dentist.id, new Date());
    expect(await resolveLoginPage(token)).toBe('/agenda');
  });
});
