import { NextResponse } from 'next/server';
import { constantTimeStringEqual, signSession, AUTH_COOKIE_NAME, SESSION_DURATION_MS } from '../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const password = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!password || !secret) {
    return NextResponse.json(
      { error: { message: 'AUTH_PASSWORD / AUTH_SECRET belum diset di server. Tambahkan di Environment Variables lalu redeploy.' } },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: 'Body request tidak valid.' } }, { status: 400 });
  }

  const input = (body?.password || '').toString();
  const ok = await constantTimeStringEqual(input, password);
  if (!ok) {
    return NextResponse.json({ error: { message: 'Password salah.' } }, { status: 401 });
  }

  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = await signSession(secret, expiresAt);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
  return res;
}
