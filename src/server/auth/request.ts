import net from 'node:net';

import type { NextRequest } from 'next/server';

export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    for (const part of forwarded.split(',')) {
      const candidate = part.trim();
      if (net.isIP(candidate)) return candidate;
    }
  }

  const realIp = headers.get('x-real-ip');
  if (realIp && net.isIP(realIp.trim())) {
    return realIp.trim();
  }

  return null;
}

export function hasValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function hasJsonContentType(request: NextRequest): boolean {
  const contentType = request.headers.get('content-type') ?? '';
  return contentType.toLowerCase().startsWith('application/json');
}

export async function readRequestBodyWithLimit(
  request: NextRequest,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 413 }> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413 };
  }

  const text = await request.text();
  if (text.length > maxBytes) {
    return { ok: false, status: 413 };
  }

  return { ok: true, text };
}
