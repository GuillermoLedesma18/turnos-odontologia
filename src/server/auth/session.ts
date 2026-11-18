import { prisma } from '@/lib/prisma';
import type { PrismaClient } from '@/generated/prisma/client';

import { SESSION_CLEANUP_AFTER_MS } from './constants';
import {
  computeInitialExpiry,
  computeRenewedExpiry,
  isSessionExpired,
  shouldTouch,
} from './expiry';
import { generateSessionToken, hashSessionToken, isValidSessionToken } from './token';

export type SessionRecord = {
  id: string;
  dentistId: string;
  tokenHash: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type CreatedSession = {
  session: SessionRecord;
  token: string;
};

export async function createSession(
  prismaClient: PrismaClient,
  dentistId: string,
  now: Date = new Date(),
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  const session = (await prismaClient.dentistSession.create({
    data: {
      dentistId,
      tokenHash,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: computeInitialExpiry(now),
      revokedAt: null,
    },
  })) as SessionRecord;

  return { session, token };
}

export async function findSessionByToken(
  prismaClient: PrismaClient,
  token: string,
): Promise<SessionRecord | null> {
  if (!isValidSessionToken(token)) return null;

  const tokenHash = hashSessionToken(token);
  const session = (await prismaClient.dentistSession.findUnique({
    where: { tokenHash },
  })) as SessionRecord | null;

  return session;
}

export async function validateSessionToken(
  prismaClient: PrismaClient,
  token: string,
  now: Date = new Date(),
): Promise<{ session: SessionRecord; touched: boolean } | null> {
  const session = await findSessionByToken(prismaClient, token);
  if (!session) return null;
  if (isSessionExpired(session, now)) return null;

  let touched = false;
  if (shouldTouch(session, now)) {
    const renewed = computeRenewedExpiry(session, now);
    await prismaClient.dentistSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: renewed },
    });
    session.lastUsedAt = now;
    session.expiresAt = renewed;
    touched = true;
  }

  return { session, touched };
}

export async function revokeSessionByToken(
  prismaClient: PrismaClient,
  token: string,
  now: Date = new Date(),
): Promise<boolean> {
  const session = await findSessionByToken(prismaClient, token);
  if (!session) return false;
  if (session.revokedAt === null) {
    await prismaClient.dentistSession.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });
  }
  return true;
}

export async function cleanupExpiredSessions(
  prismaClient: PrismaClient,
  now: Date = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - SESSION_CLEANUP_AFTER_MS);
  await prismaClient.dentistSession.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { not: null, lt: cutoff } }],
    },
  });
}

export { prisma };
export const defaultPrisma = prisma;
