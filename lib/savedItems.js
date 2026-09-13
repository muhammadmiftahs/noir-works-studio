// Helper client-side untuk menyimpan/mengambil data dari Neon Postgres
// lewat /api/prompts. Semua fungsi ini sengaja "diam" (tidak melempar error
// ke UI utama) kalau database belum diset — supaya generate prompt/metadata
// tetap bisa dipakai walau DATABASE_URL belum dikonfigurasi.

export async function saveItem({ kind, title, model, data }) {
  try {
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title, model, data }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || 'Gagal menyimpan ke database.');
    return json.item;
  } catch (err) {
    throw err;
  }
}

export async function listItems(kind) {
  const res = await fetch(`/api/prompts?kind=${encodeURIComponent(kind)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Gagal memuat riwayat.');
  return json.items || [];
}

export async function deleteItem(id) {
  const res = await fetch(`/api/prompts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Gagal menghapus item.');
  return true;
}

export async function clearItems(kind) {
  const res = await fetch(`/api/prompts?kind=${encodeURIComponent(kind)}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || 'Gagal menghapus riwayat.');
  return true;
}
