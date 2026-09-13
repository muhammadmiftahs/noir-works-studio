import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dbErrorResponse(err) {
  const message = err && err.message ? err.message : 'Terjadi kesalahan database.';
  return NextResponse.json({ error: { message } }, { status: 500 });
}

// GET /api/prompts?kind=prompt|metadata -> daftar item tersimpan (terbaru dulu)
export async function GET(req) {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get('kind') || 'prompt';
    const rows = await sql`
      SELECT id, kind, title, model, data, created_at
      FROM noir_works_items
      WHERE kind = ${kind}
      ORDER BY created_at DESC
      LIMIT 300
    `;
    return NextResponse.json({ items: rows });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

// POST /api/prompts { kind, title, model, data } -> simpan satu item
export async function POST(req) {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const body = await req.json();
    const kind = (body.kind || 'prompt').toString().slice(0, 50);
    const title = (body.title || '').toString().slice(0, 300);
    const model = (body.model || '').toString().slice(0, 100);
    const data = body.data && typeof body.data === 'object' ? body.data : {};

    const rows = await sql`
      INSERT INTO noir_works_items (kind, title, model, data)
      VALUES (${kind}, ${title}, ${model}, ${JSON.stringify(data)})
      RETURNING id, kind, title, model, data, created_at
    `;
    return NextResponse.json({ item: rows[0] });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

// DELETE /api/prompts?id=123        -> hapus satu item
// DELETE /api/prompts?kind=prompt   -> hapus semua item dengan kind tsb
export async function DELETE(req) {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const kind = searchParams.get('kind');

    if (id) {
      await sql`DELETE FROM noir_works_items WHERE id = ${id}`;
    } else if (kind) {
      await sql`DELETE FROM noir_works_items WHERE kind = ${kind}`;
    } else {
      return NextResponse.json({ error: { message: 'Sertakan "id" atau "kind" untuk menghapus.' } }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
