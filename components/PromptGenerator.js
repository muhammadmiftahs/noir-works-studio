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
  PROHIBIT_OPTIONS_IMAGE,
} from '../lib/promptPresets';
import {
  calculatePromptScore,
  getStoredDna,
  saveDna,
  removeDna,
} from '../lib/promptDna';

// Kind terpisah untuk catatan riset tren (beda dari kind "prompt"), supaya
// bisa dihitung total-nya dari database tanpa campur dengan hasil prompt.
const RISET_KIND = 'riset';

const NICHE_OPTIONS = [
  { value: 'wedding & undangan pernikahan', label: 'Wedding & undangan pernikahan' },
  { value: 'acara & perayaan (ulang tahun, wisuda, syukuran)', label: 'Acara & perayaan' },
  { value: 'bisnis & korporat', label: 'Bisnis & korporat' },
  { value: 'lifestyle & keluarga sehari-hari', label: 'Lifestyle & keluarga' },
  { value: 'alam & lanskap', label: 'Alam & lanskap' },
  { value: 'makanan & minuman', label: 'Makanan & minuman' },
  { value: 'teknologi & digital', label: 'Teknologi & digital' },
  { value: 'kesehatan & kebugaran', label: 'Kesehatan & kebugaran' },
  { value: 'pendidikan & sekolah', label: 'Pendidikan & sekolah' },
  { value: 'hari raya & musiman (lebaran, natal, tahun baru)', label: 'Hari raya & musiman' },
  { value: 'abstrak & tekstur latar', label: 'Abstrak & tekstur latar' },
];

const STYLE_OPTIONS = [
  'fotografi realistis',
  'ilustrasi flat / vektor',
  'kartun / cartoon',
  'render 3D lembut',
  'cat air (watercolor)',
  'line art minimalis',
  'film / analog vintage',
];

const BG_OPTIONS = [
  { value: 'putih polos', label: 'Putih polos' },
  { value: 'ada background/scene', label: 'Ada background' },
  { value: 'campur otomatis', label: 'Campur otomatis' },
];

const MAX_AVOID_TITLES = 40;

function buildEnhancementBlock(lightingId, lensId, filmId, prohibitIds) {
  const blocks = [];
  
  const lighting = LIGHTING_PRESETS.find((p) => p.id === lightingId);
  if (lighting?.prompt) blocks.push(`Lighting: ${lighting.prompt}`);
  
  const lens = LENS_PRESETS.find((p) => p.id === lensId);
  if (lens?.prompt) blocks.push(`Lens: ${lens.prompt}`);
  
  const film = FILM_PRESETS.find((p) => p.id === filmId);
  if (film?.prompt) blocks.push(`Film Stock: ${film.prompt}`);
  
  return blocks.length ? `\n\nTechnical Enhancements:\n${blocks.join('\n')}` : '';
}

function buildProhibitBlock(prohibitIds) {
  const prohibited = prohibitIds
    .map((id) => PROHIBIT_OPTIONS_IMAGE.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => p.negative)
    .join(', ');
  
  return prohibited ? `Prohibit: ${prohibited}` : '';
}

// ============ FITUR 2: Batch Prompt Variant Matrix ============
// Menggabungkan niche, style, dan lighting menjadi matriks varian silang
// untuk diproses dalam satu kali panggilan API (hemat token).
function buildMatrixCombinations(niches, styles, lightings) {
  const combos = [];
  for (const n of niches) {
    for (const s of styles) {
      for (const l of lightings) {
        combos.push({ niche: n, style: s, lighting: l });
      }
    }
  }
  return combos;
}

async function doMatrixGenerate(model, combos, bgChoice) {
  const comboLines = combos.map((c, i) => 
    `${i + 1}. Niche: "${c.niche}", Style: "${c.style}", Lighting: "${c.lighting}"`
  ).join('\n');

  const systemPrompt =
    'Kamu adalah konsultan konten microstock Adobe Stock sekaligus penyusun prompt image generation untuk Google Flow. ' +
    'Kamu akan diberi beberapa kombinasi parameter (niche, gaya visual, pencahayaan). Untuk TIAP kombinasi, buatkan SATU prompt gambar yang sangat detail dan siap pakai. ' +
    'Ketentuan prompt gambar (field "prompt"): tulis dalam Bahasa Inggris, 4-7 kalimat, jelaskan secara konkret: subjek utama, komposisi & sudut pandang, gaya visual, pencahayaan spesifik, palet warna, latar belakang, serta deskriptor kualitas komersial. ' +
    'Ketentuan "negative_prompt": daftar singkat elemen yang harus dihindari dalam Bahasa Inggris (dipisah koma). ' +
    'Field lain: "title" (judul singkat), "niche", "style", "lighting" (salinan dari parameter), "potential" (1-5 kelipatan 0.5), "competition" (frasa singkat Bahasa Indonesia), "orientation" (salah satu: "square 1:1", "portrait 3:4", "landscape 4:3", "widescreen 16:9"). ' +
    'Balas HANYA dengan JSON array of objects berisi keys: title, niche, style, lighting, potential, competition, orientation, prompt, negative_prompt. Tanpa teks lain, tanpa markdown fence.';

  let bgInstruction;
  if (bgChoice === 'putih polos') {
    bgInstruction = 'Semua konsep WAJIB pakai latar belakang putih polos bersih.';
  } else if (bgChoice === 'ada background/scene') {
    bgInstruction = 'Semua konsep WAJIB punya latar belakang berupa scene/lingkungan yang relevan dan detail.';
  } else {
    bgInstruction = 'Campur bebas antara latar putih polos dan latar scene/lingkungan.';
  }

  const userPrompt = `Buatkan ${combos.length} prompt gambar berbeda berdasarkan kombinasi parameter berikut:\n\n${comboLines}\n\n${bgInstruction}`;
  
  const data = await callClaude({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4000,
  });
  const raw = extractText(data);
  const ideas = extractJsonBlock(raw);
  if (!Array.isArray(ideas) || ideas.length === 0) throw new Error('Hasil matriks kosong, coba lagi.');
  return ideas;
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
function titleStars(value) {
  const n = Math.max(0, Math.min(5, Math.round(value)));
  return <span className="stars-gold">{'★'.repeat(n)}</span>;
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

async function doResearch(model, niche, style, bgChoice) {
  const systemPrompt =
    'Kamu adalah periset tren untuk konten microstock (Adobe Stock). Tugasmu: cari sudut pandang atau konsep visual yang BELUM pasaran/generic untuk kategori yang diberikan, yang punya peluang nilai jual dan traffic pencarian bagus. Gunakan pencarian web untuk mengecek gaya yang sedang naik daun, gap konten yang masih jarang, dan kata kunci yang dicari orang tapi suplainya masih sedikit. Balas singkat dalam Bahasa Indonesia, dalam poin-poin: (1) tren relevan saat ini, (2) celah yang bisa diisi, (3) 3-5 sudut pandang konkret yang direkomendasikan untuk kategori ini. Jangan beri pembuka atau penutup basa-basi, langsung ke poin-poinnya.';
  const userPrompt = `Kategori: "${niche}". Gaya visual: ${style}. Preferensi latar belakang: ${bgChoice}. Riset sudut pandang gambar stok yang unik dan berpotensi laku untuk kategori ini, hindari konsep yang sudah terlalu umum di Adobe Stock.`;
  const data = await callClaude({
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    maxTokens: 1200,
  });
  return extractText(data);
}

async function doGenerate(model, niche, style, mood, count, bgChoice, researchNote, avoidList, enhancementBlock, prohibitBlock) {
  const systemPrompt =
    'Kamu adalah konsultan konten microstock Adobe Stock sekaligus penyusun prompt image generation untuk Google Flow. Untuk tiap konsep, berikan analisis singkat gaya riset pasar (judul konsep, estimasi potensi jual, tingkat kompetisi, kegunaan komersial) DAN prompt gambar yang sangat detail dan lengkap. ' +
    'Ketentuan prompt gambar (field "prompt"): tulis dalam Bahasa Inggris, 4-7 kalimat, jelaskan secara konkret: subjek utama beserta detail bentuk/tekstur/material/pose, komposisi & sudut pandang, gaya visual sesuai yang diminta, pencahayaan spesifik, palet warna, latar belakang (ikuti instruksi latar yang diberikan), serta penutup berupa deskriptor kualitas komersial (misal "professional commercial illustration/photography, highly detailed, sharp focus, clean composition"). Jangan sertakan merek, logo, karakter berhak cipta, wajah tokoh publik, atau teks yang harus terbaca jelas di gambar. ' +
    'Ketentuan "negative_prompt": daftar singkat elemen yang harus dihindari dalam Bahasa Inggris (dipisah koma), sesuaikan dengan gaya & latar (misal untuk latar putih polos sertakan "no background clutter, no shadows on floor" dsb; untuk semua gaya umumnya sertakan seperti "blurry, low quality, watermark, extra limbs, distorted proportions, oversaturated, text, logo"). ' +
    'Field lain: "title" (judul singkat & jelas untuk konsep ini, boleh Bahasa Inggris jika lebih natural), "potential" (angka 1-5 kelipatan 0.5, estimasi potensi jual/nilai komersial), "competition" (frasa singkat Bahasa Indonesia, misal "Niche / rendah", "Sedang", "Tinggi / jenuh"), "usage" (daftar kegunaan singkat dipisah koma, misal "editorial, iklan sosial media, materi blog"), "orientation" (salah satu dari: "square 1:1", "portrait 3:4", "landscape 4:3", "widescreen 16:9", pilih yang paling cocok untuk kegunaannya), "background" (deskripsi singkat latar yang benar-benar dipakai pada prompt, misal "putih polos" atau "ada background/scene: nama tempat/suasana"). ' +
    'Balas HANYA dengan JSON array of objects berisi keys: title, potential, competition, usage, orientation, background, prompt, negative_prompt. Tanpa teks lain, tanpa markdown fence.';

  let bgInstruction;
  if (bgChoice === 'putih polos') {
    bgInstruction =
      'Semua konsep WAJIB pakai latar belakang putih polos bersih (isolated on plain white background), cocok untuk aset PNG/isolated.';
  } else if (bgChoice === 'ada background/scene') {
    bgInstruction =
      'Semua konsep WAJIB punya latar belakang berupa scene/lingkungan yang relevan dan detail (bukan putih polos), jelaskan suasananya di prompt.';
  } else {
    bgInstruction =
      'Campur bebas antara latar putih polos dan latar scene/lingkungan, pilih yang paling masuk akal secara komersial untuk tiap konsep, dan sebutkan pilihannya di field "background".';
  }

  let userPrompt = `Buatkan ${count} ide konsep + prompt gambar berbeda untuk kategori: "${niche}". Gaya visual: ${style}. ${bgInstruction}`;
  if (mood) userPrompt += ` Mood/pencahayaan: ${mood}.`;
  if (enhancementBlock) userPrompt += enhancementBlock;
  if (prohibitBlock) userPrompt += `\n\n${prohibitBlock}`;
  if (researchNote) {
    userPrompt += `\n\nHasil riset tren yang sudah dilakukan, gunakan ini sebagai dasar supaya konsepnya tidak pasaran dan rating potensi/kompetisi konsisten dengan temuan ini:\n${researchNote}`;
  } else {
    userPrompt += ' Tidak ada riset web tambahan kali ini — tetap usahakan sudut pandang yang tidak generic berdasarkan pengetahuanmu tentang tren microstock.';
  }
  if (avoidList && avoidList.length) {
    userPrompt += `\n\nPENTING — daftar judul konsep yang SUDAH PERNAH dibuat sebelumnya untuk kategori/niche yang sama (tersimpan di riwayat database aplikasi ini):\n${avoidList
      .map((t) => `- ${t}`)
      .join('\n')}\nWAJIB buat ${count} konsep baru yang BENAR-BENAR BERBEDA dari daftar di atas — subjek, sudut pandang, atau angle-nya harus baru, jangan cuma menulis ulang dengan kata-kata berbeda untuk ide yang sama.`;
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

async function doGenerateFromImage(model, image, niche, style, mood, count, bgChoice, avoidList, enhancementBlock, prohibitBlock) {
  const systemPrompt =
    'Kamu adalah konsultan konten microstock Adobe Stock sekaligus penyusun prompt image generation untuk Google Flow. Kamu akan diberi SATU gambar referensi. ' +
    'ATURAN PALING PENTING: jangan mendeskripsikan ulang gambar itu apa adanya secara persis — itu akan menghasilkan gambar yang nyaris identik dan berisiko kena tolak similarity check di Adobe Stock. Tugasmu adalah membuat konsep BARU yang terinspirasi dari gaya visual, mood, palet warna, dan/atau komposisi gambar itu, TAPI dengan perubahan nyata dan disengaja pada beberapa elemen kunci untuk tiap konsep — misalnya: pose/sudut pandang subjek, arah pencahayaan, detail latar belakang, kombinasi warna, aksesori/objek pendukung, ekspresi, waktu, atau elemen komposisi lain. Tujuannya supaya hasil akhirnya tetap terasa "senada"/terinspirasi tapi CUKUP BERBEDA secara visual dari gambar sumber. ' +
    'Untuk tiap konsep, berikan analisis singkat gaya riset pasar (judul konsep, estimasi potensi jual, tingkat kompetisi, kegunaan komersial) DAN prompt gambar yang sangat detail dan lengkap. ' +
    'Ketentuan prompt gambar (field "prompt"): tulis dalam Bahasa Inggris, 4-7 kalimat, jelaskan secara konkret: subjek utama beserta detail bentuk/tekstur/material/pose, komposisi & sudut pandang, gaya visual sesuai yang diminta, pencahayaan spesifik, palet warna, latar belakang (ikuti instruksi latar yang diberikan), serta penutup berupa deskriptor kualitas komersial. Jangan sertakan merek, logo, karakter berhak cipta, wajah tokoh publik, atau teks yang harus terbaca jelas di gambar. ' +
    'Ketentuan "negative_prompt": daftar singkat elemen yang harus dihindari dalam Bahasa Inggris (dipisah koma). ' +
    'Field lain: "title" (judul singkat konsep), "potential" (angka 1-5 kelipatan 0.5), "competition" (frasa singkat Bahasa Indonesia), "usage" (kegunaan singkat dipisah koma), "orientation" (salah satu dari: "square 1:1", "portrait 3:4", "landscape 4:3", "widescreen 16:9"), "background" (deskripsi latar yang benar-benar dipakai), dan "diff_note" (SATU kalimat singkat Bahasa Indonesia yang menyebutkan secara konkret elemen apa yang sengaja dibuat berbeda dari gambar sumber untuk konsep ini, misalnya "Sudut pandang diubah jadi dari atas, warna pakaian diganti biru tua, ditambahkan elemen tanaman di latar belakang"). ' +
    'Balas HANYA dengan JSON array of objects berisi keys: title, potential, competition, usage, orientation, background, prompt, negative_prompt, diff_note. Tanpa teks lain, tanpa markdown fence.';

  let bgInstruction;
  if (bgChoice === 'putih polos') {
    bgInstruction = 'Semua konsep WAJIB pakai latar belakang putih polos bersih (isolated on plain white background).';
  } else if (bgChoice === 'ada background/scene') {
    bgInstruction = 'Semua konsep WAJIB punya latar belakang berupa scene/lingkungan yang relevan dan detail (bukan putih polos).';
  } else {
    bgInstruction = 'Campur bebas antara latar putih polos dan latar scene/lingkungan, pilih yang paling masuk akal untuk tiap konsep.';
  }

  let userText = `Kategori/niche: "${niche}". Gaya visual yang diinginkan: ${style}. ${bgInstruction} Buatkan ${count} konsep baru yang terinspirasi dari gambar terlampir, dengan perbedaan nyata di beberapa elemen kunci seperti dijelaskan di instruksi sistem — jangan sampai ada dua konsep yang perbedaannya cuma di satu elemen kecil yang sama.`;
  if (mood) userText += ` Mood/pencahayaan: ${mood}.`;
  if (enhancementBlock) userText += enhancementBlock;
  if (prohibitBlock) userText += `\n\n${prohibitBlock}`;
  if (avoidList && avoidList.length) {
    userText += `\n\nPENTING — daftar judul konsep yang SUDAH PERNAH dibuat sebelumnya untuk kategori/niche yang sama (tersimpan di riwayat database aplikasi ini):\n${avoidList
      .map((t) => `- ${t}`)
      .join('\n')}\nWAJIB buat konsep baru yang juga berbeda dari daftar ini.`;
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

export default function PromptGenerator() {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [genMode, setGenMode] = useState('text');
  const [sourceImage, setSourceImage] = useState(null);
  const [imageBusy, setImageBusy] = useState(false);
  const imageInputRef = useRef(null);
  const [niche, setNiche] = useState('');
  const [useCustomNiche, setUseCustomNiche] = useState(false);
  const [nicheCustom, setNicheCustom] = useState('');
  const [style, setStyle] = useState(STYLE_OPTIONS[0]);
  const [bg, setBg] = useState(BG_OPTIONS[2].value);
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

  // ============ FITUR BARU: User Presets ============
  const [userPresets, setUserPresets] = useState([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');

  // ============ FITUR: Prompt DNA + Auto-Scorer ============
  const [dnaList, setDnaList] = useState([]);
  const [dnaSavedIds, setDnaSavedIds] = useState(new Set());
  const [showDnaPanel, setShowDnaPanel] = useState(false);

  // ============ FITUR BARU: Preview Mode ============
  const [previewMode, setPreviewMode] = useState(false);

  // ============ FITUR BARU: Batch Matrix Mode (Fitur 2) ============
  const [matrixMode, setMatrixMode] = useState(false);
  const [matrixNiches, setMatrixNiches] = useState([]);
  const [matrixStyles, setMatrixStyles] = useState([]);
  const [matrixLightings, setMatrixLightings] = useState([]);
  const [matrixBusy, setMatrixBusy] = useState(false);

  // ============ FITUR BARU: Refine Frame ============
  const [refiningId, setRefiningId] = useState(null);

  const [frames, setFrames] = useState([]);
  const [research, setResearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const [promptTotal, setPromptTotal] = useState(0);
  const [risetTotal, setRisetTotal] = useState(0);
  const [sessionCost, setSessionCost] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const currentNiche = useMemo(() => (useCustomNiche ? nicheCustom.trim() : niche), [useCustomNiche, nicheCustom, niche]);

  useEffect(() => {
    let cancelled = false;
    getCounts().then((counts) => {
      if (cancelled) return;
      setPromptTotal(counts.prompt || 0);
      setRisetTotal(counts.riset || 0);
    });
    // Load user presets saat komponen mount
    const presets = listUserPresets('image');
    setUserPresets(presets);
    // Load DNA list
    setDnaList(getStoredDna());
    return () => {
      cancelled = true;
    };
  }, []);

  // ... existing handlers ...

  function handleSaveAsDna(frame) {
    const updated = saveDna(frame);
    setDnaList(updated);
    setDnaSavedIds((prev) => new Set(prev).add(frame.id));
  }

  function handleNicheSelect(value) {
    if (value === '__custom__') {
      setUseCustomNiche(true);
    } else {
      setUseCustomNiche(false);
      setNiche(value);
    }
  }

  function handleProhibitToggle(id) {
    setProhibitIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      } else {
        return [...prev, id];
      }
    });
  }

  function handleSavePreset() {
    if (!presetName.trim()) {
      alert('Berikan nama untuk preset ini');
      return;
    }
    const config = {
      niche: useCustomNiche ? nicheCustom : niche,
      style,
      bg,
      mood,
      lightingPreset,
      lensPreset,
      filmPreset,
      prohibitIds,
    };
    const next = saveUserPreset('image', { name: presetName.trim(), config });
    setUserPresets(next);
    setPresetName('');
    setPresetModalOpen(false);
  }

  function handleDeletePreset(name) {
    const next = deleteUserPreset('image', name);
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
    if (cfg.bg) setBg(cfg.bg);
    if (cfg.mood) setMood(cfg.mood);
    if (cfg.lightingPreset) setLightingPreset(cfg.lightingPreset);
    if (cfg.lensPreset) setLensPreset(cfg.lensPreset);
    if (cfg.filmPreset) setFilmPreset(cfg.filmPreset);
    if (cfg.prohibitIds) setProhibitIds(cfg.prohibitIds);
  }

  async function refineFrame(frameId) {
    const frame = frames.find((f) => f.id === frameId);
    if (!frame) return;
    
    setRefiningId(frameId);
    setStatus(`Menyempurnakan prompt "${frame.title}"…`);
    
    try {
      const refinePrompt = `Prompt yang sudah ada:\n\n"${frame.prompt}"\n\nNegative prompt:\n"${frame.negative}"\n\nSekarang buat versi yang lebih detail, dengan elemen tekstur lebih kuat, pencahayaan lebih kontras, dan detail subjek lebih spesifik. Balas HANYA dengan JSON object berisi keys: prompt, negative_prompt. Tanpa teks lain, tanpa markdown fence.`;
      
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
      
      setSessionCost((prev) => prev + estimateCost(model, 'generate', 1));
      
      setTimeout(() => setStatus(''), 1000);
    } catch (err) {
      setError(`Gagal refine prompt: ${err.message}`);
    } finally {
      setRefiningId(null);
    }
  }

  function randomizeInputs() {
    const nicheOpt = NICHE_OPTIONS[Math.floor(Math.random() * NICHE_OPTIONS.length)];
    const styleOpt = STYLE_OPTIONS[Math.floor(Math.random() * STYLE_OPTIONS.length)];
    const bgOpt = BG_OPTIONS[Math.floor(Math.random() * BG_OPTIONS.length)];
    setUseCustomNiche(false);
    setNiche(nicheOpt.value);
    setStyle(styleOpt);
    setBg(bgOpt.value);
    setMood('');
    return { niche: nicheOpt.value, style: styleOpt, bg: bgOpt.value, mood: '' };
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
      await saveItem({ kind: 'prompt', title: frame.title, model: frame.model, data: frame });
      setSavedIds((prev) => new Set(prev).add(frame.id));
    } catch (err) {
      setError(`Gagal menyimpan ke database: ${err.message}`);
    }
  }

  // ============ FITUR 2: Jalankan Batch Matrix ============
  async function runMatrix() {
    setError('');
    if (matrixNiches.length === 0 || matrixStyles.length === 0 || matrixLightings.length === 0) {
      setError('Pilih minimal 1 niche, 1 gaya visual, dan 1 pencahayaan untuk membuat matriks.');
      return;
    }
    const combos = buildMatrixCombinations(matrixNiches, matrixStyles, matrixLightings);
    if (combos.length > 30) {
      setError(`Matriks menghasilkan ${combos.length} kombinasi — maksimal 30 agar hemat token. Kurangi pilihan.`);
      return;
    }
    setMatrixBusy(true);
    setBusy(true);
    setProgress({ done: 0, total: combos.length });
    setStatus(`Membuat ${combos.length} varian dari matriks parameter…`);
    try {
      // Gunakan model paling hemat secara default untuk matriks (biaya efisien).
      const matrixModel = 'claude-haiku-4-5-20251001';
      const ideas = await doMatrixGenerate(matrixModel, combos, bg);
      const newFrames = ideas.map((idea, i) => ({
        id: `${Date.now()}-mx-${i}`,
        niche: String(idea.niche || '').trim(),
        title: String(idea.title || 'Tanpa judul').trim(),
        potential: Number(idea.potential) || 3,
        competition: String(idea.competition || '-').trim(),
        usage: `Matriks: ${idea.style || ''} / ${idea.lighting || ''}`,
        orientation: String(idea.orientation || 'auto').trim(),
        background: bg,
        prompt: String(idea.prompt || '').trim(),
        negative: String(idea.negative_prompt || '').trim(),
        diffNote: '',
        fromImage: false,
        fromMatrix: true,
        model: matrixModel,
      })).filter((f) => f.prompt);
      setFrames((prev) => [...prev, ...newFrames]);
      setPromptTotal((t) => t + newFrames.length);
      setProgress({ done: combos.length, total: combos.length });
      setTimeout(() => setProgress(null), 1200);
      setSessionCost((prev) => prev + estimateCost(matrixModel, 'generate', combos.length));
      if (autoSave) newFrames.forEach((f) => saveFrame(f));
    } catch (err) {
      setError(`Gagal membuat matriks: ${err.message}`);
    } finally {
      setMatrixBusy(false);
      setBusy(false);
      setStatus('');
    }
  }

  function toggleMatrixItem(list, setList, value) {
    setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function runGenerate(overrides = {}) {
    setError('');
    const nicheVal = overrides.niche !== undefined ? overrides.niche : currentNiche;
    const styleVal = overrides.style !== undefined ? overrides.style : style;
    const bgVal = overrides.bg !== undefined ? overrides.bg : bg;
    const moodVal = overrides.mood !== undefined ? overrides.mood : mood;
    
    // Preview Mode override
    const actualCount = previewMode ? 1 : count;
    const actualModel = previewMode ? 'claude-haiku-4-5-20251001' : model;

    if (genMode === 'image' && !sourceImage) {
      setError('Upload gambar referensi dulu.');
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
          const history = await listItems('prompt');
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
      
      const enhancementBlock = buildEnhancementBlock(lightingPreset, lensPreset, filmPreset);
      const prohibitBlock = buildProhibitBlock(prohibitIds);

      if (genMode === 'image') {
        setStatus(
          avoidList.length
            ? `Menganalisis gambar & menyusun ${actualCount} konsep baru (menghindari ${avoidList.length} konsep lama)…`
            : `Menganalisis gambar & menyusun ${actualCount} konsep baru…`
        );
        ideas = await doGenerateFromImage(actualModel, sourceImage, nicheVal, styleVal, moodVal, actualCount, bgVal, avoidList, enhancementBlock, prohibitBlock);
      } else {
        if (!modeHemat && !previewMode) {
          setStatus('Meneliti tren & celah pasar Adobe Stock…');
          researchNote = await doResearch(actualModel, nicheVal, styleVal, bgVal);
          if (researchNote) {
            setResearch(researchNote);
            setRisetTotal((t) => t + 1);
            saveItem({ kind: RISET_KIND, title: nicheVal, model: actualModel, data: { niche: nicheVal, style: styleVal, research: researchNote } }).catch(() => {});
          }
        }
        setStatus(
          avoidList.length
            ? `Menyusun prompt baru (menghindari ${avoidList.length} konsep lama untuk niche ini)…`
            : 'Menyusun prompt detail & negative prompt…'
        );
        ideas = await doGenerate(actualModel, nicheVal, styleVal, moodVal, actualCount, bgVal, researchNote, avoidList, enhancementBlock, prohibitBlock);
      }
      const newFrames = ideas.map((idea, i) => ({
        id: `${Date.now()}-${i}`,
        niche: nicheVal,
        title: String(idea.title || 'Tanpa judul').trim(),
        potential: Number(idea.potential) || 3,
        competition: String(idea.competition || '-').trim(),
        usage: String(idea.usage || '-').trim(),
        orientation: String(idea.orientation || 'auto').trim(),
        background: String(idea.background || bgVal).trim(),
        prompt: String(idea.prompt || '').trim(),
        negative: String(idea.negative_prompt || '').trim(),
        diffNote: genMode === 'image' ? String(idea.diff_note || '').trim() : '',
        fromImage: genMode === 'image',
        model: actualModel,
      }));
      setFrames((prev) => [...prev, ...newFrames]);
      setPromptTotal((t) => t + newFrames.length);
      setProgress({ done: actualCount, total: actualCount });
      setTimeout(() => setProgress(null), 1200);
      
      let costThisRun = 0;
      if (!modeHemat && !previewMode) costThisRun += estimateCost(actualModel, 'research');
      costThisRun += estimateCost(actualModel, genMode === 'image' ? 'generateFromImage' : 'generate', actualCount);
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

  function handleSurprise() {
    const overrides = randomizeInputs();
    setPreviewMode(false);
    runGenerate(overrides);
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
          `Format: ${f.orientation} | Latar: ${f.background}\n` +
          `Prompt + Negative Prompt: ${f.prompt} Negative prompt: ${f.negative}`
      )
      .join('\n\n');
    downloadFile('noir-works-prompts.txt', content, 'text/plain');
  }

  function exportCsv() {
    const rows = [['no', 'title', 'potensi', 'kompetisi', 'kegunaan', 'orientasi', 'latar', 'prompt_lengkap']].concat(
      frames.map((f, i) => [i + 1, f.title, f.potential, f.competition, f.usage, f.orientation, f.background, `${f.prompt} Negative prompt: ${f.negative}`])
    );
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile('noir-works-prompts.csv', csv, 'text/csv');
  }

  return (
    <div>
      <div className="app-header">
        <div>
          <div className="eyebrow">CASE FILE · PROMPT LAB</div>
          <h1 className="title">
            NO<span className="accent">Ï</span>R WORKS
          </h1>
          <div className="title-rule"></div>
          <p className="desc">
            Prompt Generator — riset tren dulu, baru susun prompt gambar unik buat Adobe Stock, siap tempel ke Google
            Flow.
          </p>
        </div>
        <div className="header-stats">
          <div className="stat-box">
            <div className="stat-value">{promptTotal}</div>
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
          <span>Hindari konsep yang mirip dengan riwayat tersimpan untuk niche yang sama (butuh database)</span>
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
              Dari gambar (upload)
            </button>
          </div>
        </div>
        {genMode === 'image' && (
          <div className="field">
            <label>Gambar referensi</label>
            {!sourceImage ? (
              <div className="dropzone-mini" onClick={() => imageInputRef.current?.click()}>
                <p>{imageBusy ? 'Memuat gambar…' : 'Klik untuk upload gambar referensi (JPG/PNG)'}</p>
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
              AI akan membuat konsep baru yang terinspirasi gaya/komposisi gambar ini, dengan perubahan nyata di
              beberapa elemen (pose, warna, latar, detail) — bukan menjiplak persis. Ini membantu mengurangi risiko
              similarity di Adobe Stock, tapi bukan jaminan mutlak lolos, karena Adobe Stock punya sistem deteksi
              sendiri yang tidak bisa kita uji dari sini. Pastikan juga gambar yang di-upload adalah milikmu sendiri
              atau bebas dipakai sebagai referensi.
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
              placeholder="mis. pasar tradisional pagi hari"
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
          <label>Latar belakang</label>
          <div className="chip-row">
            {BG_OPTIONS.map((o) => (
              <button key={o.value} type="button" className={'chip' + (bg === o.value ? ' active' : '')} onClick={() => setBg(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="field-hint">
            &quot;Putih polos&quot; cocok buat aset isolated/PNG, &quot;ada background&quot; cocok buat gambar suasana/scene.
            &quot;Campur otomatis&quot; biarkan AI pilih yang paling pas per konsep.
          </div>
        </div>

        <div className="field">
          <label htmlFor="mood">Mood / pencahayaan (opsional)</label>
          <input id="mood" type="text" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="mis. cahaya keemasan sore hari, tenang" />
        </div>

        {/* ============ FITUR 1: Prompt Engineering Presets ============ */}
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

        {/* ============ FITUR 2: Negative Prompt Builder (Prohibit) ============ */}
        <div className="field">
          <label>Pencegahan Khusus (Negative Checklist)</label>
          <div className="checkbox-grid">
            {PROHIBIT_OPTIONS_IMAGE.map((p) => (
              <label key={p.id} className="checkbox-row">
                <input type="checkbox" checked={prohibitIds.includes(p.id)} onChange={() => handleProhibitToggle(p.id)} />
                <span>{p.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ============ FITUR 6: User Presets (Save/Load) ============ */}
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
          <label>Jumlah prompt</label>
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
                <h3>Simpan Preset Pengaturan</h3>
                <button className="link-btn" onClick={() => setPresetModalOpen(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: 18 }}>
                <div className="field">
                  <label>Nama Preset</label>
                  <input
                    type="text"
                    placeholder="mis. Wedding Portra Softbox"
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
          <button
            className="btn-primary full"
            disabled={busy || (genMode === 'image' && (!sourceImage || imageBusy))}
            onClick={() => runGenerate()}
          >
            {genMode === 'image' ? 'Buat konsep dari gambar' : 'Riset & buatkan prompt'}
          </button>
          
          {/* ============ FITUR 7: Preview Mode (Single Concept with Haiku) ============ */}
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

          {genMode === 'text' && (
            <button className="btn-ghost full" disabled={busy} onClick={handleSurprise}>
              Kejutkan saya (acak)
            </button>
          )}

          {/* ============ FITUR 2: Toggle Batch Matrix Mode ============ */}
          {genMode === 'text' && (
            <button
              className="btn-ghost full"
              style={{ borderColor: matrixMode ? 'var(--cyan)' : 'var(--line)', color: matrixMode ? 'var(--cyan)' : 'var(--muted)' }}
              disabled={busy}
              onClick={() => setMatrixMode((m) => !m)}
            >
              🧮 Mode Batch Matrix {matrixMode ? '(aktif)' : '(buat puluhan varian)'}
            </button>
          )}
        </div>

        {/* ============ FITUR 2: Panel Batch Matrix ============ */}
        {matrixMode && genMode === 'text' && (
          <div className="matrix-panel">
            <div className="matrix-header">
              <strong>🧮 Batch Prompt Variant Matrix</strong>
              <span className="field-hint">Kombinasi silang niche × gaya × pencahayaan. Maks 30 varian, memakai model Haiku (hemat).</span>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label>Niche (pilih banyak)</label>
              <div className="chip-row">
                {NICHE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={'chip' + (matrixNiches.includes(o.value) ? ' active' : '')}
                    onClick={() => toggleMatrixItem(matrixNiches, setMatrixNiches, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Gaya Visual (pilih banyak)</label>
              <div className="chip-row">
                {STYLE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={'chip' + (matrixStyles.includes(s) ? ' active' : '')}
                    onClick={() => toggleMatrixItem(matrixStyles, setMatrixStyles, s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Pencahayaan (pilih banyak)</label>
              <div className="chip-row">
                {LIGHTING_PRESETS.filter((p) => p.prompt).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={'chip' + (matrixLightings.includes(p.prompt) ? ' active' : '')}
                    onClick={() => toggleMatrixItem(matrixLightings, setMatrixLightings, p.prompt)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="matrix-summary">
              Total kombinasi: <strong>{matrixNiches.length} × {matrixStyles.length} × {matrixLightings.length} = {matrixNiches.length * matrixStyles.length * matrixLightings.length} varian</strong>
            </div>

            <button className="btn-primary full" style={{ marginTop: 12 }} disabled={busy || matrixBusy} onClick={runMatrix}>
              {matrixBusy ? 'Membuat matriks…' : '🚀 Generate Semua Varian Matriks'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}
       {busy && progress && (
        <div className="status-row">
          <span className="spinner"></span> {status}
          <div className="progress-wrap" style={{ marginLeft: 10 }}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}></div>
            </div>
            <span>{progress.done}/{progress.total}</span>
          </div>
        </div>
       )}
      {research && (
        <div className="research-box">
          <div className="research-label">Catatan riset</div>
          <div className="research-text">{research}</div>
        </div>
      )}

      <div className="results-head">
        <h2>Hasil prompt</h2>
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
                ? 'Upload gambar referensi di atas, isi kategori/gaya/latar, lalu tekan "Buat konsep dari gambar". Tiap hasil akan menampilkan konsep baru yang terinspirasi gambar itu, lengkap dengan catatan elemen yang sengaja dibuat berbeda.'
                : 'Isi kategori, gaya, dan latar belakang di atas, lalu tekan "Riset & buatkan prompt". Tiap hasil akan menampilkan judul konsep, estimasi potensi jual, tingkat kompetisi, kegunaan, dan satu box prompt+negative prompt yang tinggal disalin ke Google Flow.'}
            </div>
          ) : (
            <>
            {/* ============ DNA MANAGEMENT PANEL ============ */}
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
                🧬 Prompt DNA Library {dnaList.length > 0 ? `(${dnaList.length} templates tersimpan)` : '(kosong)'} {showDnaPanel ? '▴' : '▾'}
              </button>
              {showDnaPanel && (
                <div className="dna-panel">
                  <div className="dna-panel-header">
                    <strong>Prompt DNA Library</strong>
                    <span className="field-hint">Template prompt yang sudah terbukti laku / menjadi standar sukses Anda. Simpan dengan tombol "🧬 Simpan DNA" pada hasil prompt.</span>
                  </div>
                  {dnaList.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                      Belum ada DNA tersimpan. Setelah generate prompt, klik tombol 🧬 "Simpan DNA" untuk menjadikannya template standar.
                    </div>
                  ) : (
                    <div className="dna-grid">
                      {dnaList.map((dna) => (
                        <div key={dna.id} className="dna-card">
                          <div className="dna-card-header">
                            <span className="dna-niche-badge">{dna.niche}</span>
                            <button
                              className="dna-del-btn"
                              onClick={() => {
                                const updated = removeDna(dna.id);
                                setDnaList(updated);
                              }}
                              title="Hapus DNA ini"
                            >
                              ×
                            </button>
                          </div>
                          <div className="dna-card-title">{dna.title}</div>
                          <div className="dna-card-prompt">{dna.prompt?.slice(0, 150)}...</div>
                          <div className="dna-keywords">
                            {dna.keywords?.slice(0, 6).map((kw, i) => (
                              <span key={i} className="dna-keyword-tag">{kw}</span>
                            ))}
                            {(dna.keywords?.length || 0) > 6 && <span className="dna-keyword-more">+{dna.keywords.length - 6}</span>}
                          </div>
                          <div className="dna-card-meta">
                            {new Date(dna.createdAt).toLocaleDateString('id-ID')}
                          </div>
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
                      {f.fromMatrix && <span className="type-pill">Matriks</span>}
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
                      <span className="meta-label">Format:</span>{' '}
                      <span className="meta-value-muted">
                        {f.orientation} · latar: {f.background}
                      </span>
                    </div>
                {f.diffNote && (
                  <div className="meta-line">
                    <span className="meta-label">Perbedaan dari sumber:</span>{' '}
                    <span className="meta-value-muted">{f.diffNote}</span>
                  </div>
                )}
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
                      title="Buat prompt ini lebih detail dan dramatis"
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
        </div>
      )}

      <HistoryPanel
        kind="prompt"
        label="Prompt Generator"
        renderItem={(item) => (
          <div className="history-title">
            {item.title}
            {item.data?.niche ? <span style={{ color: 'var(--muted)' }}> — {item.data.niche}</span> : ''}
          </div>
        )}
      />

      <NicheStats kind="prompt" label="Prompt Generator" />

      <details className="reference-box" style={{ marginTop: 24 }}>
        <summary>ℹ️ Panduan &amp; Informasi Teknis (Klik untuk Membuka)</summary>
        <div className="reference-body footnote" style={{ margin: 0, padding: 14 }}>
          Riset dan prompt diproses lewat server aplikasi ini (bukan langsung dari browser ke Anthropic), jadi API key
          tidak pernah terlihat di sisi klien. Hasil ditampilkan di tab ini dan hilang saat direfresh, kecuali kamu
          menyimpannya ke database (Neon Postgres) lewat tombol &quot;Simpan ke DB&quot; atau opsi simpan otomatis.
          Rating potensi &amp; kompetisi adalah estimasi AI, bukan data resmi Adobe Stock — tetap cek tren manual
          sebelum produksi besar.
          <br />
          <br />
          <b>Soal anti-duplikasi:</b> kalau opsi &quot;Hindari konsep yang mirip dengan riwayat&quot; aktif, sebelum
          generate aplikasi akan mengambil sampai {MAX_AVOID_TITLES} judul konsep yang <em>sudah pernah tersimpan ke
          database untuk niche yang sama persis</em>, lalu memberi tahu AI supaya tidak mengulang ide yang sama. Ini
          hanya berfungsi untuk konsep yang benar-benar sudah kamu simpan (lewat &quot;Simpan ke DB&quot; atau simpan
          otomatis) — hasil yang belum disimpan tidak ikut dicek.
        </div>
      </details>
    </div>
  );
}
