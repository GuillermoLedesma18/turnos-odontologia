import { z } from 'zod';

/**
 * Configuración de entorno del proyecto.
 *
 * Único punto de lectura de `process.env`: el resto del código importa `env` de
 * acá (regla dura B7). La validación corre al importar el módulo, así que una
 * variable requerida ausente o mal formada impide el arranque en lugar de
 * propagar un `undefined` hacia la lógica de dominio.
 *
 * En C-01 la única variable requerida es `DATABASE_URL`. Las demás son
 * opcionales y pasan a requeridas junto con la funcionalidad que las usa.
 * "Opcional" significa que puede faltar, no que su valor pueda ser inválido.
 */

const postgresUrl = z
  .string()
  .url('debe ser una URL válida')
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'debe ser una URL de PostgreSQL (postgresql://…)',
  });

const ianaTimeZone = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  {
    message: 'debe ser una zona horaria IANA válida (por ejemplo, America/Argentina/Buenos_Aires)',
  },
);

const envSchema = z.object({
  // Requeridas
  DATABASE_URL: postgresUrl,

  // Opcionales (hasta que su funcionalidad entre en vigor)
  SESSION_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres').optional(),
  APP_BASE_URL: z.string().url('debe ser una URL válida').optional(),
  TZ_CONSULTORIO: ianaTimeZone.optional(),
  WHATSAPP_TOKEN: z.string().min(1, 'no puede estar vacía').optional(),
  WHATSAPP_PHONE_ID: z.string().min(1, 'no puede estar vacía').optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'no puede estar vacía').optional(),
  WHATSAPP_APP_SECRET: z.string().min(1, 'no puede estar vacía').optional(),
  EMAIL_API_KEY: z.string().min(1, 'no puede estar vacía').optional(),
  EMAIL_FROM: z.string().email('debe ser un email válido').optional(),
  CRON_SECRET: z.string().min(1, 'no puede estar vacía').optional(),
});

export type Env = z.infer<typeof envSchema>;

export type EnvSource = Record<string, string | undefined>;

/**
 * Valida un entorno y devuelve la configuración tipada.
 *
 * El mensaje de error nombra la variable y el motivo, y nunca incluye el valor
 * recibido: un secreto mal formado no se filtra por el log de arranque.
 */
export function loadEnv(source: EnvSource = process.env): Env {
  const result = envSchema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  const detail = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join('\n');

  throw new Error(`Configuración de entorno inválida:\n${detail}`);
}

export const env: Env = loadEnv();
