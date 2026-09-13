// Definisi tier model Claude yang diizinkan dipakai dari UI.
// Harga berdasarkan halaman resmi Anthropic (per MTok = per 1 juta token),
// dicek terakhir September 2026. Cek ulang di https://platform.claude.com/docs/en/about-claude/pricing
// kalau sewaktu-waktu ingin memastikan harga masih sama.

export const MODELS = [
  {
    id: 'claude-haiku-4-5-20251001',
    tier: 'haiku',
    label: 'Claude Haiku 4.5',
    shortLabel: 'Haiku 4.5',
    badge: 'Hemat',
    badgeColor: '#4fd6c8',
    description:
      'Paling murah dan paling cepat. Cocok untuk generate dalam jumlah banyak, uji coba prompt, atau saat kualitas "cukup bagus" sudah memadai.',
    price: { input: 1, output: 5 },
  },
  {
    id: 'claude-sonnet-5',
    tier: 'sonnet',
    label: 'Claude Sonnet 5',
    shortLabel: 'Sonnet 5',
    badge: 'Seimbang',
    badgeColor: '#f2b134',
    description:
      'Keseimbangan terbaik antara kualitas dan biaya. Direkomendasikan sebagai pilihan default untuk pemakaian sehari-hari.',
    price: { input: 2, output: 10 },
  },
  {
    id: 'claude-opus-5',
    tier: 'opus',
    label: 'Claude Opus 5',
    shortLabel: 'Opus 5',
    badge: 'Kualitas Tinggi',
    badgeColor: '#e3384f',
    description:
      'Kualitas dan ketelitian paling tinggi (riset lebih dalam, deskripsi lebih detail), tapi biaya per pemakaian paling mahal.',
    price: { input: 5, output: 25 },
  },
];

export const DEFAULT_MODEL_ID = 'claude-sonnet-5';

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
}

export function isAllowedModel(id) {
  return MODELS.some((m) => m.id === id);
}

// Perkiraan kasar biaya dalam USD untuk satu kali generate, dipakai hanya
// untuk ditampilkan sebagai estimasi di UI (bukan angka final/resmi).
export function estimateUsd(modelId, approxInputTokens, approxOutputTokens) {
  const m = getModel(modelId);
  if (!m) return 0;
  return (
    (approxInputTokens / 1_000_000) * m.price.input +
    (approxOutputTokens / 1_000_000) * m.price.output
  );
}
