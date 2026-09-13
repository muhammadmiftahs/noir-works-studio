// Helper dipakai oleh komponen client untuk memanggil proxy /api/anthropic
// (bukan langsung ke api.anthropic.com — supaya API key tidak pernah
// terekspos ke browser).

export async function callClaude({ model, system, messages, tools, maxTokens }) {
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system,
      messages,
      tools,
      max_tokens: maxTokens,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `Permintaan gagal (status ${res.status}).`;
    throw new Error(message);
  }
  return data;
}

export function extractText(data) {
  return (data.content || [])
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Coba ulang otomatis kalau kena rate limit (mis. saat batch generate cepat).
export async function withRateLimitRetry(fn, { retries = 3, baseDelayMs = 8000, onRetry } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = /rate.?limit|429|overloaded|529/i.test(err.message || '');
      const isLast = attempt === retries;
      if (!isRateLimit || isLast) throw err;
      const delay = baseDelayMs * (attempt + 1);
      if (onRetry) onRetry(attempt + 1, delay);
      await sleep(delay);
    }
  }
}

// Ambil objek/array JSON dari teks respons model, walau dibungkus code fence
// atau ada teks tambahan di sekitarnya.
export function extractJsonBlock(text) {
  let clean = (text || '').trim();
  clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(clean);
  } catch (e) {
    const arrMatch = clean.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]);
      } catch (e2) {
        /* fall through */
      }
    }
    const objMatch = clean.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]);
    }
    throw new Error('Gagal membaca hasil sebagai JSON.');
  }
}
