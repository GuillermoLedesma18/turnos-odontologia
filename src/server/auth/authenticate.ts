import { prisma } from '@/lib/prisma';

import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';

export type DentistRecord = {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
};

export type AuthenticateResult =
  { dentist: DentistRecord; ok: true } | { dentist: null; ok: false };

export async function findDentistByEmail(email: string): Promise<DentistRecord | null> {
  const dentist = await prisma.dentist.findUnique({ where: { email } });
  if (!dentist) return null;
  return {
    id: dentist.id,
    email: dentist.email,
    fullName: dentist.fullName,
    passwordHash: dentist.passwordHash,
  };
}

export async function authenticateDentist(options: {
  email: string;
  password: string;
  verify?: (hashValue: string, password: string) => Promise<boolean>;
  findDentist?: (email: string) => Promise<DentistRecord | null>;
}): Promise<AuthenticateResult> {
  const verify = options.verify ?? verifyPassword;
  const findDentist = options.findDentist ?? findDentistByEmail;

  const dentist = await findDentist(options.email);
  if (!dentist) {
    await verify(DUMMY_PASSWORD_HASH, options.password);
    return { dentist: null, ok: false };
  }

  const valid = await verify(dentist.passwordHash, options.password);
  if (!valid) return { dentist: null, ok: false };

  return { dentist, ok: true };
}
