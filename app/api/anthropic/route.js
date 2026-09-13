import { NextResponse } from 'next/server';
import { isAllowedModel } from '../../../lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS_CEILING = 8000;

// Endpoint proxy: frontend TIDAK PERNAH menyimpan/mengirim Anthropic API key
// sendiri. Semua panggilan lewat sini, key diambil dari Environment Variable
// server (ANTHROPIC_API_KEY), sehingga aman dipasang di Vercel.
export async function POST(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: {
          message:
            'ANTHROPIC_API_KEY belum diset di server. Tambahkan di Vercel Project Settings -> Environment Variables, lalu redeploy.',
        },
      },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { message: 'Body request tidak valid (bukan JSON).' } }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: { message: 'Body request kosong.' } }, { status: 400 });
  }

  if (!isAllowedModel(body.model)) {
    return NextResponse.json(
      { error: { message: `Model "${body.model}" tidak diizinkan. Pilih Haiku, Sonnet, atau Opus.` } },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: { message: 'Field "messages" wajib diisi.' } }, { status: 400 });
  }

  const payload = {
    model: body.model,
    max_tokens: Math.max(1, Math.min(Number(body.max_tokens) || 1024, MAX_TOKENS_CEILING)),
    messages: body.messages,
  };
  if (body.system) payload.system = body.system;
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = body.tools;

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: `Tidak bisa menghubungi Anthropic API. Detail: ${err.message}` } },
      { status: 502 }
    );
  }

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
