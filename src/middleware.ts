import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  createAccessToken,
  getSitePassword,
  isSiteAccessEnabled,
} from '@/lib/auth/siteAccess';

export async function middleware(request: NextRequest) {
  if (!isSiteAccessEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname === '/login' || pathname.startsWith('/api/auth/login')) {
    return NextResponse.next();
  }

  const cookieValue = request.cookies.get(ACCESS_COOKIE)?.value;
  const expected = await createAccessToken(getSitePassword());
  if (cookieValue === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') {
    loginUrl.searchParams.set('from', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Exclude all /_next/* (including webpack-hmr) — intercepting those
     * causes infinite reloads in dev when SITE_PASSWORD is enabled.
     */
    '/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
