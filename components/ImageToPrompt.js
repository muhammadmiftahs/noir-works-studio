'use client';

import { useState, useRef } from 'react';
import ModelSelect from './ModelSelect';
import { DEFAULT_MODEL_ID } from '../lib/models';
import { callClaude, extractText, extractJsonBlock } from '../lib/claudeClient';
import { saveItem, listItems } from '../lib/savedItems';
import { readAsDataURL, resizeImageToBase64 } from '../lib/imageUtils';
import { estimateCost, formatUsd } from '../lib/costTracker';

const HISTORY_KIND = 'image-prompt';

const MAX_FILENAME_LEN = 60;

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

// Prompt default yang meniru kebutuhan user: "buatkan prompt yang mirip /
// sesuai dengan gambar di bawah ini, secara detail".
const DEFAULT_INSTRUCTION =
  'Tolong buatkan prompt yang mirip atau sesuai dengan gambar berikut ini, dengan sangat detail. Jelaskan subjek, komposisi, pencahayaan, gaya visual, warna, dan mood-nya supaya hasil generasi berikutnya terasa senada.';

export default function ImageToPrompt() {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [image, setImage] = useState(null); // { thumb, base64, mediaType, filename }
  const [imageBusy, setImageBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [targetLang, setTargetLang] = useState('en'); // 'en' | 'id'
  const [detailLevel, setDetailLevel] = useState('detail'); // 'ringkas' | 'detail' | 'sangat-detail'
  const [withNegative, setWithNegative] = useState(true);
  const [autoSave, setAutoSave] = useState(true);    // default ON — simpan ke DB
  const [avoidDuplicates, setAvoidDuplicates] = useState(true);  // default ON — hindari prompt sama

  const [result, setResult] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const [savedIds, setSavedIds] = useState(new Set());
  const fileInputRef = useRef(null);

  async function processFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG/PNG/WEBP).');
      return;
    }
    setError('');
    setImageBusy(true);
    try {
      const dataUrl = await readAsDataURL(file);
      const resized = await resizeImageToBase64(dataUrl, 1400);
      setImage({
        thumb: dataUrl,
        base64: resized.base64,
        mediaType: resized.mediaType,
        filename: file.name.length > MAX_FILENAME_LEN ? file.name.slice(0, MAX_FILENAME_LEN) + '…' : file.name,
      });
    } catch (err) {
      setError(`Gagal memuat gambar: ${err.message}`);
    } finally {
      setImageBusy(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  }

  function buildSystemPrompt() {
    const detailRule = {
      ringkas: 'Tulis prompt yang ringkas: 1-2 kalimat padat berisi elemen paling penting saja.',
      detail: 'Tulis prompt yang detail: 3-5 kalimat mencakup subjek, komposisi, pencahayaan, warna, dan gaya.',
      'sangat-detail':
        'Tulis prompt yang sangat detail dan kaya: 5-8 kalimat, sebutkan secara konkret bentuk, tekstur, material, pose, sudut pandang, arah & jenis pencahayaan, palet warna, latar belakang, dan deskriptor kualitas komersial.',
    }[detailLevel];

    const langRule =
      targetLang === 'en'
        ? 'Tulis field "prompt" dan "negative_prompt" dalam Bahasa Inggris (standar untuk image/video generation).'
        : 'Tulis field "prompt" dan "negative_prompt" dalam Bahasa Indonesia.';

    const negRule = withNegative
      ? 'Sertakan field "negative_prompt": daftar elemen yang sebaiknya dihindari, dalam Bahasa Inggris, dipisah koma (misal blurry, low quality, watermark, extra limbs, distorted proportions, oversaturated, text, logo).'
      : 'Untuk field "negative_prompt", isi dengan string kosong "".';

    return (
      'Kamu adalah ahli prompt engineering untuk image generation (Google Flow / Adobe Stock). Kamu akan diberi SATU gambar dan sebuah instruksi dari pengguna, lalu tugasmu adalah MENULIS PROMPT yang mereproduksi gaya visual gambar tersebut, BUKAN menganalisis gambar secara meta. ' +
      detailRule +
      ' ' +
      langRule +
      ' ' +
      negRule +
      ' Field "notes" berisi 1-2 kalimat Bahasa Indonesia berisi catatan singkat tentang elemen kunci gambar yang paling menentukan gaya (mis. pencahayaan, palet, komposisi) — supaya pengguna tahu kenapa prompt ini dirancang seperti itu. Jangan deskripsikan gambar apa adanya sebagai caption; tulis sebagai instruksi prompt yang siap dipakai. ' +
      'Balas HANYA dengan JSON object berisi keys: prompt, negative_prompt, notes. Tanpa teks lain, tanpa markdown fence.'
    );
  }

  async function generatePrompt() {
    setError('');
    setDuplicateWarning('');
    if (!image) {
      setError('Upload gambar dulu sebelum generate.');
      return;
    }
    setBusy(true);
    setStatus('Menganalisis gambar & menyusun prompt…');
    try {
      // --- Muat riwayat sekali untuk deteksi duplikasi ---
      let historyItems = [];
      try {
        historyItems = await listItems(HISTORY_KIND);
      } catch (e) { /* DB belum diset, lanjut saja */ }
      const savedFilenames = new Set(historyItems.map((it) => (it.title || '').toLowerCase().trim()));
      const savedPrompts  = new Set(historyItems.map((it) => (it.data?.prompt || '').toLowerCase().trim()));

      const data = await callClaude({
        model,
        system: buildSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
              { type: 'text', text: instruction || DEFAULT_INSTRUCTION },
            ],
          },
        ],
        maxTokens: 2000,
      });
      const raw = extractText(data);
      const parsed = extractJsonBlock(raw);
      const newResult = {
        id: `img2prompt-${Date.now()}`,
        prompt: String(parsed.prompt || '').trim(),
        negative: String(parsed.negative_prompt || '').trim(),
        notes: String(parsed.notes || '').trim(),
        model,
        filename: image.filename,
      };
      if (!newResult.prompt) throw new Error('Model tidak mengembalikan prompt. Coba lagi.');

      // --- Deteksi duplikasi ---
      const warnings = [];
      const normFilename  = newResult.filename.toLowerCase().trim();
      const normPromptText = newResult.prompt.toLowerCase().trim();
      if (avoidDuplicates && savedFilenames.has(normFilename)) {
        warnings.push(`Gambar "${newResult.filename}" sudah pernah diproses sebelumnya — hasil mungkin mirip.`);
      }
      const isDuplicatePrompt = avoidDuplicates && savedPrompts.has(normPromptText);
      if (isDuplicatePrompt) {
        warnings.push('Prompt persis sama sudah ada di database — disimpan tetap tapi ditandai sebagai duplikat.');
      }
      setDuplicateWarning(warnings.join(' '));

      setResult(newResult);
      setSessionCost((prev) => prev + estimateCost(model, 'generateFromImage', 1));

      // --- Simpan otomatis ke DB ---
      if (autoSave) {
        saveItem({
          kind: HISTORY_KIND,
          title: newResult.filename || 'Dari gambar',
          model,
          data: { ...newResult, isDuplicate: isDuplicatePrompt },
        })
          .then(() => setSavedIds((prev) => new Set(prev).add(newResult.id)))
          .catch(() => {});
      }
    } catch (err) {
      setError(`Gagal memproses: ${err.message}`);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  async function saveResult() {
    if (!result) return;
    try {
      await saveItem({ kind: 'image-prompt', title: result.filename || 'Dari gambar', model: result.model, data: result });
      setSavedIds((prev) => new Set(prev).add(result.id));
    } catch (err) {
      setError(`Gagal menyimpan ke database: ${err.message}`);
    }
  }

  function combinedText() {
    if (!result) return '';
    return result.negative ? `${result.prompt} Negative prompt: ${result.negative}` : result.prompt;
  }

  function copyResult() {
    if (!result) return;
    navigator.clipboard.writeText(combinedText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  function resetAll() {
    setImage(null);
    setResult(null);
    setDuplicateWarning('');
    setError('');
    setCopied(false);
  }

  function exportTxt() {
    if (!result) return;
    let content = `Prompt:\n${result.prompt}`;
    if (result.negative) content += `\n\nNegative prompt:\n${result.negative}`;
    if (result.notes) content += `\n\nCatatan:\n${result.notes}`;
    downloadFile('noir-works-image-prompt.txt', content, 'text/plain');
  }

  return (
    <div>
      <div className="app-header">
        <div>
          <div className="eyebrow">CASE FILE · REVERSE STUDIO</div>
          <h1 className="title">
            NO<span className="accent">Ï</span>R WORKS
          </h1>
          <div className="title-rule"></div>
          <p className="desc">
            Image-to-Prompt Studio — upload gambar referensi, beri instruksi bebas, lalu dapatkan prompt terstruktur
            yang bisa dipakai untuk mereproduksi gayanya. Gambar diproses di browser &amp; tidak disimpan permanen.
          </p>
        </div>
        <div className="header-stats">
          <div className="stat-box">
            <div className="stat-value">{image ? '1' : '0'}</div>
            <div className="stat-label">gambar</div>
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
        <label className="checkbox-row" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          <span>Simpan otomatis hasil ke database (Neon)</span>
        </label>
        <label className="checkbox-row" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={avoidDuplicates} onChange={(e) => setAvoidDuplicates(e.target.checked)} />
          <span>Hindari simpan prompt yang persis sama dengan riwayat database</span>
        </label>
      </div>

      {/* Area Upload */}
      <div
        className={'dropzone' + (dragActive ? ' drag' : '')}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <h3>{image ? 'Gambar siap dianalisis' : 'Upload / seret gambar ke sini'}</h3>
        <p>
          {imageBusy
            ? 'Memuat gambar…'
            : 'JPG, PNG, atau WEBP. Gambar diproses di browser dan hanya dikirim ke server sebagai base64 untuk diteruskan ke model — tidak disimpan di database atau hosting.'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => processFile(e.target.files?.[0])}
        />
      </div>

      {image && (
        <div className="source-image-preview" style={{ marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.thumb} alt="" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--white)' }}>{image.filename}</div>
            <button className="link-btn" onClick={resetAll}>
              Ganti / hapus gambar
            </button>
          </div>
        </div>
      )}

      {/* Instruksi & pengaturan */}
      <div className="panel">
        <div className="field">
          <label htmlFor="instruction">Instruksi / permintaan kamu</label>
          <textarea
            id="instruction"
            rows={4}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="mis. Tolong buatkan prompt yang mirip atau sesuai gambar berikut ini, dengan detail…"
          />
          <div className="field-hint">
            Tulis bebas apa yang kamu mau. Contoh: &quot;buatkan prompt yang mirip gambar ini dengan detail&quot;,
            &quot;ubah jadi gaya cat air&quot;, &quot;fokus ke tekstur dan pencahayaannya&quot;.
          </div>
        </div>

        <div className="field">
          <label>Level detail prompt</label>
          <div className="chip-row">
            {[
              { value: 'ringkas', label: 'Ringkas' },
              { value: 'detail', label: 'Detail' },
              { value: 'sangat-detail', label: 'Sangat detail' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                className={'chip' + (detailLevel === o.value ? ' active' : '')}
                onClick={() => setDetailLevel(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Bahasa prompt hasil</label>
          <div className="chip-row">
            {[
              { value: 'en', label: 'Inggris (rekomendasi)' },
              { value: 'id', label: 'Indonesia' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                className={'chip' + (targetLang === o.value ? ' active' : '')}
                onClick={() => setTargetLang(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <label className="checkbox-row" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={withNegative} onChange={(e) => setWithNegative(e.target.checked)} />
          <span>Sertakan negative prompt</span>
        </label>

        <div className="btn-row" style={{ flexDirection: 'column', marginTop: 16 }}>
          <button className="btn-primary full" disabled={busy || !image || imageBusy} onClick={generatePrompt}>
            {image ? 'Buatkan prompt dari gambar' : 'Upload gambar dulu'}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {busy && status && (
        <div className="status-row">
          <span className="spinner"></span> {status}
        </div>
      )}
      {duplicateWarning && (
        <div className="warn-box">{duplicateWarning}</div>
      )}

      {/* Hasil */}
      {result && (
        <>
          <div className="results-head">
            <h2>Hasil prompt</h2>
            <div className="link-row">
              <button className="link-btn" onClick={exportTxt}>
                Unduh .txt
              </button>
              <button
                className={'save-btn' + (savedIds.has(result.id) ? ' saved' : '')}
                style={{ background: 'none', border: 'none', color: savedIds.has(result.id) ? '#7fcf9e' : 'var(--muted)', textTransform: 'uppercase', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                onClick={saveResult}
                disabled={savedIds.has(result.id)}
              >
                {savedIds.has(result.id) ? 'Tersimpan di DB' : 'Simpan ke DB'}
              </button>
              <button className="link-btn" onClick={resetAll}>
                Bersihkan
              </button>
            </div>
          </div>

          <div className="frame">
            <div className="frame-title-row">
              Hasil dari: {result.filename} <span className="type-pill">Dari gambar</span>
            </div>
            {result.notes && (
              <div className="meta-line">
                <span className="meta-label">Catatan:</span> <span className="meta-value-muted">{result.notes}</span>
              </div>
            )}
            <div className="prompt-label-row">
              <div className="prompt-label">Prompt {result.negative ? '+ Negative Prompt' : ''}</div>
              <button className={'copy-btn-inline' + (copied ? ' copied' : '')} onClick={copyResult}>
                {copied ? '✓ Disalin' : 'Salin'}
              </button>
            </div>
            <div className="prompt-copy-box">
              <span className="prompt-copy-text">{combinedText()}</span>
            </div>
          </div>
        </>
      )}

      <div className="footnote">
        Gambar yang di-upload diproses sepenuhnya di browser (resize + konversi base64) dan tidak pernah disimpan
        permanen di server maupun database — hanya diteruskan sementara ke model untuk dianalisis. Pastikan gambar
        yang kamu upload adalah milikmu sendiri atau bebas dipakai sebagai referensi.
      </div>
    </div>
  );
}
