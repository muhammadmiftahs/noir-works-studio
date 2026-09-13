'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import ModelSelect from './ModelSelect';
import HistoryPanel from './HistoryPanel';
import { DEFAULT_MODEL_ID } from '../lib/models';
import { callClaude, extractText, extractJsonBlock } from '../lib/claudeClient';
import { saveItem, listItems, getCounts } from '../lib/savedItems';
import { readAsDataURL, resizeImageToBase64 } from '../lib/imageUtils';

// Riwayat video disimpan dengan "kind" berbeda dari Prompt Generator gambar
// (kind: "prompt"), supaya daftar anti-duplikat tidak saling campur — konsep
// video dicek hanya terhadap video lama, bukan terhadap konsep gambar.
const HISTORY_KIND = 'video-prompt';
// Catatan riset video juga dipisah dari riset Prompt Generator gambar (kind
// "riset"), supaya total-nya tidak tercampur.
const RISET_KIND = 'riset-video';
const MAX_AVOID_TITLES = 40;

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

async function doGenerateVideo(model, { niche, style, mood, count, aspectRatio, cameraMovement, contentType, researchNote, avoidList }) {
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

async function doGenerateVideoFromImage(model, image, { niche, style, mood, count, aspectRatio, cameraMovement, contentType, avoidList }) {
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

  const [frames, setFrames] = useState([]);
  const [research, setResearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [videoTotal, setVideoTotal] = useState(0);
  const [risetTotal, setRisetTotal] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

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
      const opts = { niche: nicheVal, style, mood, count, aspectRatio, cameraMovement, contentType, avoidList };
      if (genMode === 'image') {
        setStatus(
          avoidList.length
            ? `Menganalisis gambar & menyusun ${count} konsep video (menghindari ${avoidList.length} konsep lama)…`
            : `Menganalisis gambar & menyusun ${count} konsep video…`
        );
        ideas = await doGenerateVideoFromImage(model, sourceImage, opts);
      } else {
        if (!modeHemat) {
          setStatus('Meneliti tren video stok…');
          researchNote = await doResearchVideo(model, nicheVal, style, contentType);
          if (researchNote) {
            setResearch(researchNote);
            setRisetTotal((t) => t + 1);
            saveItem({ kind: RISET_KIND, title: nicheVal, model, data: { niche: nicheVal, style, research: researchNote } }).catch(() => {});
          }
        }
        setStatus(
          avoidList.length
            ? `Menyusun prompt video baru (menghindari ${avoidList.length} konsep lama)…`
            : 'Menyusun prompt video & negative prompt…'
        );
        ideas = await doGenerateVideo(model, { ...opts, researchNote });
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
        model,
      }));
      setFrames((prev) => [...prev, ...newFrames]);
      setVideoTotal((t) => t + newFrames.length);
      if (autoSave) {
        newFrames.forEach((f) => saveFrame(f));
      }
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

        <div className="field">
          <label>Jumlah konsep</label>
          <div className="count-row">
            <input type="range" min="1" max="10" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <span className="count-val">{count}</span>
          </div>
        </div>

        <div className="btn-row" style={{ flexDirection: 'column' }}>
          <button className="btn-primary full" disabled={busy || (genMode === 'image' && (!sourceImage || imageBusy))} onClick={runGenerate}>
            {genMode === 'image' ? 'Buat prompt video dari gambar' : 'Riset & buatkan prompt video'}
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
        <div className="frames">
          {frames.map((f, i) => {
            const combined = `${f.prompt} Negative prompt: ${f.negative}`;
            const isSaved = savedIds.has(f.id);
            return (
              <div className="frame" key={f.id}>
                <div className="frame-title-row">
                  {i + 1}. {f.title} {titleStars(f.potential)}
                  {f.fromImage && <span className="type-pill">Dari gambar</span>}
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

      <div className="footnote">
        Riset dan prompt diproses lewat server aplikasi ini, API key tidak pernah terlihat di sisi klien. Hasil
        hilang saat direfresh kecuali disimpan ke database.
        <br />
        <br />
        <b>Catatan soal Google Flow/Veo:</b> sekali proses generate biasanya menghasilkan klip pendek (sekitar 5-8
        detik) — durasi &amp; rasio aspek akhir tetap harus kamu set manual di pengaturan Google Flow, teks di sini
        cuma panduan pacing. Prompt sengaja diarahkan tanpa dialog/audio/teks di layar karena footage Adobe Stock
        umumnya dijual tanpa audio. Untuk klip lebih panjang, pakai fitur "Extend" bawaan Google Flow setelah klip
        pertama jadi, atau generate beberapa konsep terpisah untuk disambung sendiri.
        <br />
        <br />
        <b>Soal anti-duplikasi:</b> sama seperti Prompt Generator gambar, sebelum generate aplikasi mengambil sampai{' '}
        {MAX_AVOID_TITLES} judul konsep video yang sudah tersimpan untuk niche yang sama persis, lalu meminta AI
        membuat yang berbeda. Riwayat ini terpisah dari riwayat Prompt Generator gambar. Rating potensi &amp;
        kompetisi tetap estimasi AI, bukan data resmi Adobe Stock.
      </div>
    </div>
  );
}
