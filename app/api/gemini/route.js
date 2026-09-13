import { NextResponse } from 'next/server';
import { getModel } from '../../../lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: {
          message:
            'GEMINI_API_KEY belum diset di server. Tambahkan di Vercel Project Settings -> Environment Variables, lalu redeploy.',
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

  const modelDef = getModel(body.model);
  if (!modelDef || modelDef.provider !== 'google') {
    return NextResponse.json(
      { error: { message: `Model "${body.model}" bukan model Gemini yang diizinkan.` } },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: { message: 'Field "messages" wajib diisi.' } }, { status: 400 });
  }

  // Transform pesan Anthropic/App standard ke Google Gemini Generative Language API format
  const contents = [];
  let systemInstruction = null;

  if (body.system) {
    systemInstruction = {
      parts: [{ text: body.system }],
    };
  }

  for (const msg of body.messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image') {
          const src = item.source;
          if (src && src.type === 'base64') {
            parts.push({
              inline_data: {
                mime_type: src.media_type || 'image/jpeg',
                data: src.data,
              },
            });
          }
        }
      }
    }
    contents.push({ role, parts });
  }

  const geminiPayload = {
    contents,
    generationConfig: {
      maxOutputTokens: Math.max(1, Math.min(Number(body.max_tokens) || 2048, 8192)),
      temperature: 0.7,
    },
  };

  if (systemInstruction) {
    geminiPayload.systemInstruction = systemInstruction;
  }

  // Handle web search tool mapping
  if (Array.isArray(body.tools) && body.tools.some((t) => t.type?.includes('web_search'))) {
    geminiPayload.tools = [{ googleSearch: {} }];
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent?key=${apiKey}`;

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch (err) {
    return NextResponse.json(
      { error: { message: `Tidak bisa menghubungi Gemini API. Detail: ${err.message}` } },
      { status: 502 }
    );
  }

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const errMessage = data?.error?.message || `Permintaan Gemini gagal (status ${upstream.status}).`;
    return NextResponse.json({ error: { message: errMessage } }, { status: upstream.status });
  }

  // Normalisasi respons Gemini ke format standar app (mirip struktur Anthropic response)
  const candidate = data.candidates?.[0];
  const textParts = candidate?.content?.parts || [];
  const textOut = textParts.map((p) => p.text || '').join('\n');

  const normalizedResponse = {
    content: [{ type: 'text', text: textOut }],
    rawGemini: data,
  };

  return NextResponse.json(normalizedResponse);
}
