// ============================================================================
// FITUR PROMPT DNA + AUTO-SCORER
// Memungkinkan pengguna menandai prompt terbaik/sukses sebagai "DNA Template",
// lalu menghitung skor kelayakan komersial (0-100%) secara cerdas dan lokal
// tanpa memboroskan token API.
// ============================================================================

const DNA_STORAGE_KEY = 'noir_works_prompt_dna_v1';

// Kriteria pengecekan kualitas teknis (0 Token / Client-side)
const QUALITY_CRITERIA = [
  {
    id: 'length',
    name: 'Panjang & Detail',
    weight: 20,
    check: (prompt) => {
      const words = (prompt || '').trim().split(/\s+/).length;
      if (words >= 35 && words <= 120) return { score: 100, hint: 'Panjang ideal (35-120 kata)' };
      if (words >= 20) return { score: 75, hint: 'Cukup detail, bisa ditambah deskripsi tekstur/material' };
      return { score: 40, hint: 'Terlalu pendek, tambahkan detail visual' };
    },
  },
  {
    id: 'lighting',
    name: 'Spesifikasi Pencahayaan',
    weight: 20,
    check: (prompt) => {
      const regex = /lighting|light|illumination|shadow|glow|sunlight|volumetric|golden hour|softbox|rim light|diffused|ambient/i;
      const match = regex.test(prompt || '');
      return match
        ? { score: 100, hint: 'Pencahayaan terdefinisi dengan jelas' }
        : { score: 30, hint: 'Tambahkan jenis pencahayaan (mis. studio softbox, golden hour)' };
    },
  },
  {
    id: 'composition',
    name: 'Komposisi & Sudut Pandang',
    weight: 20,
    check: (prompt) => {
      const regex = /shot|view|angle|perspective|close-up|wide|macro|eye-level|overhead|centered|composition|depth of field|bokeh|isolated/i;
      const match = regex.test(prompt || '');
      return match
        ? { score: 100, hint: 'Komposisi dan sudut kamera spesifik' }
        : { score: 40, hint: 'Sebutkan sudut pandang kamera (mis. 85mm portrait, wide-angle, eye-level)' };
    },
  },
  {
    id: 'commercial',
    name: 'Kualitas Komersial & Tekstur',
    weight: 20,
    check: (prompt) => {
      const regex = /detailed|texture|material|commercial|professional|clean|sharp|8k|high resolution|masterpiece|realistic|ultra/i;
      const match = regex.test(prompt || '');
      return match
        ? { score: 100, hint: 'Mengandung deskriptor kualitas komersial yang kuat' }
        : { score: 40, hint: 'Tambahkan penutup standar komersial (mis. highly detailed, sharp focus, clean composition)' };
    },
  },
  {
    id: 'negative',
    name: 'Kekuatan Negative Prompt',
    weight: 20,
    check: (_, negative) => {
      const terms = (negative || '').split(',').map((t) => t.trim()).filter(Boolean);
      if (terms.length >= 4) return { score: 100, hint: 'Negative prompt lengkap mengunci kualitas' };
      if (terms.length >= 1) return { score: 70, hint: 'Negative prompt cukup, bisa diperkuat' };
      return { score: 20, hint: 'Negative prompt kosong/kurang lengkap' };
    },
  },
];

// Menghitung skor kualitas prompt (0 - 100) secara lokal tanpa panggil API
export function calculatePromptScore(prompt, negative, dnaList = []) {
  let totalScore = 0;
  let maxWeight = 0;
  const breakdown = [];

  for (const crit of QUALITY_CRITERIA) {
    const res = crit.check(prompt, negative);
    totalScore += (res.score * crit.weight) / 100;
    maxWeight += crit.weight;
    breakdown.push({
      id: crit.id,
      name: crit.name,
      score: res.score,
      hint: res.hint,
    });
  }

  // Bonus DNA Matching jika prompt mendekati struktur DNA yang pernah disimpan
  let dnaMatchBonus = 0;
  let matchingDnaName = null;
  if (Array.isArray(dnaList) && dnaList.length > 0) {
    const pLower = (prompt || '').toLowerCase();
    for (const dna of dnaList) {
      const keywords = (dna.keywords || []).filter(Boolean);
      const matched = keywords.filter((kw) => pLower.includes(kw.toLowerCase()));
      if (keywords.length && matched.length / keywords.length >= 0.5) {
        dnaMatchBonus = 5;
        matchingDnaName = dna.title;
        break;
      }
    }
  }

  const finalScore = Math.min(100, Math.round(totalScore + dnaMatchBonus));

  let grade = 'B';
  let badgeColor = '#f2b134';
  let statusText = 'Cukup Bagus';

  if (finalScore >= 90) {
    grade = 'S+';
    badgeColor = '#7fcf9e';
    statusText = 'Standar Komersial Tinggi (Top Tier)';
  } else if (finalScore >= 80) {
    grade = 'A';
    badgeColor = '#4fd6c8';
    statusText = 'Sangat Bagus (Siap Stock)';
  } else if (finalScore >= 65) {
    grade = 'B';
    badgeColor = '#f2b134';
    statusText = 'Cukup (Bisa Disempurnakan)';
  } else {
    grade = 'C';
    badgeColor = '#e3384f';
    statusText = 'Perlu Perbaikan';
  }

  return {
    score: finalScore,
    grade,
    badgeColor,
    statusText,
    breakdown,
    matchingDna: matchingDnaName,
  };
}

// Ekstrak pola kata kunci penting dari sebuah prompt untuk disimpan sebagai DNA
export function extractDnaKeywords(promptText) {
  if (!promptText) return [];
  // Ambil istilah teknis dan kata deskriptif penting (panjang kata >= 4)
  const words = promptText
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !['with', 'from', 'this', 'that', 'have', 'were', 'been', 'their', 'which', 'about'].includes(w));

  // Ambil kata unik maksimal 12 kata representatif
  return Array.from(new Set(words)).slice(0, 12);
}

// Penyimpanan DNA lokal di browser (localStorage)
export function getStoredDna() {
  try {
    const raw = localStorage.getItem(DNA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveDna(item) {
  try {
    const current = getStoredDna();
    const keywords = extractDnaKeywords(item.prompt);
    const newDna = {
      id: `dna_${Date.now()}`,
      title: item.title || 'Prompt DNA',
      niche: item.niche || 'Umum',
      prompt: item.prompt,
      negative: item.negative || '',
      keywords,
      createdAt: Date.now(),
    };
    const updated = [newDna, ...current.filter((d) => d.prompt !== item.prompt)].slice(0, 30);
    localStorage.setItem(DNA_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return [];
  }
}

export function removeDna(dnaId) {
  try {
    const current = getStoredDna();
    const updated = current.filter((d) => d.id !== dnaId);
    localStorage.setItem(DNA_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return [];
  }
}
