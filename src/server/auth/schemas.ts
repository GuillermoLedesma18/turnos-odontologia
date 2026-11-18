import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export function sanitizeNext(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '/agenda';

  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/agenda';
  }
  if (/[\\\r\n\t]/.test(candidate)) return '/agenda';
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return '/agenda';
  if (candidate.includes('://')) return '/agenda';

  return candidate;
}
