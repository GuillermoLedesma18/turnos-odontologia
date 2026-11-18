import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';

import { validateSessionToken } from '@/server/auth/session';
import { SESSION_COOKIE_NAME } from '@/server/auth/constants';
import { clearedSessionCookieOptions } from '@/server/auth/cookie';

export const dynamic = 'force-dynamic';

function jsonError(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('turnos_session')?.value;
  if (!token) {
    const response = jsonError(401, 'No autenticado.');
    response.cookies.set(SESSION_COOKIE_NAME, '', clearedSessionCookieOptions());
    return response;
  }

  try {
    const result = await validateSessionToken(prisma, token, new Date());
    if (!result) {
      const response = jsonError(401, 'No autenticado.');
      response.cookies.set(SESSION_COOKIE_NAME, '', clearedSessionCookieOptions());
      return response;
    }

    const dentist = await prisma.dentist.findUnique({
      where: { id: result.session.dentistId },
      select: { id: true, fullName: true, email: true },
    });

    if (!dentist) {
      const response = jsonError(401, 'No autenticado.');
      response.cookies.set(SESSION_COOKIE_NAME, '', clearedSessionCookieOptions());
      return response;
    }

    return NextResponse.json(
      { dentist },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return jsonError(500, 'Error interno.');
  }
}
