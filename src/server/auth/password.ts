import { verify } from '@node-rs/argon2';

/**
 * Hash ficticio Argon2id con los parámetros de C-02. No es una credencial y solo
 * sirve para que el camino de email inexistente ejecute un `verify` real.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AQEBAQEBAQEBAQEBAQEBAQ$Mn7TmnkCjBH5RVIVz2RuVLZtUF5YEgt4i8O1O+y5Prk';

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}
