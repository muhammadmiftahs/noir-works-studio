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

// Ambil total item tersimpan per "kind" dari database (dipakai untuk angka
// statistik "total pernah dibuat" di header). Sengaja "diam" kalau gagal —
// biar UI tetap jalan normal walau database belum diset / lagi bermasalah.
export async function getCounts() {
  try {
    const res = await fetch('/api/counts');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return {};
    return json.counts || {};
  } catch (err) {
    return {};
  }
}

// ============================================================
// User Presets — disimpan di localStorage browser (tanpa biaya API/database).
// Terpisah antara preset "image" (Prompt Generator) dan "video".
// ============================================================

const PRESET_STORAGE_KEY = 'noir-works-user-presets';

function readPresetStore() {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function writePresetStore(store) {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    // localStorage penuh / dinonaktifkan — abaikan, tidak kritikal.
  }
}

// kind: 'image' | 'video'
export function listUserPresets(kind) {
  const store = readPresetStore();
  const list = store[kind];
  return Array.isArray(list) ? list : [];
}

export function saveUserPreset(kind, { name, config }) {
  const store = readPresetStore();
  const list = Array.isArray(store[kind]) ? store[kind] : [];
  const trimmed = (name || '').trim() || `Preset ${list.length + 1}`;
  // Nama sama akan menimpa preset lama (menggantikan config-nya).
  const filtered = list.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase());
  const next = [...filtered, { name: trimmed, config, createdAt: Date.now() }];
  store[kind] = next;
  writePresetStore(store);
  return next;
}

export function deleteUserPreset(kind, name) {
  const store = readPresetStore();
  const list = Array.isArray(store[kind]) ? store[kind] : [];
  const next = list.filter((p) => p.name !== name);
  store[kind] = next;
  writePresetStore(store);
  return next;
}
