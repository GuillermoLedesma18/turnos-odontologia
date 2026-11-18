import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PATHS = ['/agenda', '/tratamientos', '/pacientes'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('turnos_session')?.value;
  if (!token && isProtectedPath(request.nextUrl.pathname)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/agenda',
    '/agenda/:path*',
    '/tratamientos',
    '/tratamientos/:path*',
    '/pacientes',
    '/pacientes/:path*',
  ],
};
