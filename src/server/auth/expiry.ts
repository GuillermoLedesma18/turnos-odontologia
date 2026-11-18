import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './constants';

export type SessionLike = {
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function computeInitialExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_IDLE_TIMEOUT_MS);
}

export function absoluteDeadline(session: Pick<SessionLike, 'createdAt'>): Date {
  return new Date(session.createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);
}

export function isSessionRevoked(session: Pick<SessionLike, 'revokedAt'>): boolean {
  return session.revokedAt !== null;
}

export function isSessionExpired(session: SessionLike, now: Date): boolean {
  if (session.revokedAt !== null) return true;
  if (now.getTime() >= session.expiresAt.getTime()) return true;
  if (now.getTime() >= session.createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS) return true;
  return false;
}

export function shouldTouch(session: Pick<SessionLike, 'lastUsedAt'>, now: Date): boolean {
  return now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}

export function computeRenewedExpiry(session: SessionLike, now: Date): Date {
  if (!shouldTouch(session, now)) {
    return new Date(session.expiresAt.getTime());
  }

  const idleExpiry = new Date(now.getTime() + SESSION_IDLE_TIMEOUT_MS);
  const absolute = absoluteDeadline(session);
  const candidate = idleExpiry.getTime() < absolute.getTime() ? idleExpiry : absolute;
  // No achicar una expiración ya futura.
  return new Date(Math.max(session.expiresAt.getTime(), candidate.getTime()));
}
