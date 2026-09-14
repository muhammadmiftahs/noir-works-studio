// ============================================================================
// FITUR 3: Live Google Flow / Veo Parameter Inspector
// Semua perhitungan di sini 100% di sisi klien (tanpa API) — tidak memakan
// token/credit AI sama sekali. Angka & rekomendasi bersifat panduan praktis
// berdasarkan perilaku umum model Veo di Google Flow.
// ============================================================================

// Mapping tipe konten -> rekomendasi durasi & motion
const CONTENT_DURATION_MAP = {
  b_roll: { duration: 8, motionBias: 0 },
  motion_graphics: { duration: 6, motionBias: -1 },
  timelapse: { duration: 6, motionBias: +1 },
  slow_motion: { duration: 8, motionBias: -1 },
  seamless_loop: { duration: 6, motionBias: 0 },
};

// Motion level (1-5) -> rekomendasi nilai "motion scale" 0-10 & CFG
function motionToScale(motionLevel, contentType) {
  const bias = CONTENT_DURATION_MAP[contentType]?.motionBias || 0;
  const base = Math.max(1, Math.min(5, motionLevel + bias));
  // Skala 1-5 -> 0.2 - 1.0
  return { level: base, scale: (base / 5).toFixed(2) };
}

export function buildVeoInspector({ aspectRatio, contentType, cameraMovement, motionLevel }) {
  const duration = CONTENT_DURATION_MAP[contentType]?.duration || 8;
  const { level: effMotionLevel, scale: motionScale } = motionToScale(motionLevel, contentType);

  // Rasio aspek -> resolusi & orientasi
  const aspect = aspectRatio === '9:16'
    ? { ratio: '9:16', resolution: '1080 × 1920', label: 'Vertikal (Portrait)', use: 'Reels, TikTok, Shorts, Story' }
    : { ratio: '16:9', resolution: '1920 × 1080', label: 'Horizontal (Landscape)', use: 'YouTube, TV, presentasi, web hero' };

  // Saran camera movement flags untuk Veo
  const cameraFlags = {
    'otomatis': 'Biarkan Veo memilih (no explicit camera flag) — hasil lebih natural tapi kurang terkontrol.',
    'static shot': 'Gunakan prompt "static locked-off shot, no camera movement" untuk menghindari drift tak disengaja.',
    'slow push-in': 'Gunakan prompt "slow dolly-in / push-in toward subject" — kombinasikan dengan motion scale rendah (0.2-0.4).',
    'pan': 'Gunakan prompt "smooth horizontal pan left/right" — hindari kecepatan tinggi agar tidak flicker.',
    'tracking shot': 'Gunakan prompt "smooth tracking shot following subject" — pastikan arah motion konsisten dengan arah tracking.',
    'drone / aerial': 'Gunakan prompt "aerial drone shot, slow orbit / reveal" — sangat cocok untuk motion scale 0.4-0.6.',
    'handheld': 'Gunakan prompt "handheld documentary style, subtle natural shake" — jangan terlalu berlebihan agar tidak terlihat amatir.',
    'slow motion': 'Gunakan prompt "ultra slow motion, high frame rate" — set durasi 8 detik agar gerakan tidak terlalu cepat.',
  }[cameraMovement] || '';

  // Rekomendasi stylization & seed
  const stylization = effMotionLevel <= 2 ? '0.3 – 0.5 (realistis, minim distorsi)'
    : effMotionLevel >= 4 ? '0.6 – 0.8 (lebih artistik, gerakan tegas)'
    : '0.4 – 0.6 (seimbang)';

  return {
    aspect,
    duration,
    motionLevel: effMotionLevel,
    motionScale,
    cameraFlag: cameraFlags,
    stylization,
    seed: 'Kosongkan seed untuk variasi acak; isi angka tetap bila ingin hasil mirip di-generate ulang.',
    negativeHard: 'no morphing artifacts, no flickering, no warped hands, no extra limbs, no text overlay, no watermark, consistent lighting',
    cfgNote: 'Veo tidak mengekspos CFG manual — kontrol lewat kekuatan prompt & reference image, bukan angka.',
  };
}

// Format ringkas untuk ditampilkan/di-copy
export function veoInspectorToText(params) {
  return [
    `[Veo / Google Flow — Recommended Parameters]`,
    `Aspect Ratio  : ${params.aspect.ratio} (${params.aspect.resolution}) — ${params.aspect.label}`,
    `Best for      : ${params.aspect.use}`,
    `Duration      : ~${params.duration} detik`,
    `Motion Level  : ${params.motionLevel}/5 (motion scale ${params.motionScale})`,
    `Stylization   : ${params.stylization}`,
    `Camera        : ${params.cameraFlag}`,
    `Seed          : ${params.seed}`,
    `CFG           : ${params.cfgNote}`,
    `Negative Lock : ${params.negativeHard}`,
  ].join('\n');
}
