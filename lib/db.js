import { neon } from '@neondatabase/serverless';

let cachedSql = null;

// Mengembalikan client query Neon (serverless, berbasis HTTP fetch — cocok
// untuk Vercel Hobby / serverless functions, tidak butuh connection pool).
export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL belum diset. Tambahkan di Vercel Project Settings -> Environment Variables, isi dengan connection string dari Neon.'
    );
  }
  if (!cachedSql) {
    cachedSql = neon(url);
  }
  return cachedSql;
}

// Membuat tabel penyimpanan kalau belum ada. Aman dipanggil berulang kali
// (CREATE TABLE IF NOT EXISTS), jadi tidak perlu langkah migrasi terpisah.
export async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS noir_works_items (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      model TEXT,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS noir_works_items_kind_created_idx
    ON noir_works_items (kind, created_at DESC)
  `;
}
