import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Endpoint ini SENGAJA tidak pernah memanggil Anthropic API — memverifikasi
// API key beneran valid butuh request sungguhan ke Claude yang memakan biaya
// token, jadi itu dibuat manual lewat tombol "Tes sekarang" di UI (lihat
// StatusBar.js), bukan otomatis di sini. Untuk database, ping Postgres tidak
// dikenai biaya tambahan di Neon, jadi aman dicek otomatis setiap kali.
export async function GET() {
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

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

  return NextResponse.json({ anthropicConfigured, database });
}
