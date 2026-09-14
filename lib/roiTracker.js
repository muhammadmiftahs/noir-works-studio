// ============================================================================
// FITUR 4: Microstock Portfolio Earnings Estimator & Niche ROI Tracker
// Kalkulasi 100% di sisi klien — membaca data riwayat dari database, lalu
// memperkirakan potensi ROI berdasarkan asumsi royaliti microstock.
// Tidak memanggil API AI (nol token biaya).
// ============================================================================

// Asumsi default industri microstock (bisa diubah user, disimpan di localStorage).
export const DEFAULT_ROI_ASSUMPTIONS = {
  royaltyPerDownload: 0.35, // rata-rata royaliti per download (USD)
  downloadsPerImageMonth: 0.18, // rata-rata download/bulan per gambar (konservatif)
  uploadsPerMonth: 50, // target upload user per bulan
};

// Perkiraan "nilai komersial" sebuah niche dari rata-rata potensi item
// yang tersimpan di DB untuk niche tsb (dari field `potential` 1-5).
export function estimateNicheValue(items) {
  const withPotential = items.filter((it) => Number(it?.data?.potential) > 0);
  if (!withPotential.length) return { avgPotential: 0, count: 0 };
  const avgPotential = withPotential.reduce((s, it) => s + Number(it.data.potential), 0) / withPotential.length;
  return { avgPotential: Math.round(avgPotential * 100) / 100, count: withPotential.length };
}

// Inti kalkulasi ROI. items: array item tersimpan; assumptions: objek asumsi.
export function computeRoi(items, assumptions = DEFAULT_ROI_ASSUMPTIONS) {
  const totalAssets = items.length;
  if (!totalAssets) {
    return { totalAssets: 0, estMonthlyDownloads: 0, estMonthlyRevenue: 0, estYearlyRevenue: 0, roiPerAsset: 0 };
  }
  const { royaltyPerDownload, downloadsPerImageMonth } = assumptions;
  // Bobot nilai: aset dgn potential tinggi dianggap lebih cepat menghasilkan.
  const weightedAssets = items.reduce((sum, it) => {
    const p = Number(it?.data?.potential) || 3; // default netral
    return sum + (p / 3); // potential 3 = bobot 1.0
  }, 0);

  const estMonthlyDownloads = weightedAssets * downloadsPerImageMonth;
  const estMonthlyRevenue = estMonthlyDownloads * royaltyPerDownload;
  return {
    totalAssets,
    weightedAssets: Math.round(weightedAssets * 100) / 100,
    estMonthlyDownloads: Math.round(estMonthlyDownloads * 10) / 10,
    estMonthlyRevenue: Math.round(estMonthlyRevenue * 100) / 100,
    estYearlyRevenue: Math.round(estMonthlyRevenue * 12 * 100) / 100,
    roiPerAsset: Math.round((estMonthlyRevenue / totalAssets) * 10000) / 10000,
  };
}

// Breakdown ROI per niche (group by niche dari data item).
export function computeRoiByNiche(items, assumptions = DEFAULT_ROI_ASSUMPTIONS) {
  const groups = {};
  items.forEach((it) => {
    const niche = (it?.data?.niche || 'Tanpa niche').trim();
    if (!groups[niche]) groups[niche] = [];
    groups[niche].push(it);
  });
  return Object.entries(groups)
    .map(([niche, list]) => ({
      niche,
      ...computeRoi(list, assumptions),
      ...estimateNicheValue(list),
    }))
    .sort((a, b) => b.estMonthlyRevenue - a.estMonthlyRevenue);
}

export function formatMoney(n) {
  if (!n) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================================================
// FITUR 1: Adobe Stock Acceptance Predictor — helper skoring
// Menerima objek hasil analisis AI (sudah didapat di single-call) lalu
// menormalkannya jadi skor 0-100 + daftar peringatan. TANPA panggilan API.
// ============================================================================

export function computeAcceptanceScore(analysis) {
  // analysis: { trademarkRisk, copySpace, quality, ipRisk, commercialValue }
  // Semua field 0-100 (makin tinggi makin baik/aman), kecuali *_risk.
  if (!analysis) return { score: 0, level: 'unknown', issues: [] };

  const issues = [];
  let score = 100;

  // Risiko merek / IP
  if (analysis.visual_trademark_risk && analysis.visual_trademark_risk.trim()) {
    score -= 35;
    issues.push('⚠ Terdeteksi potensi merek/IP: ' + analysis.visual_trademark_risk.slice(0, 120));
  }

  // Copy space
  const copySpace = analysis.copy_space;
  if (copySpace === 'penuh' || copySpace === 'none') {
    score -= 15;
    issues.push('Komposisi terlalu penuh — pembeli biasanya butuh ruang kosong untuk teks iklan.');
  }

  // Kualitas / artifak
  const quality = analysis.quality;
  if (quality === 'rendah' || quality === 'low') {
    score -= 25;
    issues.push('Kualitas visual dinilai rendah — cek artifak AI (tangan, tepi, tekstur ganjil).');
  } else if (quality === 'sedang' || quality === 'medium') {
    score -= 8;
    issues.push('Kualitas sedang — pertimbangkan refine agar lebih tajam.');
  }

  // Nilai komersial
  const commercial = analysis.commercial_value;
  if (commercial === 'rendah' || commercial === 'low') {
    score -= 20;
    issues.push('Nilai komersial rendah — konsep terasa generik/pasaran.');
  } else if (commercial === 'sedang' || commercial === 'medium') {
    score -= 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let level, color;
  if (score >= 80) { level = 'Aman'; color = '#7fcf9e'; }
  else if (score >= 60) { level = 'Perlu Dicek'; color = '#f2b134'; }
  else { level = 'Berisiko'; color = '#e3384f'; }

  return { score, level, color, issues };
}
