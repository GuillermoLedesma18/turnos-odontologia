import { parseOptions } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';

import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../src/server/auth/password';

describe('auth-password', () => {
  it('verifica correctamente una contraseña', async () => {
    const { hash } = await import('@node-rs/argon2');
    const passwordHash = await hash('secreto', {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
    expect(await verifyPassword(passwordHash, 'secreto')).toBe(true);
    expect(await verifyPassword(passwordHash, 'otra')).toBe(false);
  });

  it('trata un hash mal formado como credencial inválida', async () => {
    expect(await verifyPassword('no-es-un-hash', 'secreto')).toBe(false);
  });

  it('el hash ficticio tiene los parámetros de C-02', () => {
    expect(parseOptions(DUMMY_PASSWORD_HASH)).toMatchObject({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
  });
});
