import { NextResponse } from 'next/server';
import { verifySession, AUTH_COOKIE_NAME } from './lib/auth';

// Middleware ini berjalan untuk SEMUA request kecuali yang dikecualikan lewat
// `matcher` di bawah (halaman login, endpoint login, dan aset statis Next.js).
// Ini juga otomatis melindungi /api/anthropic dan /api/prompts, jadi orang
// tidak bisa memanggil API itu langsung tanpa login duluan.
export const config = {
  matcher: ['/((?!login|api/login|_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req) {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.AUTH_PASSWORD;

  // Kalau AUTH_PASSWORD / AUTH_SECRET belum diset, proteksi dianggap "belum
  // diaktifkan" dan request dibiarkan lewat — supaya developer tidak
  // terkunci dari aplikasinya sendiri saat env var belum diisi. Selalu isi
  // kedua env var ini sebelum aplikasi dibuka untuk publik (lihat README).
  if (!secret || !password) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const valid = await verifySession(secret, token);
  if (valid) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { message: 'Unauthorized. Silakan login dulu di halaman utama.' } }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}
