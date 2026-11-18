import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { AuditActorType, AuditAction } from '@/generated/prisma/client';

import { extractClientIp, hasValidOrigin } from '@/server/auth/request';
import { findSessionByToken, revokeSessionByToken } from '@/server/auth/session';
import { recordAuthAudit } from '@/server/auth/audit';
import { SESSION_COOKIE_NAME } from '@/server/auth/constants';
import { clearedSessionCookieOptions } from '@/server/auth/cookie';

export const dynamic = 'force-dynamic';

function clearedResponse() {
  const response = new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
  response.cookies.set(SESSION_COOKIE_NAME, '', clearedSessionCookieOptions());
  return response;
}

export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json(
      { error: 'Origen no permitido.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const token = request.cookies.get('turnos_session')?.value;
  const now = new Date();
  const ip = extractClientIp(request.headers);

  if (token) {
    try {
      const session = await findSessionByToken(prisma, token);
      if (session && session.revokedAt === null) {
        await prisma.dentistSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
        try {
          await recordAuthAudit(prisma, {
            actorType: AuditActorType.DENTIST,
            actorRef: session.dentistId,
            action: AuditAction.LOGOUT,
            entity: 'DentistSession',
            entityId: session.id,
            ip,
          });
        } catch {
          console.error('No se pudo registrar la auditoría de logout.');
        }
      } else if (session && session.revokedAt !== null) {
        // Idempotent: already revoked, no new audit event.
      }
    } catch {
      // Revocation failed; still clear the client cookie.
    }
    // Ensure token cannot be reused even if find/update path differed.
    try {
      await revokeSessionByToken(prisma, token, now);
    } catch {
      // Ignore.
    }
  }

  return clearedResponse();
}
