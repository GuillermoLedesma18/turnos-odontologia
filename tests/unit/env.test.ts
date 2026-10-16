import { describe, expect, it, vi } from 'vitest';

import { loadEnv } from '@/lib/env';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://turnos:turnos@localhost:5432/turnos',
};

describe('loadEnv', () => {
  it('devuelve la configuración validada y tipada cuando el entorno es válido', () => {
    const env = loadEnv(VALID_ENV);

    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.TZ_CONSULTORIO).toBeUndefined();
  });

  it('no arranca si falta una variable requerida y el error nombra la variable', () => {
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL/);
  });

  it('no arranca si una variable requerida tiene formato inválido', () => {
    expect(() => loadEnv({ DATABASE_URL: 'no-es-una-url' })).toThrowError(/DATABASE_URL/);
  });

  it('no arranca si DATABASE_URL no apunta a PostgreSQL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost:3306/turnos' })).toThrowError(
      /DATABASE_URL/,
    );
  });

  it('acepta una variable opcional ausente', () => {
    expect(loadEnv(VALID_ENV).APP_BASE_URL).toBeUndefined();
    expect(loadEnv(VALID_ENV).SESSION_SECRET).toBeUndefined();
  });

  it('acepta variables opcionales presentes y válidas', () => {
    const env = loadEnv({
      ...VALID_ENV,
      APP_BASE_URL: 'http://localhost:3000',
      TZ_CONSULTORIO: 'America/Argentina/Buenos_Aires',
      SESSION_SECRET: 'un-secreto-de-desarrollo-suficientemente-largo',
    });

    expect(env.TZ_CONSULTORIO).toBe('America/Argentina/Buenos_Aires');
  });

  it('no arranca si una variable opcional está presente con formato inválido', () => {
    expect(() => loadEnv({ ...VALID_ENV, TZ_CONSULTORIO: 'Marte/Olympus' })).toThrowError(
      /TZ_CONSULTORIO/,
    );
    expect(() => loadEnv({ ...VALID_ENV, APP_BASE_URL: 'no-es-una-url' })).toThrowError(
      /APP_BASE_URL/,
    );
  });

  it('nombra la variable sensible inválida sin filtrar su valor', () => {
    const secret = 'secreto-corto-de-prueba';

    let message = '';
    try {
      loadEnv({ ...VALID_ENV, SESSION_SECRET: secret });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain(secret);
  });

  it('no filtra la cadena de conexión cuando DATABASE_URL es inválida', () => {
    const connectionString = 'postgresql://usuario:clave-secreta@localhost:5432/turnos';
    const broken = `${connectionString} `.trim().replace('postgresql', 'postgrsql');

    let message = '';
    try {
      loadEnv({ DATABASE_URL: broken });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('clave-secreta');
  });

  it('falla al importar el módulo si falta una variable requerida (arranque)', async () => {
    vi.resetModules();
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      await expect(import('@/lib/env')).rejects.toThrowError(/DATABASE_URL/);
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });
});
