import { prisma } from '@/lib/prisma';

import { validateSessionToken } from './session';

export type DentistPublic = {
  id: string;
  email: string;
  fullName: string;
};

export async function requireDentistPageSession(
  token: string | undefined,
): Promise<DentistPublic | null> {
  if (!token) return null;

  const result = await validateSessionToken(prisma, token);
  if (!result) return null;

  const dentist = await prisma.dentist.findUnique({
    where: { id: result.session.dentistId },
    select: { id: true, email: true, fullName: true },
  });

  return dentist;
}

export async function resolveLoginPage(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const result = await validateSessionToken(prisma, token);
    if (!result) return null;
    return '/agenda';
  } catch {
    return null;
  }
}
