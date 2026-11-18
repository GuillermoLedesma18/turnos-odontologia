import { SESSION_COOKIE_NAME } from './constants';

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 12 * 60 * 60,
    secure: isProduction(),
  };
}

export function clearedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    secure: isProduction(),
  };
}
