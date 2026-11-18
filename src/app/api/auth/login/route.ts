import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AuditActorType, AuditAction } from '@/generated/prisma/client';

import { SESSION_COOKIE_NAME } from '@/server/auth/constants';
import { LOGIN_RATE_LIMIT_MAX_FAILURES, MAX_LOGIN_BODY_BYTES } from '@/server/auth/constants';
import { authenticateDentist } from '@/server/auth/authenticate';
import { clearedSessionCookieOptions, sessionCookieOptions } from '@/server/auth/cookie';
import {
  extractClientIp,
  hasJsonContentType,
  hasValidOrigin,
  readRequestBodyWithLimit,
} from '@/server/auth/request';
import { getLoginRateLimiter } from '@/server/auth/rate-limit';
import { recordAuthAudit } from '@/server/auth/audit';
import { createSession, cleanupExpiredSessions } from '@/server/auth/session';
import { loginSchema } from '@/server/auth/schemas';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', ...headers } },
  );
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) {
    return jsonError(403, 'Origen no permitido.');
  }

  if (!hasJsonContentType(request)) {
    return jsonError(415, 'Content-Type debe ser application/json.');
  }

  const ip = extractClientIp(request.headers);
  const rateLimiter = getLoginRateLimiter();
  const rateCheck = rateLimiter.check(ip ?? 'unknown');
  if (!rateCheck.allowed) {
    return jsonError(429, 'Demasiados intentos. Intentá más tarde.', {
      'Retry-After': String(rateCheck.retryAfterSeconds),
    });
  }

  const bodyResult = await readRequestBodyWithLimit(request, MAX_LOGIN_BODY_BYTES);
  if (!bodyResult.ok) {
    return jsonError(413, 'El cuerpo de la solicitud es demasiado grande.');
  }

  let parsedBody: unknown;
  try {
    parsedBody = bodyResult.text === '' ? null : JSON.parse(bodyResult.text);
  } catch {
    return jsonError(400, 'Solicitud inválida.');
  }

  const validation = loginSchema.safeParse(parsedBody);
  if (!validation.success) {
    return jsonError(400, 'Solicitud inválida.');
  }

  const { email, password } = validation.data;

  const result = await authenticateDentist({ email, password });

  if (!result.ok || !result.dentist) {
    rateLimiter.recordFailure(ip ?? 'unknown');

    // Best-effort audit only for existing accounts.
    const existingDentist = await prisma.dentist.findUnique({ where: { email } });
    if (existingDentist) {
      try {
        await recordAuthAudit(prisma, {
          actorType: AuditActorType.DENTIST,
          actorRef: existingDentist.id,
          action: AuditAction.LOGIN_FAILED,
          entity: 'Dentist',
          entityId: existingDentist.id,
          ip,
        });
      } catch {
        console.error('No se pudo registrar la auditoría de login fallido.');
      }
    }

    return jsonError(401, 'Email o contraseña incorrectos.');
  }

  const dentist = result.dentist;

  // Best-effort cleanup; never blocks login.
  try {
    await cleanupExpiredSessions(prisma, new Date());
  } catch {
    // Ignore.
  }

  const token = await (async () => {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const session = await createSession(
          tx as unknown as import('@/generated/prisma/client').PrismaClient,
          dentist.id,
          new Date(),
        );
        await recordAuthAudit(tx as never, {
          actorType: AuditActorType.DENTIST,
          actorRef: dentist.id,
          action: AuditAction.LOGIN,
          entity: 'DentistSession',
          entityId: session.session.id,
          ip,
        });
        return session;
      });
      return created.token;
    } catch {
      return null;
    }
  })();

  if (!token) {
    return jsonError(500, 'No se pudo iniciar sesión.');
  }

  rateLimiter.reset(ip ?? 'unknown');

  const response = NextResponse.json(
    { dentist: { id: dentist.id, fullName: dentist.fullName, email: dentist.email } },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );

  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());

  return response;
}
