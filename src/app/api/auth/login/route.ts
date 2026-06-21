import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  createAccessToken,
  getSitePassword,
  isSiteAccessEnabled,
} from '@/lib/auth/siteAccess';

export async function POST(request: Request) {
  if (!isSiteAccessEnabled()) {
    return NextResponse.json({ ok: true, authDisabled: true });
  }

  const body = (await request.json()) as { password?: string };
  const password = body.password?.trim() || '';

  if (password !== getSitePassword()) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }

  const token = await createAccessToken(password);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
