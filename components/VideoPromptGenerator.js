'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import ModelSelect from './ModelSelect';
import HistoryPanel from './HistoryPanel';
import NicheStats from './NicheStats';
import { DEFAULT_MODEL_ID } from '../lib/models';
import { callClaude, extractText, extractJsonBlock } from '../lib/claudeClient';
import { saveItem, listItems, getCounts, listUserPresets, saveUserPreset, deleteUserPreset } from '../lib/savedItems';
import { readAsDataURL, resizeImageToBase64 } from '../lib/imageUtils';
import { estimateCost, formatUsd } from '../lib/costTracker';
import {
  LIGHTING_PRESETS,
  LENS_PRESETS,
  FILM_PRESETS,
  PROHIBIT_OPTIONS_VIDEO,
  MOTION_INTENSITY_LEVELS,
} from '../lib/promptPresets';
import { buildVeoInspector, veoInspectorToText } from '../lib/veoInspector';
import {
  calculatePromptScore,
  getStoredDna,
  saveDna,
  removeDna,
} from '../lib/promptDna';

// Riwayat video disimpan dengan "kind" berbeda dari Prompt Generator gambar
// (kind: "prompt"), supaya daftar anti-duplikat tidak saling campur — konsep
// video dicek hanya terhadap video lama, bukan terhadap konsep gambar.
const HISTORY_KIND = 'video-prompt';
// Catatan riset video juga dipisah dari riset Prompt Generator gambar (kind
// "riset"), supaya total-nya tidak tercampur.
const RISET_KIND = 'riset-video';
const MAX_AVOID_TITLES = 40;

function buildEnhancementBlock(lightingId, lensId, filmId, motionLevel) {
  const blocks = [];
  
  const lighting = LIGHTING_PRESETS.find((p) => p.id === lightingId);
  if (lighting?.prompt) blocks.push(`Lighting: ${lighting.prompt}`);
  
  const lens = LENS_PRESETS.find((p) => p.id === lensId);
  if (lens?.prompt) blocks.push(`Lens: ${lens.prompt}`);
  
  const film = FILM_PRESETS.find((p) => p.id === filmId);
  if (film?.prompt) blocks.push(`Color Profile: ${film.prompt}`);

  const motion = MOTION_INTENSITY_LEVELS.find((m) => m.level === motionLevel);
  if (motion?.prompt) blocks.push(`Motion Intensity: ${motion.prompt}`);
  
  return blocks.length ? `\n\nTechnical Enhancements:\n${blocks.join('\n')}` : '';
}

function buildProhibitBlock(prohibitIds) {
  const prohibited = prohibitIds
    .map((id) => PROHIBIT_OPTIONS_VIDEO.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p.negative)
    .join(', ');
  
  return prohibited ? `Prohibit Technical Guidelines: ${prohibited}` : '';
}

const NICHE_OPTIONS = [
  { value: 'bisnis & korporat', label: 'Bisnis & korporat' },
  { value: 'lifestyle & keluarga sehari-hari', label: 'Lifestyle & keluarga' },
  { value: 'alam & lanskap', label: 'Alam & lanskap' },
  { value: 'makanan & minuman', label: 'Makanan & minuman' },
  { value: 'teknologi & digital', label: 'Teknologi & digital' },
  { value: 'kesehatan & kebugaran', label: 'Kesehatan & kebugaran' },
  { value: 'perjalanan & wisata', label: 'Perjalanan & wisata' },
  { value: 'kota & arsitektur', label: 'Kota & arsitektur' },
  { value: 'hari raya & musiman (lebaran, natal, tahun baru)', label: 'Hari raya & musiman' },
  { value: 'abstrak & motion graphics', label: 'Abstrak & motion graphics' },
  { value: 'industri & manufaktur', label: 'Industri & manufaktur' },
];

const STYLE_OPTIONS = [
  'sinematik realistis',
  'dokumenter natural',
  'drone / aerial cinematic',
  'korporat bersih & minimalis',
  'motion graphics abstrak',
  'macro close-up detail',
  'vintage film look',
];

// Veo (mesin di balik Google Flow) hanya mendukung dua rasio aspek ini —
// bukan pilihan bebas seperti gambar.
const ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 · Horizontal' },
  { value: '9:16', label: '9:16 · Vertikal' },
];

const CAMERA_OPTIONS = [
  { value: 'otomatis', label: 'Otomatis (AI pilih)' },
  { value: 'static shot', label: 'Static shot' },
  { value: 'slow push-in', label: 'Slow push-in' },
  { value: 'pan', label: 'Pan (kiri/kanan)' },
  { value: 'tracking shot', label: 'Tracking shot' },
  { value: 'drone / aerial', label: 'Drone / aerial' },
  { value: 'handheld', label: 'Handheld dokumenter' },
  { value: 'slow motion', label: 'Slow motion' },
];

const CONTENT_TYPE_OPTIONS = [
  { value: 'b_roll', label: 'B-roll sinematik' },
  { value: 'motion_graphics', label: 'Motion graphics / abstrak' },
  { value: 'timelapse', label: 'Time-lapse' },
  { value: 'slow_motion', label: 'Slow motion' },
  { value: 'seamless_loop', label: 'Loop mulus (seamless loop)' },
];

function titleStars(value) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return <span className="stars-gold">{'★'.repeat(n)}</span>;
}
function starsMarkup(value) {
  const rounded = Math.round(value * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  return (
    <>
      <span className="stars-gold">{'★'.repeat(full)}</span>
      {half && <span style={{ color: 'var(--muted)', fontSize: 12 }}>½</span>}
    </>
  );
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function contentTypeLabel(value) {
  const found = CONTENT_TYPE_OPTIONS.find((c) => c.value === value);
  return found ? found.label : value;
}

async function doResearchVideo(model, niche, style, contentType) {
  const systemPrompt =
    'Kamu adalah periset tren untuk konten microstock VIDEO (Adobe Stock Footage). Tugasmu: cari sudut pandang/konsep video yang BELUM pasaran untuk kategori yang diberikan, dengan peluang nilai jual bagus. Gunakan pencarian web untuk cek gaya footage yang sedang naik daun, gap konten yang masih jarang, dan jenis video (b-roll, motion graphics, time-lapse, dsb) yang dicari tapi suplainya sedikit. Balas singkat dalam Bahasa Indonesia, poin-poin: (1) tren relevan saat ini untuk video stock, (2) celah yang bisa diisi, (3) 3-5 sudut pandang konkret untuk kategori ini. Langsung ke poin, tanpa basa-basi.';
  const userPrompt = `Kategori: "${niche}". Gaya visual: ${style}. Tipe konten: ${contentTypeLabel(contentType)}. Riset sudut pandang video stok yang unik dan berpotensi laku, hindari konsep yang sudah terlalu umum di Adobe Stock Footage.`;
  const data = await callClaude({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    maxTokens: 1200,
  });
  return extractText(data);
}

function contentTypeGuidance(contentType) {
  switch (contentType) {
    case 'motion_graphics':
      return 'Fokus ke bentuk/partikel/gradient abstrak yang bergerak halus, tidak perlu subjek dunia nyata yang literal, cocok untuk latar presentasi/background digital.';
    case 'timelapse':
      return 'Deskripsikan pergerakan yang dipercepat (awan bergerak cepat, pergantian cahaya siang-malam, keramaian yang mengalir cepat, dsb), sebutkan eksplisit "time-lapse" di prompt.';
    case 'slow_motion':
      return 'Deskripsikan gerakan yang diperlambat secara ekstrem dan halus (ultra slow motion), detail tekstur/partikel yang biasanya tidak terlihat di kecepatan normal, sebutkan eksplisit "slow motion" atau "high frame rate slow-mo" di prompt.';
    case 'seamless_loop':
      return 'WAJIB rancang supaya frame awal dan frame akhir terlihat serupa/menyambung mulus (seamless loop), sebutkan eksplisit "seamless loop" di prompt, cocok untuk video latar berulang.';
    default:
      return 'Footage sinematik naturalistik gaya b-roll dokumenter/komersial standar.';
  }
}

async function doGenerateVideo(model, { niche, style, mood, count, aspectRatio, cameraMovement, contentType, researchNote, avoidList, enhancementBlock, prohibitBlock }) {
  const systemPrompt =
    'Kamu adalah konsultan konten microstock VIDEO (Adobe Stock Footage) sekaligus penyusun prompt untuk Google Flow (yang menjalankan model Veo). Untuk tiap konsep, berikan analisis singkat gaya riset pasar DAN prompt video yang detail dan siap pakai. ' +
    'Ketentuan prompt video (field "prompt"): tulis dalam Bahasa Inggris, gunakan frasa singkat dan spesifik (bukan paragraf panjang bertele-tele) — ikuti urutan: subjek utama & aksi yang terjadi, setting/lokasi, gerakan kamera, pencahayaan, gaya visual, lalu penutup singkat soal pacing/durasi (sebutkan sekitar 8 detik). WAJIB sertakan instruksi eksplisit "no dialogue, no spoken words, no on-screen text, no subtitles, no logos" karena ini akan dijual sebagai b-roll/footage tanpa audio/teks. Jangan sertakan merek, karakter berhak cipta, atau wajah tokoh publik yang bisa dikenali. ' +
    'Ketentuan "negative_prompt": alih-alih cuma menulis larangan generik ("no blurry"), sebisa mungkin tulis sebagai SPESIFIKASI TEKNIS KONKRET yang mengunci hasil (misalnya "consistent lighting throughout, natural motion physics, sharp focus, no morphing artifacts, no flickering, no extra limbs, no warped hands, no text overlay, no watermark") — ini lebih efektif untuk model video dibanding larangan yang ditulis sebagai kalimat negatif biasa. ' +
    `Field lain: "title" (judul singkat konsep), "potential" (1-5 kelipatan 0.5), "competition" (frasa singkat Bahasa Indonesia), "usage" (kegunaan singkat dipisah koma, misal "iklan digital, konten media sosial, b-roll dokumenter, presentasi korporat"), "camera_movement" (gerakan kamera yang benar-benar dipakai di konsep ini — ${cameraMovement === 'otomatis' ? 'kamu bebas pilih yang paling cocok' : `HARUS "${cameraMovement}"`}), "duration_note" (satu frasa singkat Bahasa Indonesia soal durasi/pacing yang disarankan, misal "sekitar 8 detik, tempo tenang"). ` +
    'Balas HANYA dengan JSON array of objects berisi keys: title, potential, competition, usage, camera_movement, duration_note, prompt, negative_prompt. Tanpa teks lain, tanpa markdown fence.';

  const guidance = contentTypeGuidance(contentType);
  let userPrompt = `Buatkan ${count} konsep video berbeda untuk kategori: "${niche}". Gaya visual: ${style}. Rasio aspek target: ${aspectRatio} (sebutkan di prompt kalau relevan, tapi ini akan diset terpisah di Google Flow). Tipe konten: ${contentTypeLabel(contentType)} — ${guidance}`;
  if (cameraMovement !== 'otomatis') userPrompt += ` Gerakan kamera WAJIB: ${cameraMovement}.`;
  if (mood) userPrompt += ` Mood/pencahayaan: ${mood}.`;
  if (enhancementBlock) userPrompt += enhancementBlock;
  if (prohibitBlock) userPrompt += `\n\n${prohibitBlock}`;
  if (researchNote) {
    userPrompt += `\n\nHasil riset tren yang sudah dilakukan, jadikan dasar supaya konsepnya tidak pasaran:\n${researchNote}`;
  } else {
    userPrompt += ' Tidak ada riset web tambahan kali ini — tetap usahakan sudut pandang yang tidak generic.';
  }
  if (avoidList && avoidList.length) {
    userPrompt += `\n\nPENTING — daftar judul konsep video yang SUDAH PERNAH dibuat sebelumnya untuk kategori/niche yang sama:\n${avoidList
      .map((t) => `- ${t}`)
      .join('\n')}\nWAJIB buat ${count} konsep baru yang BENAR-BENAR BERBEDA dari daftar di atas.`;
  }

  const data = await callClaude({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 3000,
  });
  const raw = extractText(data);
  const ideas = extractJsonBlock(raw);
  if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('Hasil kosong, coba generate ulang.');
  return ideas;
}

async function doGenerateVideoFromImage(model, image, { niche, style, mood, count, aspectRatio, cameraMovement, contentType, avoidList, enhancementBlock, prohibitBlock }) {
  const systemPrompt =
    'Kamu adalah konsultan konten microstock VIDEO (Adobe Stock Footage) sekaligus penyusun prompt untuk Google Flow (Veo), khusus mode image-to-video. Kamu akan diberi SATU gambar. Tugasmu BUKAN membuat variasi gambar baru — tugasmu adalah membuat prompt yang menghidupkan gambar itu jadi video pendek dengan gerakan yang NATURAL dan MASUK AKAL sesuai konten gambar tsb (misalnya: kain/rambut bergoyang pelan, air mengalir, asap mengepul, awan bergerak, kamera drift halus, orang berkedip/bernapas halus, objek berputar pelan, dsb — sesuaikan dengan apa yang benar-benar ada di gambar). ' +
    'Untuk tiap konsep (kalau diminta lebih dari satu, buat variasi gerakan/kamera yang berbeda untuk gambar yang sama, bukan variasi visual gambarnya), berikan analisis singkat gaya riset pasar DAN prompt video yang detail. ' +
    'Ketentuan prompt video (field "prompt"): Bahasa Inggris, frasa singkat & spesifik, urutan: gerakan apa yang terjadi pada elemen di gambar, gerakan kamera, pencahayaan (pertahankan konsisten dengan gambar asli), gaya, penutup singkat soal pacing/durasi (~8 detik). WAJIB sertakan "no dialogue, no spoken words, no on-screen text, no subtitles, no logos". Jangan mengubah elemen yang secara jelas terlihat di gambar. ' +
    'Ketentuan "negative_prompt": spesifikasi teknis konkret (misalnya "maintain consistent lighting and colors from source image, natural motion physics, no morphing artifacts, no flickering, no warped proportions, no text overlay, no watermark"). ' +
    `Field lain: "title", "potential" (1-5 kelipatan 0.5), "competition", "usage", "camera_movement" (${cameraMovement === 'otomatis' ? 'pilih yang paling cocok untuk gambar ini' : `HARUS "${cameraMovement}"`}), "duration_note". ` +
    'Balas HANYA dengan JSON array of objects berisi keys: title, potential, competition, usage, camera_movement, duration_note, prompt, negative_prompt. Tanpa teks lain, tanpa markdown fence.';

  const guidance = contentTypeGuidance(contentType);
  let userText = `Kategori/niche: "${niche}". Gaya visual: ${style}. Rasio aspek target: ${aspectRatio}. Tipe konten: ${contentTypeLabel(contentType)} — ${guidance} Buatkan ${count} variasi konsep untuk menghidupkan gambar terlampir jadi video.`;
  if (cameraMovement !== 'otomatis') userText += ` Gerakan kamera WAJIB: ${cameraMovement}.`;
  if (mood) userText += ` Mood/pencahayaan: ${mood}.`;
  if (enhancementBlock) userText += enhancementBlock;
  if (prohibitBlock) userText += `\n\n${prohibitBlock}`;
  if (avoidList && avoidList.length) {
    userText += `\n\nPENTING — daftar judul konsep video yang SUDAH PERNAH dibuat sebelumnya untuk kategori/niche yang sama:\n${avoidList.map((t) => `- ${t}`).join('\n')}\nWAJIB buat konsep baru yang juga berbeda dari daftar ini.`;
  }

  const data = await callClaude({
    model,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: userText },
        ],
      },
    ],
    maxTokens: 3000,
  });
  const raw = extractText(data);
  const ideas = extractJsonBlock(raw);
  if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('Hasil kosong, coba generate ulang.');
  return ideas;
}

export default function VideoPromptGenerator() {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [genMode, setGenMode] = useState('text'); // 'text' | 'image'
  const [sourceImage, setSourceImage] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef(null);

  const [niche, setNiche] = useState('');
  const [useCustomNiche, setUseCustomNiche] = useState(false);
  const [nicheCustom, setNicheCustom] = useState('');
  const [style, setStyle] = useState(STYLE_OPTIONS[0]);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_OPTIONS[0].value);
  const [cameraMovement, setCameraMovement] = useState(CAMERA_OPTIONS[0].value);
  const [contentType, setContentType] = useState(CONTENT_TYPE_OPTIONS[0].value);
  const [mood, setMood] = useState('');
  const [count, setCount] = useState(5);
  const [modeHemat, setModeHemat] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [avoidDuplicates, setAvoidDuplicates] = useState(true);

  // ============ FITUR BARU: Prompt Enhancement ============
  const [lightingPreset, setLightingPreset] = useState('none');
  const [lensPreset, setLensPreset] = useState('none');
  const [filmPreset, setFilmPreset] = useState('none');
  const [prohibitIds, setProhibitIds] = useState([]);
  // Fitur 3: Motion Intensity Slider
  const [motionLevel, setMotionLevel] = useState(3);

  // ============ FITUR BARU: User Presets ============
  const [userPresets, setUserPresets] = useState([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // ============ FITUR BARU: Preview Mode & Refine ============
  const [previewMode, setPreviewMode] = useState(false);
  const [refiningId, setRefiningId] = useState(null);

  // ============ FITUR 3: Veo Parameter Inspector ============
  const [veoInspectorOpen, setVeoInspectorOpen] = useState(false);
  const [veoCopied, setVeoCopied] = useState(false);

  const [frames, setFrames] = useState([]);
  const [research, setResearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [videoTotal, setVideoTotal] = useState(0);
  const [risetTotal, setRisetTotal] = useState(0);
  const [sessionCost, setSessionCost] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  // ============ FITUR: Prompt DNA + Auto-Scorer ============
  const [dnaList, setDnaList] = useState([]);
  const [dnaSavedIds, setDnaSavedIds] = useState(new Set());
  const [showDnaPanel, setShowDnaPanel] = useState(false);

  const currentNiche = useMemo(() => (useCustomNiche ? nicheCustom.trim() : niche), [useCustomNiche, nicheCustom, niche]);

  // Muat total video & riset yang PERNAH dibuat dari database, sekali saat
  // tab ini pertama kali tampil, supaya angkanya tidak balik ke 0 tiap refresh.
  useEffect(() => {
    let cancelled = false;
    getCounts().then((counts) => {
      if (cancelled) return;
      setVideoTotal(counts[HISTORY_KIND] || 0);
      setRisetTotal(counts[RISET_KIND] || 0);
    });
    setUserPresets(listUserPresets('video'));
    setDnaList(getStoredDna());
    return () => {
      cancelled = true;
    };
  }, []);

  function handleNicheSelect(value) {
    if (value === '__custom__') {
      setUseCustomNiche(true);
    } else {
      setUseCustomNiche(false);
      setNiche(value);
    }
  }

  function handleProhibitToggle(id) {
    setProhibitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSaveAsDna(frame) {
    const updated = saveDna(frame);
    setDnaList(updated);
    setDnaSavedIds((prev) => new Set(prev).add(frame.id));
  }

  // ============ FITUR 6: User Presets (Video) ============
  function handleSavePreset() {
    if (!presetName.trim()) {
      alert('Berikan nama untuk preset ini');
      return;
    }
    const config = {
      niche: useCustomNiche ? nicheCustom : niche,
      style,
      aspectRatio,
      cameraMovement,
      contentType,
      mood,
      lightingPreset,
      lensPreset,
      filmPreset,
      prohibitIds,
      motionLevel,
    };
    const next = saveUserPreset('video', { name: presetName.trim(), config });
    setUserPresets(next);
    setPresetName('');
    setPresetModalOpen(false);
  }

  function handleDeletePreset(name) {
    const next = deleteUserPreset('video', name);
    setUserPresets(next);
  }

  function handleLoadPreset(preset) {
    const cfg = preset.config;
    if (cfg.niche) {
      if (NICHE_OPTIONS.some((o) => o.value === cfg.niche)) {
        setUseCustomNiche(false);
        setNiche(cfg.niche);
      } else {
        setUseCustomNiche(true);
        setNicheCustom(cfg.niche);
      }
    }
    if (cfg.style) setStyle(cfg.style);
    if (cfg.aspectRatio) setAspectRatio(cfg.aspectRatio);
    if (cfg.cameraMovement) setCameraMovement(cfg.cameraMovement);
    if (cfg.contentType) setContentType(cfg.contentType);
    if (cfg.mood) setMood(cfg.mood);
    if (cfg.lightingPreset) setLightingPreset(cfg.lightingPreset);
    if (cfg.lensPreset) setLensPreset(cfg.lensPreset);
    if (cfg.filmPreset) setFilmPreset(cfg.filmPreset);
    if (cfg.prohibitIds) setProhibitIds(cfg.prohibitIds);
    if (cfg.motionLevel) setMotionLevel(cfg.motionLevel);
  }

  // ============ FITUR 4: Refine & Improve (Video) ============
  async function refineFrame(frameId) {
    const frame = frames.find((f) => f.id === frameId);
    if (!frame) return;

    setRefiningId(frameId);
    setStatus(`Menyempurnakan prompt video "${frame.title}"…`);

    try {
      const refinePrompt = `Prompt video yang sudah ada:\n\n"${frame.prompt}"\n\nNegative prompt:\n"${frame.negative}"\n\nBuat versi yang lebih detail dan sinematik: perjelas tekstur permukaan, perkuat kontras pencahayaan, dan tambahkan detail gerakan yang lebih spesifik namun tetap natural. Tetap patuhi urutan: subjek & aksi, setting, gerakan kamera, pencahayaan, gaya, pacing. Balas HANYA dengan JSON object berisi keys: prompt, negative_prompt. Tanpa teks lain, tanpa markdown fence.`;

      const data = await callClaude({
        model,
        messages: [{ role: 'user', content: refinePrompt }],
        maxTokens: 2000,
      });

      const raw = extractText(data);
      const refined = extractJsonBlock(raw);

      setFrames((prev) =>
        prev.map((f) =>
          f.id === frameId
            ? {
                ...f,
                prompt: String(refined.prompt || f.prompt).trim(),
                negative: String(refined.negative_prompt || f.negative).trim(),
              }
            : f
        )
      );

      setSessionCost((prev) => prev + estimateCost(model, 'videoGenerate', 1));
      setTimeout(() => setStatus(''), 1000);
    } catch (err) {
      setError(`Gagal refine prompt video: ${err.message}`);
    } finally {
      setRefiningId(null);
    }
  }

  async function handleImageUpload(file) {
    if (!file) return;
    setError('');
    setImageBusy(true);
    try {
      const dataUrl = await readAsDataURL(file);
      const resized = await resizeImageToBase64(dataUrl, 1400);
      setSourceImage({ thumb: dataUrl, base64: resized.base64, mediaType: resized.mediaType, filename: file.name });
    } catch (err) {
      setError(`Gagal memuat gambar: ${err.message}`);
    } finally {
      setImageBusy(false);
    }
  }

  async function saveFrame(frame) {
    try {
      await saveItem({ kind: HISTORY_KIND, title: frame.title, model: frame.model, data: frame });
      setSavedIds((prev) => new Set(prev).add(frame.id));
    } catch (err) {
      setError(`Gagal menyimpan ke database: ${err.message}`);
    }
  }

  async function runGenerate() {
    setError('');
    const nicheVal = currentNiche;
    
    // Preview Mode override
    const actualCount = previewMode ? 1 : count;
    const actualModel = previewMode ? 'claude-haiku-4-5-20251001' : model;

    if (genMode === 'image' && !sourceImage) {
      setError('Upload gambar dulu.');
      return;
    }
    if (!nicheVal) {
      setError('Pilih atau isi dulu kategori/niche-nya.');
      return;
    }
      setBusy(true);
      setResearch('');
      setProgress({ done: 0, total: actualCount });
      try {
      let avoidList = [];
      if (avoidDuplicates) {
        try {
          const history = await listItems(HISTORY_KIND);
          avoidList = history
            .filter((it) => (it.data?.niche || '').trim().toLowerCase() === nicheVal.trim().toLowerCase())
            .map((it) => it.title)
            .filter(Boolean)
            .slice(0, MAX_AVOID_TITLES);
        } catch (e) {
          avoidList = [];
        }
      }

      let researchNote = '';
      let ideas;
      
      const enhancementBlock = buildEnhancementBlock(lightingPreset, lensPreset, filmPreset, motionLevel);
      const prohibitBlock = buildProhibitBlock(prohibitIds);
      
      const opts = { niche: nicheVal, style, mood, count: actualCount, aspectRatio, cameraMovement, contentType, avoidList, enhancementBlock, prohibitBlock };
      
      if (genMode === 'image') {
        setStatus(
          avoidList.length
            ? `Menganalisis gambar & menyusun ${actualCount} konsep video (menghindari ${avoidList.length} konsep lama)…`
            : `Menganalisis gambar & menyusun ${actualCount} konsep video…`
        );
        ideas = await doGenerateVideoFromImage(actualModel, sourceImage, opts);
      } else {
        if (!modeHemat && !previewMode) {
          setStatus('Meneliti tren video stok…');
          researchNote = await doResearchVideo(actualModel, nicheVal, style, contentType);
          if (researchNote) {
            setResearch(researchNote);
            setRisetTotal((t) => t + 1);
            saveItem({ kind: RISET_KIND, title: nicheVal, model: actualModel, data: { niche: nicheVal, style, research: researchNote } }).catch(() => {});
          }
        }
        setStatus(
          avoidList.length
            ? `Menyusun prompt video baru (menghindari ${avoidList.length} konsep lama)…`
            : 'Menyusun prompt video & negative prompt…'
        );
        ideas = await doGenerateVideo(actualModel, { ...opts, researchNote });
      }

      const newFrames = ideas.map((idea, i) => ({
        id: `${Date.now()}-${i}`,
        niche: nicheVal,
        title: String(idea.title || 'Tanpa judul').trim(),
        potential: Number(idea.potential) || 3,
        competition: String(idea.competition || '-').trim(),
        usage: String(idea.usage || '-').trim(),
        cameraMovement: String(idea.camera_movement || cameraMovement).trim(),
        durationNote: String(idea.duration_note || '').trim(),
        aspectRatio,
        contentType,
        prompt: String(idea.prompt || '').trim(),
        negative: String(idea.negative_prompt || '').trim(),
        fromImage: genMode === 'image',
        model: actualModel,
      }));
      setFrames((prev) => [...prev, ...newFrames]);
      setVideoTotal((t) => t + newFrames.length);
      setProgress({ done: actualCount, total: actualCount });
      setTimeout(() => setProgress(null), 1200);

      let costThisRun = 0;
      if (!modeHemat && !previewMode) costThisRun += estimateCost(actualModel, 'videoResearch');
      costThisRun += estimateCost(actualModel, genMode === 'image' ? 'videoGenerateFromImage' : 'videoGenerate', actualCount);
      setSessionCost((prev) => prev + costThisRun);

      if (autoSave && !previewMode) {
        newFrames.forEach((f) => saveFrame(f));
      }
      setPreviewMode(false);
    } catch (err) {
      setError(`Gagal memproses: ${err.message}. Coba tekan tombol generate lagi.`);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  function removeFrame(id) {
    setFrames((prev) => prev.filter((f) => f.id !== id));
  }

  function clearAll() {
    setFrames([]);
  }

  function copyFrame(f) {
    const combined = `${f.prompt} Negative prompt: ${f.negative}`;
    navigator.clipboard.writeText(combined).then(() => {
      setCopiedId(f.id);
      setTimeout(() => setCopiedId((c) => (c === f.id ? null : c)), 1400);
    });
  }

  function exportTxt() {
    const content = frames
      .map(
        (f, i) =>
          `${i + 1}. ${f.title}\n` +
          `Potensi: ${f.potential}/5 | Kompetisi: ${f.competition}\n` +
          `Kegunaan: ${f.usage}\n` +
          `Rasio: ${f.aspectRatio} | Kamera: ${f.cameraMovement} | Tipe: ${contentTypeLabel(f.contentType)} | Durasi: ${f.durationNote}\n` +
          `Prompt + Negative Prompt: ${f.prompt} Negative prompt: ${f.negative}`
      )
      .join('\n\n');
    downloadFile('noir-works-video-prompts.txt', content, 'text/plain');
  }

  function exportCsv() {
    const rows = [
      ['no', 'title', 'potensi', 'kompetisi', 'kegunaan', 'rasio_aspek', 'gerakan_kamera', 'tipe_konten', 'catatan_durasi', 'prompt_lengkap'],
    ].concat(
      frames.map((f, i) => [
        i + 1,
        f.title,
        f.potential,
        f.competition,
        f.usage,
        f.aspectRatio,
        f.cameraMovement,
        contentTypeLabel(f.contentType),
        f.durationNote,
        `${f.prompt} Negative prompt: ${f.negative}`,
      ])
    );
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('noir-works-video-prompts.csv', csv, 'text/csv');
  }

  return (
    <div>
      <div className="app-header">
        <div>
          <div className="eyebrow">CASE FILE · MOTION LAB</div>
          <h1 className="title">
            NO<span className="accent">Ï</span>R WORKS
          </h1>
          <div className="title-rule"></div>
          <p className="desc">
            Video Prompt Generator — susun prompt video detail buat Google Flow (Veo), siap dijual sebagai footage
            Adobe Stock.
          </p>
        </div>
        <div className="header-stats">
          <div className="stat-box">
            <div className="stat-value">{videoTotal}</div>
            <div className="stat-label">prompt</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{risetTotal}</div>
            <div className="stat-label">riset</div>
          </div>
          {sessionCost > 0 && (
            <div className="stat-box">
              <div className="stat-value" style={{ color: 'var(--gold)' }}>{formatUsd(sessionCost)}</div>
              <div className="stat-label">estimasi biaya</div>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <ModelSelect value={model} onChange={setModel} />
        {genMode === 'text' && (
          <label className="checkbox-row" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={modeHemat} onChange={(e) => setModeHemat(e.target.checked)} />
            <span>Mode hemat (matikan riset tren web — hemat biaya API)</span>
          </label>
        )}
        <label className="checkbox-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          <span>Simpan otomatis tiap hasil generate ke database (Neon)</span>
        </label>
        <label className="checkbox-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={avoidDuplicates} onChange={(e) => setAvoidDuplicates(e.target.checked)} />
          <span>Hindari konsep video yang mirip dengan riwayat video untuk niche yang sama (butuh database)</span>
        </label>
      </div>

      <div className="panel">
        <div className="field">
          <label>Sumber inspirasi</label>
          <div className="chip-row">
            <button type="button" className={'chip' + (genMode === 'text' ? ' active' : '')} onClick={() => setGenMode('text')}>
              Dari kategori (teks)
            </button>
            <button type="button" className={'chip' + (genMode === 'image' ? ' active' : '')} onClick={() => setGenMode('image')}>
              Dari gambar (image-to-video)
            </button>
          </div>
        </div>
        {genMode === 'image' && (
          <div className="field">
            <label>Gambar sumber</label>
            {!sourceImage ? (
              <div className="dropzone-mini" onClick={() => imageInputRef.current?.click()}>
                <p>{imageBusy ? 'Memuat gambar…' : 'Klik untuk upload gambar (JPG/PNG)'}</p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => handleImageUpload(e.target.files?.[0])}
                />
              </div>
            ) : (
              <div className="source-image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sourceImage.thumb} alt="" />
                <div>
                  <div style={{ fontSize: 12, color: 'var(--white)' }}>{sourceImage.filename}</div>
                  <button className="link-btn" onClick={() => setSourceImage(null)}>
                    Ganti gambar
                  </button>
                </div>
              </div>
            )}
            <div className="field-hint">
              AI akan membuat prompt yang menghidupkan gambar ini jadi video pendek dengan gerakan alami (bukan
              membuat gambar baru). Untuk hasil terbaik, cocokkan rasio aspek di bawah dengan orientasi gambar ini
              (lanskap → 16:9, potret → 9:16).
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="field">
          <label htmlFor="niche">Niche / kategori</label>
          <select id="niche" value={useCustomNiche ? '__custom__' : niche} onChange={(e) => handleNicheSelect(e.target.value)}>
            <option value="">— pilih kategori —</option>
            {NICHE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="__custom__">Lainnya (tulis sendiri)</option>
          </select>
          {useCustomNiche && (
            <input
              type="text"
              value={nicheCustom}
              onChange={(e) => setNicheCustom(e.target.value)}
              placeholder="mis. dapur restoran saat jam sibuk"
              style={{ marginTop: 10 }}
            />
          )}
        </div>

        <div className="field">
          <label>Gaya visual</label>
          <div className="chip-row">
            {STYLE_OPTIONS.map((s) => (
              <button key={s} type="button" className={'chip' + (style === s ? ' active' : '')} onClick={() => setStyle(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Rasio aspek</label>
          <div className="chip-row">
            {ASPECT_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={'chip' + (aspectRatio === o.value ? ' active' : '')} onClick={() => setAspectRatio(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          {/* ============ FITUR 5: Aspect Ratio Previewer ============ */}
          <div className="ratio-previewer">
            <div
              className={`ratio-box ${aspectRatio.replace(':', 'x')}`}
              style={{
                width: aspectRatio === '16:9' ? 96 : 54,
                height: aspectRatio === '16:9' ? 54 : 96,
              }}
            >
              <span>{aspectRatio}</span>
            </div>
            <span className="ratio-hint">
              {aspectRatio === '16:9'
                ? 'Horizontal · cocok untuk YouTube, TV, presentasi'
                : 'Vertikal · cocok untuk Reels, TikTok, Shorts'}
            </span>
          </div>
          <div className="field-hint">Veo/Google Flow cuma mendukung dua rasio ini untuk output video.</div>
        </div>

        <div className="field">
          <label>Gerakan kamera</label>
          <div className="chip-row">
            {CAMERA_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={'chip' + (cameraMovement === o.value ? ' active' : '')} onClick={() => setCameraMovement(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Tipe konten</label>
          <div className="chip-row">
            {CONTENT_TYPE_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={'chip' + (contentType === o.value ? ' active' : '')} onClick={() => setContentType(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="mood">Mood / pencahayaan (opsional)</label>
          <input id="mood" type="text" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="mis. cahaya keemasan sore hari, tenang" />
        </div>

        {/* ============ FITUR 3: Motion Intensity Slider ============ */}
        <div className="field">
          <label>Intensitas Gerakan (Motion Intensity)</label>
          <div className="count-row">
            <input type="range" min="1" max="5" value={motionLevel} onChange={(e) => setMotionLevel(Number(e.target.value))} />
            <span className="count-val">{motionLevel}</span>
          </div>
          <div className="field-hint">
            {MOTION_INTENSITY_LEVELS.find((m) => m.level === motionLevel)?.label}
          </div>
        </div>

        {/* ============ FITUR 3: Live Veo Parameter Inspector ============ */}
        <div className="field">
          <div className="preset-bar-header">
            <label className="field-label" style={{ margin: 0 }}>🎛️ Veo / Google Flow Parameter Inspector</label>
            <button type="button" className="link-btn" onClick={() => setVeoInspectorOpen((v) => !v)}>
              {veoInspectorOpen ? 'Sembunyikan' : 'Lihat rekomendasi parameter'}
            </button>
          </div>
          {veoInspectorOpen && (() => {
            const veo = buildVeoInspector({ aspectRatio, contentType, cameraMovement, motionLevel });
            return (
              <div className="veo-inspector">
                <div className="veo-grid">
                  <div className="veo-cell">
                    <span className="veo-key">Rasio</span>
                    <span className="veo-val">{veo.aspect.ratio} · {veo.aspect.resolution}</span>
                  </div>
                  <div className="veo-cell">
                    <span className="veo-key">Durasi</span>
                    <span className="veo-val">~{veo.duration} detik</span>
                  </div>
                  <div className="veo-cell">
                    <span className="veo-key">Motion Scale</span>
                    <span className="veo-val">{veo.motionScale} ({veo.motionLevel}/5)</span>
                  </div>
                  <div className="veo-cell">
                    <span className="veo-key">Stylization</span>
                    <span className="veo-val">{veo.stylization}</span>
                  </div>
                </div>
                <div className="veo-note"><b>Kamera:</b> {veo.cameraFlag}</div>
                <div className="veo-note"><b>Seed:</b> {veo.seed}</div>
                <div className="veo-note"><b>CFG:</b> {veo.cfgNote}</div>
                <div className="veo-note"><b>Negative Lock:</b> {veo.negativeHard}</div>
                <button
                  type="button"
                  className={'copy-btn-inline' + (veoCopied ? ' copied' : '')}
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    navigator.clipboard.writeText(veoInspectorToText(veo)).then(() => {
                      setVeoCopied(true);
                      setTimeout(() => setVeoCopied(false), 1400);
                    });
                  }}
                >
                  {veoCopied ? '✓ Disalin' : 'Salin Parameter Veo'}
                </button>
              </div>
            );
          })()}
        </div>

        {/* ============ FITUR 1: Prompt Engineering Presets (Video) ============ */}
        <div className="field">
          <label>Lighting Preset (Pencahayaan Teknis)</label>
          <div className="chip-row">
            {LIGHTING_PRESETS.map((p) => (
              <button key={p.id} type="button" className={'chip' + (lightingPreset === p.id ? ' active' : '')} onClick={() => setLightingPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Camera Lens / Perspective Preset</label>
          <div className="chip-row">
            {LENS_PRESETS.map((p) => (
              <button key={p.id} type="button" className={'chip' + (lensPreset === p.id ? ' active' : '')} onClick={() => setLensPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Film Stock / Color Texture Preset</label>
          <div className="chip-row">
            {FILM_PRESETS.map((p) => (
              <button key={p.id} type="button" className={'chip' + (filmPreset === p.id ? ' active' : '')} onClick={() => setFilmPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ============ FITUR 2: Negative Prompt Builder (Prohibit) Video ============ */}
        <div className="field">
          <label>Pencegahan Khusus Video (Negative Checklist)</label>
          <div className="checkbox-grid">
            {PROHIBIT_OPTIONS_VIDEO.map((p) => (
              <label key={p.id} className="checkbox-row">
                <input type="checkbox" checked={prohibitIds.includes(p.id)} onChange={() => handleProhibitToggle(p.id)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ============ FITUR 6: User Presets (Video) ============ */}
        <div className="field preset-bar">
          <div className="preset-bar-header">
            <label className="field-label" style={{ margin: 0 }}>Preset Pengaturan Saya</label>
            <button type="button" className="link-btn" onClick={() => setPresetModalOpen(true)}>
              + Simpan Preset Baru
            </button>
          </div>
          {userPresets.length > 0 ? (
            <div className="chip-row" style={{ marginTop: 8 }}>
              {userPresets.map((p) => (
                <div key={p.name} className="user-preset-chip">
                  <button type="button" className="chip" onClick={() => handleLoadPreset(p)}>
                    📂 {p.name}
                  </button>
                  <button type="button" className="preset-del-btn" onClick={() => handleDeletePreset(p.name)} title="Hapus preset ini">
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="field-hint">Belum ada preset tersimpan. Atur form di atas lalu simpan sebagai preset andalanmu.</div>
          )}
        </div>

        <div className="field">
          <label>Jumlah konsep</label>
          <div className="count-row">
            <input type="range" min="1" max="10" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <span className="count-val">{count}</span>
          </div>
        </div>

        {/* Modal Simpan Preset */}
        {presetModalOpen && (
          <div className="modal-overlay open">
            <div className="modal-panel" style={{ maxWidth: 400 }}>
              <div className="modal-head">
                <h3>Simpan Preset Video</h3>
                <button className="link-btn" onClick={() => setPresetModalOpen(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: 18 }}>
                <div className="field">
                  <label>Nama Preset</label>
                  <input
                    type="text"
                    placeholder="mis. Drone Golden Hour Landscape"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn-ghost" onClick={() => setPresetModalOpen(false)}>Batal</button>
                <button className="btn-primary" onClick={handleSavePreset}>Simpan</button>
              </div>
            </div>
          </div>
        )}

        <div className="btn-row" style={{ flexDirection: 'column' }}>
          <button className="btn-primary full" disabled={busy || (genMode === 'image' && (!sourceImage || imageBusy))} onClick={runGenerate}>
            {genMode === 'image' ? 'Buat prompt video dari gambar' : 'Riset & buatkan prompt video'}
          </button>
          
          {/* ============ FITUR 7: Preview Mode (Video) ============ */}
          <button
            className="btn-ghost full"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
            disabled={busy || (genMode === 'image' && (!sourceImage || imageBusy))}
            onClick={() => {
              setPreviewMode(true);
              runGenerate();
            }}
          >
            ⚡ Preview 1 Konsep Cepat (Hemat Token Haiku)
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {status && (
        <div className="status-row">
          <span className="spinner"></span> {status}
        </div>
      )}
      {research && (
        <div className="research-box">
          <div className="research-label">Catatan riset</div>
          <div className="research-text">{research}</div>
        </div>
      )}

      <div className="results-head">
        <h2>Hasil prompt video</h2>
        <div className="link-row">
          {sessionCost > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', marginRight: 10 }}>
              Estimasi biaya sesi ini: <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{formatUsd(sessionCost)}</span>
            </span>
          )}
          <button className="link-btn" disabled={!frames.length} onClick={exportTxt}>
            Unduh .txt
          </button>
          <button className="link-btn" disabled={!frames.length} onClick={exportCsv}>
            Unduh .csv
          </button>
          <button className="link-btn" disabled={!frames.length} onClick={clearAll}>
            Bersihkan
          </button>
        </div>
      </div>

      {frames.length === 0 ? (
        <div className="empty-state">
          <strong>Belum ada berkas di case file ini.</strong>
          <br />
          {genMode === 'image'
            ? 'Upload gambar di atas, isi kategori/gaya/rasio/gerakan kamera, lalu tekan "Buat prompt video dari gambar".'
            : 'Isi kategori, gaya, rasio aspek, dan gerakan kamera di atas, lalu tekan "Riset & buatkan prompt video".'}{' '}
          Tiap hasil berisi prompt video lengkap + negative prompt yang tinggal ditempel ke Google Flow.
        </div>
       ) : (
        <>
        {/* ============ DNA PANEL ============ */}
        <div style={{ marginBottom: 18 }}>
          <button
            className="btn-ghost full"
            style={{
              borderColor: dnaList.length > 0 ? 'var(--cyan)' : 'var(--line)',
              color: dnaList.length > 0 ? 'var(--cyan)' : 'var(--muted)',
              marginBottom: showDnaPanel ? 10 : 0,
            }}
            onClick={() => setShowDnaPanel((v) => !v)}
          >
            🧬 Prompt DNA Library {dnaList.length > 0 ? `(${dnaList.length} templates)` : '(kosong)'} {showDnaPanel ? '▴' : '▾'}
          </button>
          {showDnaPanel && (
            <div className="dna-panel">
              <div className="dna-panel-header">
                <strong>Prompt DNA Library</strong>
                <span className="field-hint">Template video yang terbukti sukses. Simpan dengan tombol "🧬 Simpan DNA".</span>
              </div>
              {dnaList.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  Belum ada DNA video tersimpan.
                </div>
              ) : (
                <div className="dna-grid">
                  {dnaList.map((dna) => (
                    <div key={dna.id} className="dna-card">
                      <div className="dna-card-header">
                        <span className="dna-niche-badge">{dna.niche}</span>
                        <button className="dna-del-btn" onClick={() => { const u = removeDna(dna.id); setDnaList(u); }} title="Hapus">×</button>
                      </div>
                      <div className="dna-card-title">{dna.title}</div>
                      <div className="dna-card-prompt">{dna.prompt?.slice(0, 150)}...</div>
                      <div className="dna-keywords">
                        {dna.keywords?.slice(0, 6).map((kw, i) => (<span key={i} className="dna-keyword-tag">{kw}</span>))}
                        {(dna.keywords?.length || 0) > 6 && <span className="dna-keyword-more">+{dna.keywords.length - 6}</span>}
                      </div>
                      <div className="dna-card-meta">{new Date(dna.createdAt).toLocaleDateString('id-ID')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="frames">
          {frames.map((f, i) => {
            const combined = `${f.prompt} Negative prompt: ${f.negative}`;
            const isSaved = savedIds.has(f.id);
            const dnaScore = calculatePromptScore(f.prompt, f.negative, dnaList);
            const isSavedDna = dnaSavedIds.has(f.id);
            return (
              <div className="frame" key={f.id}>
                <div className="frame-title-row">
                  {i + 1}. {f.title} {titleStars(f.potential)}
                  {f.fromImage && <span className="type-pill">Dari gambar</span>}
                  <span className="dna-grade-badge" style={{ backgroundColor: dnaScore.badgeColor + '22', color: dnaScore.badgeColor, border: `1px solid ${dnaScore.badgeColor}` }}>
                    {dnaScore.grade} · {dnaScore.score}%
                  </span>
                </div>
                <div className="meta-line">
                  <span className="meta-label">Potensi:</span> {starsMarkup(f.potential)}
                </div>
                <div className="meta-line">
                  <span className="meta-label">Kompetisi:</span> {f.competition}
                </div>
                <div className="meta-line">
                  <span className="meta-label">Kegunaan:</span> {f.usage}
                </div>
                <div className="meta-line">
                  <span className="meta-label">Video:</span>{' '}
                  <span className="meta-value-muted">
                    {f.aspectRatio} · {f.cameraMovement} · {contentTypeLabel(f.contentType)} · {f.durationNote}
                  </span>
                </div>
                <div className="prompt-label-row">
                  <div className="prompt-label">Prompt + Negative Prompt</div>
                  <button className={'copy-btn-inline' + (copiedId === f.id ? ' copied' : '')} onClick={() => copyFrame(f)}>
                    {copiedId === f.id ? '✓ Disalin' : 'Salin'}
                  </button>
                </div>
                <div className="prompt-copy-box">
                  <span className="prompt-copy-text">{combined}</span>
                </div>
                <div className="frame-actions">
                  <button
                    className="refine-btn"
                    onClick={() => refineFrame(f.id)}
                    disabled={refiningId === f.id}
                    title="Buat prompt video ini lebih detail dan sinematik"
                  >
                    {refiningId === f.id ? 'Menyempurnakan…' : '✨ Sempurnakan (Refine)'}
                  </button>
                  <button
                    className={'dna-btn' + (isSavedDna ? ' saved' : '')}
                    onClick={() => handleSaveAsDna(f)}
                    disabled={isSavedDna}
                    title="Jadikan template DNA standar sukses"
                  >
                    {isSavedDna ? '✓ Tersimpan DNA' : '🧬 Simpan DNA'}
                  </button>
                  <button className={'save-btn' + (isSaved ? ' saved' : '')} onClick={() => saveFrame(f)} disabled={isSaved}>
                    {isSaved ? 'Tersimpan di DB' : 'Simpan ke DB'}
                  </button>
                  <button onClick={() => removeFrame(f.id)}>Hapus</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <HistoryPanel
        kind={HISTORY_KIND}
        label="Video Prompt Generator"
        renderItem={(item) => (
          <div className="history-title">
            {item.title}
            {item.data?.niche ? <span style={{ color: 'var(--muted)' }}> — {item.data.niche}</span> : ''}
          </div>
        )}
      />

      <NicheStats kind={HISTORY_KIND} label="Video Prompt Generator" />

      <details className="reference-box" style={{ marginTop: 24 }}>
        <summary>ℹ️ Panduan &amp; Informasi Teknis Video (Klik untuk Membuka)</summary>
        <div className="reference-body footnote" style={{ margin: 0, padding: 14 }}>
          Riset dan prompt diproses lewat server aplikasi ini, API key tidak pernah terlihat di sisi klien. Hasil
          hilang saat direfresh kecuali disimpan ke database.
          <br />
          <br />
          <b>Catatan soal Google Flow/Veo:</b> sekali proses generate biasanya menghasilkan klip pendek (sekitar 5-8
          detik) — durasi &amp; rasio aspek akhir tetap harus kamu set manual di pengaturan Google Flow, teks di sini
          cuma panduan pacing. Prompt sengaja diarahkan tanpa dialog/audio/teks di layar karena footage Adobe Stock
          umumnya dijual tanpa audio.
          <br />
          <br />
          <b>Soal anti-duplikasi:</b> riwayat video terpisah dari riwayat Prompt Generator gambar. Rating potensi &amp;
          kompetisi adalah estimasi AI, bukan data resmi Adobe Stock.
        </div>
      </details>
    </div>
  );
}
