import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/counts -> total item tersimpan per "kind", dibaca dari database.
// Dipakai untuk menampilkan angka "total pernah dibuat" di header tiap tab,
// supaya angkanya tetap ada walau halaman di-refresh / dibuka dari HP lain
// (bukan cuma dihitung di memori browser).
export async function GET() {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const rows = await sql`
      SELECT kind, COUNT(*)::int AS total
      FROM noir_works_items
      GROUP BY kind
    `;
    const counts = {};
    for (const row of rows) {
      counts[row.kind] = row.total;
    }
    return NextResponse.json({ counts });
  } catch (err) {
    const message = err && err.message ? err.message : 'Terjadi kesalahan database.';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
