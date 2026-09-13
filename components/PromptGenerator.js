'use client';

import { useState, useMemo, useRef } from 'react';
import ModelSelect from './ModelSelect';
import HistoryPanel from './HistoryPanel';
import { DEFAULT_MODEL_ID } from '../lib/models';
import { callClaude, extractText, extractJsonBlock } from '../lib/claudeClient';
import { saveItem, listItems } from '../lib/savedItems';
import { readAsDataURL, resizeImageToBase64 } from '../lib/imageUtils';

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

const MAX_AVOID_TITLES = 40; // batas jumlah judul lama yang dikirim ke prompt, biar konteks tidak membengkak

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

async function doGenerate(model, niche, style, mood, count, bgChoice, researchNote, avoidList) {
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

async function doGenerateFromImage(model, image, niche, style, mood, count, bgChoice, avoidList) {
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
  const [genMode, setGenMode] = useState('text'); // 'text' | 'image'
  const [sourceImage, setSourceImage] = useState(null); // { thumb, base64, mediaType, filename }
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

  const [frames, setFrames] = useState([]);
  const [research, setResearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [promptTotal, setPromptTotal] = useState(0);
  const [risetTotal, setRisetTotal] = useState(0);
  const [copiedId, setCopiedId] = useState(null);
  const [savedIds, setSavedIds] = useState(new Set());

  const currentNiche = useMemo(() => (useCustomNiche ? nicheCustom.trim() : niche), [useCustomNiche, nicheCustom, niche]);

  function handleNicheSelect(value) {
    if (value === '__custom__') {
      setUseCustomNiche(true);
    } else {
      setUseCustomNiche(false);
      setNiche(value);
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

  async function runGenerate(overrides = {}) {
    setError('');
    const nicheVal = overrides.niche !== undefined ? overrides.niche : currentNiche;
    const styleVal = overrides.style !== undefined ? overrides.style : style;
    const bgVal = overrides.bg !== undefined ? overrides.bg : bg;
    const moodVal = overrides.mood !== undefined ? overrides.mood : mood;
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
          // Database belum diset / gagal diakses — lanjutkan generate tanpa daftar anti-duplikat,
          // jangan sampai fitur ini memblokir generate normal.
          avoidList = [];
        }
      }

      let researchNote = '';
      let ideas;
      if (genMode === 'image') {
        setStatus(
          avoidList.length
            ? `Menganalisis gambar & menyusun ${count} konsep baru (menghindari ${avoidList.length} konsep lama)…`
            : `Menganalisis gambar & menyusun ${count} konsep baru…`
        );
        ideas = await doGenerateFromImage(model, sourceImage, nicheVal, styleVal, moodVal, count, bgVal, avoidList);
      } else {
        if (!modeHemat) {
          setStatus('Meneliti tren & celah pasar Adobe Stock…');
          researchNote = await doResearch(model, nicheVal, styleVal, bgVal);
          if (researchNote) {
            setResearch(researchNote);
            setRisetTotal((t) => t + 1);
          }
        }
        setStatus(
          avoidList.length
            ? `Menyusun prompt baru (menghindari ${avoidList.length} konsep lama untuk niche ini)…`
            : 'Menyusun prompt detail & negative prompt…'
        );
        ideas = await doGenerate(model, nicheVal, styleVal, moodVal, count, bgVal, researchNote, avoidList);
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
        model,
      }));
      setFrames((prev) => [...prev, ...newFrames]);
      setPromptTotal((t) => t + newFrames.length);
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

  function handleSurprise() {
    const overrides = randomizeInputs();
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
        <div style={{ display: 'flex', gap: 28 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--cyan)' }}>{promptTotal}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>prompt</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--cyan)' }}>{risetTotal}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>riset</div>
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

        <div className="field">
          <label>Jumlah prompt</label>
          <div className="count-row">
            <input type="range" min="1" max="10" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            <span className="count-val">{count}</span>
          </div>
        </div>

        <div className="btn-row" style={{ flexDirection: 'column' }}>
          <button
            className="btn-primary full"
            disabled={busy || (genMode === 'image' && (!sourceImage || imageBusy))}
            onClick={() => runGenerate()}
          >
            {genMode === 'image' ? 'Buat konsep dari gambar' : 'Riset & buatkan prompt'}
          </button>
          {genMode === 'text' && (
            <button className="btn-ghost full" disabled={busy} onClick={handleSurprise}>
              Kejutkan saya (acak)
            </button>
          )}
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
        <h2>Hasil prompt</h2>
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
            ? 'Upload gambar referensi di atas, isi kategori/gaya/latar, lalu tekan "Buat konsep dari gambar". Tiap hasil akan menampilkan konsep baru yang terinspirasi gambar itu, lengkap dengan catatan elemen yang sengaja dibuat berbeda.'
            : 'Isi kategori, gaya, dan latar belakang di atas, lalu tekan "Riset & buatkan prompt". Tiap hasil akan menampilkan judul konsep, estimasi potensi jual, tingkat kompetisi, kegunaan, dan satu box prompt+negative prompt yang tinggal disalin ke Google Flow.'}
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
        kind="prompt"
        label="Prompt Generator"
        renderItem={(item) => (
          <div className="history-title">
            {item.title}
            {item.data?.niche ? <span style={{ color: 'var(--muted)' }}> — {item.data.niche}</span> : ''}
          </div>
        )}
      />

      <div className="footnote">
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
        otomatis) — hasil yang belum disimpan tidak ikut dicek. Pencocokan niche bersifat persis (case-insensitive),
        jadi kalau kamu tulis niche custom dengan kata-kata berbeda tiap kali, deteksinya tidak akan nyambung. Ini
        juga bukan pengecekan mirip 100% dijamin — AI diberi instruksi untuk menghindari, tapi tetap bisa meleset
        sesekali.
      </div>
    </div>
  );
}
