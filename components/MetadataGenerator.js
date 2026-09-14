'use client';

import { useState, useRef, useCallback } from 'react';
import ModelSelect from './ModelSelect';
import NicheStats from './NicheStats';
import HistoryPanel from './HistoryPanel';
import { DEFAULT_MODEL_ID } from '../lib/models';
import { callClaude, extractText, withRateLimitRetry } from '../lib/claudeClient';
import { saveItem } from '../lib/savedItems';
import { readAsDataURL, resizeImageToBase64 } from '../lib/imageUtils';
import { estimateCost, formatUsd } from '../lib/costTracker';

const CATEGORIES = [
  [1, 'Animals'], [2, 'Buildings and Architecture'], [3, 'Business'], [4, 'Drinks'],
  [5, 'The Environment'], [6, 'States of Mind'], [7, 'Food'], [8, 'Graphic Resources'],
  [9, 'Hobbies and Leisure'], [10, 'Industry'], [11, 'Landscapes'], [12, 'Lifestyle'],
  [13, 'People'], [14, 'Plants and Flowers'], [15, 'Culture and Religion'], [16, 'Science'],
  [17, 'Social Issues'], [18, 'Sports'], [19, 'Technology'], [20, 'Transport'], [21, 'Travel'],
];

const BRAND_TERMS = [
  'nike', 'adidas', 'apple', 'iphone', 'ipad', 'samsung', 'disney', 'marvel', 'pixar',
  'coca-cola', 'coca cola', 'pepsi', 'starbucks', 'mcdonald', 'bmw', 'mercedes', 'toyota', 'honda',
  'gucci', 'chanel', 'louis vuitton', 'rolex', 'sony', 'playstation', 'xbox', 'microsoft', 'windows',
  'google', 'facebook', 'meta', 'instagram', 'tiktok', 'tesla', 'puma', 'under armour', 'ikea', 'lego',
  'netflix', 'spotify', 'amazon', 'uber', 'airbnb', 'ferrari', 'lamborghini', 'harley-davidson',
];

const SIMILARITY_THRESHOLD = 8; // hamming distance out of 64 bits
const TEXT_SIMILARITY_THRESHOLD = 0.6; // jaccard overlap on keyword sets

function flaggedBrandTerms(keywordsStr) {
  if (!keywordsStr) return [];
  const kws = keywordsStr.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const found = new Set();
  kws.forEach((k) => BRAND_TERMS.forEach((b) => { if (k === b || k.includes(b)) found.add(b); }));
  return Array.from(found);
}

function contentTypeLabel(type) {
  const map = {
    icon_vector: 'Ikon/Vektor',
    pattern_background: 'Pola/Background',
    illustration_art: 'Ilustrasi',
    photo_realistic: 'Foto Realistis',
  };
  return map[type] || type;
}

function categoryName(n) {
  const found = CATEGORIES.find((c) => String(c[0]) === String(n));
  return found ? `${n}. ${found[1]}` : n || '';
}

function resolveCategory(raw) {
  if (raw === undefined || raw === null) return '';
  const str = String(raw).trim();
  if (!str) return '';
  const numMatch = str.match(/\d+/);
  if (numMatch) {
    const n = parseInt(numMatch[0], 10);
    if (CATEGORIES.some((c) => c[0] === n)) return String(n);
  }
  const lower = str.toLowerCase();
  const byName = CATEGORIES.find((c) => lower.includes(c[1].toLowerCase()));
  return byName ? String(byName[0]) : '';
}

function extractJsonObject(text) {
  let clean = (text || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(clean);
}

function computeAHash(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 8;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const gray = [];
      for (let i = 0; i < data.length; i += 4) {
        gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      const avg = gray.reduce((a, b) => a + b, 0) / gray.length;
      resolve(gray.map((v) => (v > avg ? '1' : '0')).join(''));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function hammingDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

function keywordSet(keywordsStr) {
  return new Set((keywordsStr || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean));
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((x) => { if (setB.has(x)) intersection++; });
  const union = new Set([...setA, ...setB]).size;
  return union ? intersection / union : 0;
}

function buildPrompt({ referenceBlock, diversifyBlock, searchToolLine, extraInstruction }) {
  return `You are a stock photography metadata expert preparing content for Adobe Stock, optimizing for buyer search discoverability and sales conversion.

Analyze the attached image (it may be AI-generated) and produce metadata optimized for stock buyer search.
${referenceBlock}${diversifyBlock}
${searchToolLine}

After any research, return ONLY a raw JSON object as your final message, no markdown fences, no commentary, in this exact shape:
{"category": number, "content_type": string, "visual_trademark_risk": string, "title_options": string[3], "keywords": string[]}

Rules:
- content_type: first, silently classify this image into ONE of these types, and put your answer here as a plain string: "icon_vector" (flat icon, vector graphic, logo-style, line art), "pattern_background" (seamless pattern, texture, plain background/backdrop), "illustration_art" (digital painting, character art, concept art, 3d render scene), or "photo_realistic" (a realistic photograph, or an AI-generated image made to look photographic). This choice changes how you should approach the keywords rule below — read it carefully before writing keywords.

- visual_trademark_risk: this is a check on the ACTUAL PIXELS of the image, separate from whatever keywords you write. Look carefully at the image itself for anything that could get this submission rejected by Adobe Stock for trademark/copyright/publicity-rights reasons: a recognizable brand logo or wordmark, a licensed/copyrighted character design (cartoon, game, movie, anime), a distinctive trademarked product shape or packaging design, visible text that reads like a real brand name, or a recognizable real public figure's face. If you see none of that, return an empty string "". If you do spot something, briefly describe what and roughly where in the frame, so the user can review, crop, or edit it before uploading — keep it to one short sentence. Only flag genuine, fairly confident visual matches — don't flag generic shapes, colors, or plain objects just because they coincidentally resemble something.

- title_options: exactly 3 distinct phrase options, each max 70 characters, no commas, no ALL CAPS, no keyword stuffing. Vary the angle: one literal/descriptive, one written the way a buyer would phrase what they're searching for (the need/use-case behind the image, not just its contents), one mood/style oriented.

- keywords: up to 49 unique English keywords/short phrases, ordered from most to least relevant. THIS IS THE MOST IMPORTANT PART — think like a buyer searching a stock library, not like someone captioning the picture. Do not stop at naming what is literally visible.

  Tailor your emphasis based on the content_type you picked above:
  - icon_vector: buyers almost never search icons by literal object name alone — they search by the CONCEPT/USE-CASE it represents. Push the buyer-intent/concept layer even harder than usual, and always include format-relevant technical terms if true: "vector", "flat icon", "line icon", "isolated on white/transparent", "ui element", "app icon", "logo element".
  - pattern_background: buyers search these overwhelmingly by USE-CASE, not subject alone — prioritize terms like "seamless pattern", "wallpaper", "backdrop", "textile design", "wrapping paper", "fabric print", "web background", "presentation background", "packaging design", alongside the actual motif/color/style.
  - illustration_art: blend both the icon_vector concept-first approach AND descriptive/mood language, since buyers search these both by literal subject and by feeling/genre.
  - photo_realistic: descriptive/mood language plus lifestyle/use-case context is the priority layer here.

  Natural long-tail phrases (applies to ALL content types, not just photos): alongside single/short keywords, also include a handful (roughly 3-6, fewer for very simple icons) of natural multi-word search phrases — the way a real buyer would actually type into a search-with-AI box, not just isolated words strung together.

  For every subject/object you identify in the image, go one layer deeper and ask: "what underlying need, feeling, industry, or campaign would make someone search for an image like this?" — then include THOSE terms too, even if they never appear in the picture itself.

  Blend across these layers, ordered so the most buyer-valuable terms sit near the front (Adobe Stock's search weights roughly the first 10-15 keywords most heavily):
  1. Literal subject/visual elements actually depicted
  2. Concept, emotion, or theme it represents (the buyer-intent layer — usually the highest-value keywords)
  3. Industry or use-case context (who licenses this and why: marketing, editorial, corporate, packaging, social media, campaign, etc.)
  4. Style/technique (e.g. flat design, 3d render, watercolor, digital art, ai generated, minimalist, isolated on white)
  5. Color, composition, technical (dominant colors, orientation, copy space)

  Seasonal/moment check: also ask yourself whether this image genuinely fits a specific season, holiday, or recurring calendar moment. If the visual elements, colors, props, or mood genuinely support one of these (not forced), weave 2-4 of those seasonal keywords in — placed with the other buyer-intent terms near the front. If the image is generic/timeless, skip this layer entirely rather than inventing a false connection.

  No duplicates, no hashtags, no generic filler like "image" or "photo" unless truly relevant. Prioritize real buyer search relevance over padding the list to hit 49.

- category: pick the single best-fit number from this Adobe Stock category list. Always include this field, even if the fit is imperfect — pick the closest one:
${CATEGORIES.map(([n, name]) => `${n}=${name}`).join(', ')}
${extraInstruction ? `\nTARGETED FIX FOR THIS RUN — apply this on top of everything above, keeping the rest of your analysis approach unchanged:\n${extraInstruction}\n` : ''}
- IMPORTANT: put "category" as the FIRST key in the JSON object (before title_options and keywords), so it never gets cut off if your response runs long.`;
}

async function callVisionModel(model, frame, promptText, { useSearchTool, maxTokens }) {
  const content = [{ type: 'text', text: promptText }];
  if (frame) {
    content.unshift({ type: 'image', source: { type: 'base64', media_type: frame.apiMediaType, data: frame.apiBase64 } });
  }
  const data = await callClaude({
    model,
    messages: [{ role: 'user', content }],
    tools: useSearchTool ? [{ type: 'web_search_20250305', name: 'web_search' }] : undefined,
    maxTokens,
  });
  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  if (!textBlocks.length) throw new Error('Tidak ada respons teks dari model.');
  return textBlocks[textBlocks.length - 1].text;
}

let idCounter = 0;

export default function MetadataGenerator() {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [modeHemat, setModeHemat] = useState(false);
  const [frames, setFrames] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total}
  const [genAllBusy, setGenAllBusy] = useState(false);
  const [sessionCost, setSessionCost] = useState(0);
  const [referenceText, setReferenceText] = useState('');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [connStatus, setConnStatus] = useState({ text: '', ok: null });
  const [connBusy, setConnBusy] = useState(false);
  const fileInputRef = useRef(null);
  const framesRef = useRef([]);
  framesRef.current = frames;

  const updateSimilarity = useCallback((list) => {
    list.forEach((f) => (f.similarIds = []));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!list[i].hash || !list[j].hash) continue;
        if (hammingDistance(list[i].hash, list[j].hash) <= SIMILARITY_THRESHOLD) {
          list[i].similarIds.push(list[j].id);
          list[j].similarIds.push(list[i].id);
        }
      }
    }
    return list;
  }, []);

  const updateTextSimilarity = useCallback((list) => {
    list.forEach((f) => (f.textSimilarIds = []));
    const sets = list.map((f) => keywordSet(f.keywords));
    for (let i = 0; i < list.length; i++) {
      if (!list[i].keywords && !list[i].title) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (!list[j].keywords && !list[j].title) continue;
        const kwSim = jaccardSimilarity(sets[i], sets[j]);
        const sameTitle = list[i].title.trim() && list[i].title.trim().toLowerCase() === list[j].title.trim().toLowerCase();
        if (kwSim >= TEXT_SIMILARITY_THRESHOLD || sameTitle) {
          list[i].textSimilarIds.push(list[j].id);
          list[j].textSimilarIds.push(list[i].id);
        }
      }
    }
    return list;
  }, []);

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    const newFrames = [];
    const failed = [];
    for (const file of files) {
      try {
        const id = 'f' + ++idCounter;
        const dataUrl = await readAsDataURL(file);
        const resized = await resizeImageToBase64(dataUrl, 1400);
        const hash = await computeAHash(dataUrl);
        newFrames.push({
          id,
          filename: file.name,
          thumb: dataUrl,
          apiBase64: resized.base64,
          apiMediaType: resized.mediaType,
          hash,
          similarIds: [],
          textSimilarIds: [],
          contentType: '',
          visualRisk: '',
          title: '',
          titleOptions: [],
          keywords: '',
          category: '',
          status: 'idle',
          error: '',
        });
      } catch (err) {
        failed.push(file.name);
      }
    }
    if (failed.length) {
      alert(`${failed.length} file gagal diproses dan dilewati: ${failed.join(', ')}`);
    }
    setFrames((prev) => {
      const merged = [...prev, ...newFrames];
      updateSimilarity(merged);
      updateTextSimilarity(merged);
      return [...merged];
    });
  }

  function updateFrame(id, patch) {
    setFrames((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      updateTextSimilarity(next);
      return next;
    });
  }

  function isDuplicateFilename(f, list) {
    if (!f.filename) return false;
    return list.filter((x) => x.filename.trim().toLowerCase() === f.filename.trim().toLowerCase()).length > 1;
  }

  function autoFixDuplicateFilename(id) {
    setFrames((prev) => {
      const f = prev.find((x) => x.id === id);
      if (!f) return prev;
      const dot = f.filename.lastIndexOf('.');
      const name = dot > 0 ? f.filename.slice(0, dot) : f.filename;
      const ext = dot > 0 ? f.filename.slice(dot) : '';
      const others = new Set(prev.filter((x) => x.id !== id).map((x) => x.filename.trim().toLowerCase()));
      let n = 2;
      let candidate;
      do {
        candidate = `${name}-${n}${ext}`;
        n++;
      } while (others.has(candidate.toLowerCase()));
      return prev.map((x) => (x.id === id ? { ...x, filename: candidate } : x));
    });
  }

  function getReferenceKeywordBlock() {
    const text = referenceText.trim();
    if (!text) return '';
    const trimmed = text.length > 2000 ? text.slice(0, 2000) : text;
    return `\nREFERENCE — examples of titles/keywords from images in my portfolio that already sold well:\n"""\n${trimmed}\n"""\nUse this ONLY as a style/vocabulary/terminology reference — do not copy them verbatim unless genuinely relevant to THIS specific image, and never invent a false connection just to reuse these words.\n`;
  }

  function frameLabel(id, list) {
    const idx = list.findIndex((x) => x.id === id);
    return idx >= 0 ? `Fr. ${String(idx + 1).padStart(2, '0')}` : '';
  }

  function getDiversifyBlock(f, list) {
    if (!f.similarIds || !f.similarIds.length) return '';
    const doneSiblings = f.similarIds.map((sid) => list.find((x) => x.id === sid)).filter((s) => s && s.status === 'done' && (s.title || s.keywords));
    if (!doneSiblings.length) return '';
    const info = doneSiblings.map((s) => `- ${frameLabel(s.id, list)} → Title: "${s.title}" | Keywords: ${s.keywords}`).join('\n');
    return `\nBATCH AWARENESS — this image looks visually very similar to other image(s) already processed in this same upload batch:\n${info}\nStay fully accurate to what is actually in THIS image, but deliberately pick a different angle for your title_options and keyword emphasis than the sibling(s) above so this listing doesn't cannibalize the sibling's search visibility. Do not copy their wording.\n`;
  }

  async function generateOne(id, extraInstruction = '') {
    updateFrame(id, { status: 'loading', error: '' });

    const searchToolLine = modeHemat
      ? 'Mode Hemat aktif — no search tool will be used for this request. Rely entirely on your own knowledge of stock photo buyer search behavior instead.'
      : 'You have a web_search tool available. Use it to do REAL competitor research, not just general trend-checking: search for how similar, already-established stock assets are keyworded on Adobe Stock (or similar marketplaces like Shutterstock/iStock) for this same subject. Use up to 2 searches if the subject is specific enough to research meaningfully; skip search for very generic/simple subjects.';

    const currentFrames = framesRef.current;
    const f = currentFrames.find((x) => x.id === id);
    if (!f) return;

    const referenceBlock = getReferenceKeywordBlock();
    const diversifyBlock = getDiversifyBlock(f, currentFrames);
    const prompt = buildPrompt({ referenceBlock, diversifyBlock, searchToolLine, extraInstruction });

    try {
      const lastText = await withRateLimitRetry(
        () => callVisionModel(model, f, prompt, { useSearchTool: !modeHemat, maxTokens: modeHemat ? 2000 : 3500 }),
        {
          onRetry: (attempt, delay) => {
            updateFrame(id, { error: `Kena rate limit, coba lagi otomatis (percobaan ${attempt}) dalam ${Math.round(delay / 1000)} detik...` });
          },
        }
      );
      const parsed = extractJsonObject(lastText);
      const opts = Array.isArray(parsed.title_options) ? parsed.title_options.map((t) => String(t).slice(0, 70)) : [];
      const patch = {
        titleOptions: opts,
        title: (opts[0] || parsed.title || '').toString().slice(0, 70),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 49).join(', ') : (parsed.keywords || '').toString(),
        category: resolveCategory(parsed.category),
        contentType: ['icon_vector', 'pattern_background', 'illustration_art', 'photo_realistic'].includes(parsed.content_type) ? parsed.content_type : '',
        visualRisk: typeof parsed.visual_trademark_risk === 'string' ? parsed.visual_trademark_risk.trim().slice(0, 240) : '',
        status: 'done',
      };
      updateFrame(id, patch);
      setSessionCost((prev) => prev + estimateCost(model, 'metadata', 1));

      if (!patch.category) {
        try {
          const catPrompt = `Look at the attached image and pick the single best-fit Adobe Stock category from this list:\n${CATEGORIES.map(([n, name]) => `${n}=${name}`).join(', ')}\nReply with ONLY the category number, nothing else — no words, no punctuation.`;
          const text = await callVisionModel(model, f, catPrompt, { useSearchTool: false, maxTokens: 50 });
          const fallback = resolveCategory(text);
          if (fallback) updateFrame(id, { category: fallback });
        } catch (e) { /* ignore fallback failure */ }
      }
    } catch (err) {
      updateFrame(id, { status: 'error', error: `Gagal generate: ${err.message || err}` });
    }
  }

  function buildInterleavedQueue(list) {
    const visited = new Set();
    const clusters = [];
    list.forEach((f) => {
      if (visited.has(f.id)) return;
      const stack = [f.id];
      const cluster = [];
      while (stack.length) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        cluster.push(cur);
        const curFrame = list.find((x) => x.id === cur);
        (curFrame?.similarIds || []).forEach((sid) => { if (!visited.has(sid)) stack.push(sid); });
      }
      clusters.push(cluster);
    });
    const maxLen = clusters.reduce((m, c) => Math.max(m, c.length), 0);
    const queue = [];
    for (let round = 0; round < maxLen; round++) {
      clusters.forEach((cluster) => { if (cluster[round]) queue.push(cluster[round]); });
    }
    return queue;
  }

  async function generateAll() {
    if (!frames.length) return;
    setGenAllBusy(true);
    const total = frames.length;
    setProgress({ done: 0, total });
    const CONCURRENCY = 3;
    const queue = buildInterleavedQueue(frames);
    let done = 0;
    async function worker() {
      while (queue.length) {
        const id = queue.shift();
        await generateOne(id);
        done++;
        setProgress({ done, total });
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    setGenAllBusy(false);
    setTimeout(() => setProgress(null), 1200);
  }

  function clearDone() {
    const doneCount = frames.filter((f) => f.status === 'done').length;
    if (!doneCount) { alert('Belum ada foto yang statusnya "Siap" (selesai di-generate).'); return; }
    if (!confirm(`Hapus ${doneCount} foto yang sudah selesai di-generate dari daftar ini?\n\nPastikan kamu sudah ekspor CSV-nya dulu kalau belum.`)) return;
    setFrames((prev) => {
      const next = prev.filter((f) => f.status !== 'done');
      updateSimilarity(next);
      updateTextSimilarity(next);
      return next;
    });
  }

  function clearAllFrames() {
    setFrames([]);
  }

  function applyReplace() {
    const find = findText.trim();
    if (!find) return;
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    let affected = 0;
    setFrames((prev) => {
      const next = prev.map((f) => {
        let changed = false;
        let title = f.title;
        let keywords = f.keywords;
        let titleOptions = f.titleOptions;
        re.lastIndex = 0;
        if (re.test(title)) { title = title.replace(re, replaceText).slice(0, 70); changed = true; }
        re.lastIndex = 0;
        if (re.test(keywords)) {
          keywords = keywords.split(',').map((k) => { re.lastIndex = 0; return k.replace(re, replaceText).trim(); }).filter(Boolean).join(', ');
          changed = true;
        }
        re.lastIndex = 0;
        if (titleOptions && titleOptions.length) {
          titleOptions = titleOptions.map((t) => { re.lastIndex = 0; return t.replace(re, replaceText); });
        }
        if (changed) affected++;
        return changed ? { ...f, title, keywords, titleOptions } : f;
      });
      updateTextSimilarity(next);
      return next;
    });
    setFindText('');
    setReplaceText('');
    setTimeout(() => alert(affected ? `Diterapkan ke ${affected} foto.` : 'Tidak ditemukan kecocokan di title/keyword manapun.'), 0);
  }

  function buildCsvRows() {
    return frames.map((f) => [f.filename, (f.title || '').replace(/,/g, ''), f.keywords || '', f.category || '', '']);
  }

  function openPreview() { setPreviewOpen(true); }
  function closePreview() { setPreviewOpen(false); }

  function downloadCsv() {
    const header = ['Filename', 'Title', 'Keywords', 'Category', 'Releases'];
    const csv = [header, ...buildCsvRows()]
      .map((row) => row.map((cell) => { const s = String(cell); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(','))
      .join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `noirworks_metadata_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    closePreview();
  }

  async function saveAllDone() {
    const doneFrames = frames.filter((f) => f.status === 'done');
    if (!doneFrames.length) { alert('Belum ada metadata yang selesai di-generate.'); return; }
    let ok = 0;
    for (const f of doneFrames) {
      try {
        await saveItem({
          kind: 'metadata',
          title: f.title,
          model,
          data: { filename: f.filename, title: f.title, keywords: f.keywords, category: f.category, contentType: f.contentType },
        });
        ok++;
      } catch (e) { /* lanjut ke item berikutnya */ }
    }
    alert(`${ok} dari ${doneFrames.length} metadata tersimpan ke database.`);
  }

  async function testConnection() {
    setConnBusy(true);
    setConnStatus({ text: 'Menguji koneksi...', ok: null });
    try {
      const data = await callClaude({ model, messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }], maxTokens: 30 });
      const text = extractText(data);
      setConnStatus({ text: `✓ Terhubung! Model membalas: "${text.trim().slice(0, 60)}"`, ok: true });
    } catch (err) {
      setConnStatus({ text: `✗ ${err.message || String(err)}`, ok: false });
    } finally {
      setConnBusy(false);
    }
  }

  function statusLabel(f) {
    switch (f.status) {
      case 'loading': return 'Menganalisis';
      case 'done': return 'Siap';
      case 'error': return 'Gagal';
      default: return 'Belum';
    }
  }

  const seen = new Map();
  let issueCount = 0;
  const previewRows = frames.map((f, idx) => {
    const label = `Fr. ${String(idx + 1).padStart(2, '0')}`;
    const key = f.filename.trim().toLowerCase();
    const dup = seen.has(key);
    if (!dup) seen.set(key, true);
    const missing = !f.title.trim() || !f.keywords.trim() || !f.category;
    const hasIssue = dup || missing;
    if (hasIssue) issueCount++;
    return { label, dup, ...f, hasIssue };
  });

  return (
    <div>
      <div className="app-header">
        <div>
          <div className="eyebrow">CASE FILE · BATCH REVIEW</div>
          <h1 className="title">
            NO<span className="accent">Ï</span>R WORKS
          </h1>
          <div className="title-rule"></div>
          <p className="desc">
            Metadata Generator — isi title, keyword, dan kategori untuk foto AI-generate kamu, lalu ekspor CSV siap
            unggah ke Adobe Stock Contributor.
          </p>
        </div>
        <div className="header-stats">
          <div className="stat-box">
            <div className="stat-value">{frames.length}</div>
            <div className="stat-label">frame</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{frames.filter((f) => f.status === 'done').length}</div>
            <div className="stat-label">selesai</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <ModelSelect value={model} onChange={setModel} />
        <div className="btn-row" style={{ marginTop: 8, alignItems: 'center' }}>
          <button className="btn-ghost" onClick={testConnection} disabled={connBusy}>
            Cek Koneksi
          </button>
          {connStatus.text && (
            <span style={{ fontSize: 11, color: connStatus.ok === false ? 'var(--red)' : connStatus.ok ? 'var(--cyan)' : 'var(--muted)' }}>
              {connStatus.text}
            </span>
          )}
        </div>
        <label className="checkbox-row" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={modeHemat} onChange={(e) => setModeHemat(e.target.checked)} />
          <span>Mode Hemat (matikan riset web — hemat biaya API)</span>
        </label>
      </div>

      <div
        className={'dropzone' + (dragActive ? ' drag' : '')}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
      >
        <h3>Taruh foto di sini, atau klik untuk memilih</h3>
        <p>JPG / PNG · bisa banyak file sekaligus</p>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => addFiles(e.target.files)} />
      </div>

      {frames.length > 0 && (
        <>
          <div className="results-head">
            <div className="btn-row">
              <button className="btn-primary" onClick={generateAll} disabled={genAllBusy}>
                Generate semua metadata
              </button>
              <button className="btn-ghost" onClick={clearDone}>Hapus yang sudah selesai</button>
              <button className="btn-ghost" onClick={clearAllFrames}>Hapus semua</button>
              {progress && (
                <div className="progress-wrap">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}></div>
                  </div>
                  <span>{progress.done}/{progress.total}</span>
                </div>
              )}
            </div>
            <div className="link-row">
              {sessionCost > 0 && (
                <span style={{ fontSize: 11.5, color: 'var(--muted)', marginRight: 10, alignSelf: 'center' }}>
                  Estimasi biaya sesi ini: <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{formatUsd(sessionCost)}</span>
                </span>
              )}
              <button className="btn-primary" onClick={openPreview} disabled={!frames.length}>Ekspor CSV Adobe Stock</button>
              <button className="btn-ghost" onClick={saveAllDone}>Simpan hasil ke DB</button>
            </div>
          </div>

          <div className="replace-bar">
            <span className="replace-label">Cari &amp; ganti di semua title + keyword</span>
            <input type="text" value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="cari kata..." />
            <span style={{ color: 'var(--muted)' }}>→</span>
            <input type="text" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="ganti dengan... (kosongkan untuk hapus)" />
            <button className="btn-ghost" onClick={applyReplace}>Terapkan ke semua</button>
          </div>

          <details className="reference-box">
            <summary>📈 Referensi keyword yang sudah laku (opsional) — AI akan mempertimbangkan gaya/istilah ini</summary>
            <div className="reference-body">
              <textarea
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
                rows={5}
                placeholder={'Tempel title/keyword dari foto-fotomu yang paling laku, contoh:\n\nTitle: Woman meditating in sunlit living room at home\nKeywords: meditation, mindfulness, home yoga, morning routine, self care...'}
              />
              <span className="field-hint">Dipakai hanya sebagai referensi gaya/istilah, bukan disalin mentah — tersimpan di memori tab ini saja, hilang saat direfresh.</span>
            </div>
          </details>
        </>
      )}

      {frames.length === 0 ? (
        <div className="empty-state">Belum ada foto. Upload dulu di atas.</div>
      ) : (
        <div className="grid">
          {frames.map((f, idx) => {
            const kwCount = f.keywords ? f.keywords.split(',').map((s) => s.trim()).filter(Boolean).length : 0;
            const brandFlags = flaggedBrandTerms(f.keywords);
            const dupFile = isDuplicateFilename(f, frames);
            return (
              <div className="photo-frame" key={f.id}>
                <div className="sprockets"></div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="photo-thumb" src={f.thumb} alt="" />
                <div className="photo-head">
                  <span className="no">Fr. {String(idx + 1).padStart(2, '0')}</span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {f.contentType && <span className="type-pill">{contentTypeLabel(f.contentType)}</span>}
                    <span className={`status-pill status-${f.status}`}>{statusLabel(f)}</span>
                  </span>
                </div>
                <div className="photo-body">
                  {f.visualRisk && (
                    <div className="inline-warn">
                      <b>⚠ Risiko visual:</b> {f.visualRisk} — AI mendeteksi ini dari gambar itu sendiri, cek/crop/edit dulu sebelum upload kalau perlu.
                    </div>
                  )}
                  {f.similarIds && f.similarIds.length > 0 && (
                    <div className="inline-warn">
                      <b>Mirip:</b> foto ini terlihat sangat mirip dengan {f.similarIds.map((sid) => frameLabel(sid, frames)).filter(Boolean).join(', ')} — Adobe Stock bisa menolak submission yang dianggap duplikat/near-duplicate.
                    </div>
                  )}
                  {f.textSimilarIds && f.textSimilarIds.length > 0 && (
                    <div className="inline-warn">
                      <b>Teks mirip:</b> title/keyword hampir sama dengan {f.textSimilarIds.map((sid) => frameLabel(sid, frames)).filter(Boolean).join(', ')} — sebaiknya dibedakan supaya tidak saling bersaing di pencarian.
                      <br />
                      <button className="fix-btn" disabled={f.status === 'loading'} onClick={() => {
                        const siblings = f.textSimilarIds.map((sid) => frames.find((x) => x.id === sid)).filter(Boolean);
                        const siblingInfo = siblings.map((s) => `- Title: "${s.title}" | Keywords: ${s.keywords}`).join('\n');
                        generateOne(f.id, `Your previous title and keywords for THIS image ended up too similar to sibling image(s) uploaded in the same batch:\n${siblingInfo}\nStay fully accurate to what is actually in THIS image, but pick a genuinely different angle for the title_options, and include several keywords not already dominant in the sibling list.`);
                      }}>Perbaiki otomatis (buat beda)</button>
                    </div>
                  )}
                  <div className="photo-field field">
                    <label>Filename <span className={'count' + (f.filename.length > 30 ? ' warn' : '')}>{f.filename.length}/30</span></label>
                    <input type="text" value={f.filename} onChange={(e) => updateFrame(f.id, { filename: e.target.value })} />
                    {dupFile && (
                      <div className="inline-warn">
                        <b>Duplikat:</b> nama file ini sama dengan frame lain.
                        <br />
                        <button className="fix-btn" onClick={() => autoFixDuplicateFilename(f.id)}>Perbaiki nama file</button>
                      </div>
                    )}
                  </div>
                  <div className="photo-field field">
                    <label>Title <span className={'count' + (f.title.length > 70 ? ' warn' : '')}>{f.title.length}/70</span></label>
                    {f.titleOptions && f.titleOptions.length > 0 && (
                      <div className="title-options">
                        {f.titleOptions.map((t, i) => (
                          <span className="title-chip" key={i} onClick={() => updateFrame(f.id, { title: t.slice(0, 70) })}>{t}</span>
                        ))}
                      </div>
                    )}
                    <textarea rows={2} value={f.title} placeholder="Belum di-generate..." onChange={(e) => updateFrame(f.id, { title: e.target.value })} />
                  </div>
                  <div className="photo-field field">
                    <label>Keywords <span className={'count' + (kwCount > 49 ? ' warn' : '')}>{kwCount}/49</span></label>
                    <textarea rows={3} value={f.keywords} placeholder="kata1, kata2, kata3..." onChange={(e) => updateFrame(f.id, { keywords: e.target.value })} />
                    {brandFlags.length > 0 && (
                      <div className="inline-warn">
                        <b>Cek lagi:</b> mengandung istilah brand/trademark ({brandFlags.join(', ')}).
                        <br />
                        <button className="fix-btn" disabled={f.status === 'loading'} onClick={() => generateOne(f.id, `The keyword list you produced last time included brand/trademark terms: ${brandFlags.join(', ')}. Remove or replace ONLY those specific terms with brand-neutral descriptive equivalents. Keep every other keyword and the title options exactly as good as before.`)}>Perbaiki otomatis</button>
                      </div>
                    )}
                  </div>
                  <div className="photo-field field">
                    <label>Category</label>
                    <select value={f.category} onChange={(e) => updateFrame(f.id, { category: e.target.value })}>
                      <option value="">— pilih kategori —</option>
                      {CATEGORIES.map(([n, name]) => (
                        <option key={n} value={n}>{n}. {name}</option>
                      ))}
                    </select>
                  </div>
                  {f.status === 'error' && <div style={{ color: 'var(--red)', fontSize: 11.5 }}>{f.error}</div>}
                </div>
                <div className="photo-actions">
                  <button className="btn-ghost" onClick={() => generateOne(f.id)} disabled={f.status === 'loading'}>
                    {f.status === 'loading' ? 'Menganalisis...' : f.status === 'done' ? 'Generate ulang' : 'Generate'}
                  </button>
                  <button className="btn-ghost" onClick={() => {
                    navigator.clipboard.writeText(`Title: ${f.title}\nKeywords: ${f.keywords}`);
                  }}>Copy</button>
                  <button className="btn-ghost danger" onClick={() => {
                    setFrames((prev) => {
                      const next = prev.filter((x) => x.id !== f.id);
                      updateSimilarity(next);
                      updateTextSimilarity(next);
                      return next;
                    });
                  }}>Hapus</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <HistoryPanel
        kind="metadata"
        label="Metadata Generator"
        renderItem={(item) => (
          <div className="history-title">
            {item.data?.filename ? `${item.data.filename} — ` : ''}
            {item.title}
          </div>
        )}
      />

      <NicheStats kind="metadata" label="Metadata Generator" />

      <details className="reference-box" style={{ marginTop: 24 }}>
        <summary>ℹ️ Panduan &amp; Informasi Metadata (Klik untuk Membuka)</summary>
        <div className="reference-body footnote" style={{ margin: 0, padding: 14 }}>
          <b>Cara pakai:</b> upload foto → klik <em>Generate</em> per foto atau <em>Generate semua</em> (jalan 3 sekaligus + progress bar) → pilih salah satu dari 3 opsi title yang muncul (atau edit manual) → cek keyword &amp; kategori → <em>Ekspor CSV</em> → di Contributor Portal Adobe Stock, buka tab <b>New</b> pada Uploaded Files, pilih <b>Upload CSV</b>.
          <br />
          <br />
          Gambar asli (base64) TIDAK disimpan ke database; yang disimpan lewat &quot;Simpan hasil ke DB&quot;
          hanya teks metadata (filename, title, keyword, kategori) supaya tetap ringan dan gratis di tier Neon.
          Jangan lupa menandai konten sebagai <b>AI-generated</b> saat mengunggah ke Adobe Stock.
        </div>
      </details>

      <div className={'modal-overlay' + (previewOpen ? ' open' : '')}>
        <div className="modal-panel">
          <div className="modal-head">
            <h3>Preview CSV — cek dulu sebelum diekspor</h3>
            <button className="btn-ghost" onClick={closePreview}>✕</button>
          </div>
          <div className="modal-body">
            <table className="preview-table">
              <thead>
                <tr><th>Frame</th><th>Filename</th><th>Title</th><th>Keywords</th><th>Category</th></tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr className={r.hasIssue ? 'has-issue' : ''} key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.filename ? r.filename : <span className="cell-empty">(kosong)</span>}{r.dup ? ' ⚠' : ''}</td>
                    <td>{r.title ? r.title : <span className="cell-empty">(kosong)</span>}</td>
                    <td>{r.keywords ? r.keywords : <span className="cell-empty">(kosong)</span>}</td>
                    <td>{r.category ? categoryName(r.category) : <span className="cell-empty">(belum)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-foot">
            <span className="issue-summary">
              {issueCount ? `⚠ ${issueCount} baris perlu dicek (kosong atau nama file duplikat).` : '✓ Semua baris lengkap dan nama file unik.'}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" onClick={closePreview}>Tutup, edit lagi</button>
              <button className="btn-primary" onClick={downloadCsv}>Download CSV</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
