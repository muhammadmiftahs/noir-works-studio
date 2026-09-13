import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Endpoint ini SENGAJA tidak pernah memanggil Anthropic atau Gemini API —
// hanya cek konfigurasi dan koneksi database. Untuk menampilkan status
// masing‑masing provider, cukup cek env var yang ada.
export async function GET() {
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  const database = {
    configured: Boolean(process.env.DATABASE_URL),
    connected: false,
    sizeBytes: null,
    error: null,
  };

  if (database.configured) {
    try {
      const sql = getSql();
      await ensureSchema(sql);
      const rows = await sql`SELECT pg_database_size(current_database()) AS size`;
      database.connected = true;
      database.sizeBytes = Number(rows?.[0]?.size) || 0;
    } catch (err) {
      database.connected = false;
      database.error = err.message || 'Gagal terhubung ke database.';
    }
  }

  return NextResponse.json({ anthropicConfigured, geminiConfigured, database });
}

