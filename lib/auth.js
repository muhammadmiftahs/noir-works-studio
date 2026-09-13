// Helper otentikasi sederhana berbasis cookie yang ditandatangani (HMAC-SHA256).
// Sengaja TIDAK memakai session store/database supaya tetap ringan dan jalan
// di Edge Middleware maupun Node API Route dengan kode yang sama — keduanya
// punya Web Crypto API (`crypto.subtle`) secara global.
//
// Cara kerja:
// 1. User submit password di /login -> dicocokkan dengan AUTH_PASSWORD (constant-time).
// 2. Kalau cocok, server bikin token "expiresAt.signature" (signature = HMAC(AUTH_SECRET, expiresAt))
//    dan menyimpannya sebagai cookie HttpOnly.
// 3. Setiap request, middleware.js memverifikasi tanda tangan & masa berlaku token.
//    Karena secret tidak pernah dikirim ke browser, token tidak bisa dipalsukan
//    tanpa tahu AUTH_SECRET.

const encoder = new TextEncoder();

async function getHmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Bandingkan dua string dengan waktu yang (kurang lebih) konstan, supaya
// perbandingan password tidak bocor lewat timing attack.
export async function constantTimeStringEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  return timingSafeEqual(bufferToHex(ha), bufferToHex(hb)) && a.length === b.length;
}

export async function signSession(secret, expiresAtMs) {
  const payload = String(expiresAtMs);
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bufferToHex(sig)}`;
}

export async function verifySession(secret, token) {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  const expiresAtMs = Number(payload);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return false;

  const key = await getHmacKey(secret);
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expectedHex = bufferToHex(expectedSig);
  return timingSafeEqual(expectedHex, sigHex);
}

export const AUTH_COOKIE_NAME = 'noir_auth';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari
