'use client';

import { useState, useEffect, useCallback } from 'react';
import { callClaude, extractText } from '../lib/claudeClient';
import { DEFAULT_MODEL_ID } from '../lib/models';
import ThemeToggle from './ThemeToggle';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function StatusBar() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anthropicTest, setAnthropicTest] = useState({ state: 'idle', message: '' });
  const [geminiTest, setGeminiTest] = useState({ state: 'idle', message: '' });
  const [anthropicTestBusy, setAnthropicTestBusy] = useState(false);
  const [geminiTestBusy, setGeminiTestBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Tes koneksi Anthropic yang SESUNGGUHNYA (bukan cuma cek env var) — ini
  // memanggil model beneran dan memakan sedikit token/biaya, makanya dibuat
  // manual (tombol), tidak otomatis jalan tiap kali halaman dibuka.
  async function testAnthropic() {
    setAnthropicTestBusy(true);
    setAnthropicTest({ state: 'testing', message: '' });
    try {
      const data = await callClaude({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        maxTokens: 20,
      });
      const text = extractText(data);
      setAnthropicTest({ state: 'ok', message: text.trim().slice(0, 40) });
    } catch (err) {
      setAnthropicTest({ state: 'error', message: err.message || 'Gagal terhubung.' });
    } finally {
      setAnthropicTestBusy(false);
    }
  }

  // Tes koneksi Gemini — sama seperti Anthropic, ini memanggil API beneran
  // untuk verifikasi key valid dan bisa generate.
  async function testGemini() {
    setGeminiTestBusy(true);
    setGeminiTest({ state: 'testing', message: '' });
    try {
      const data = await callClaude({
        model: 'gemini-3.6-flash',
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        maxTokens: 20,
      });
      const text = extractText(data);
      setGeminiTest({ state: 'ok', message: text.trim().slice(0, 40) });
    } catch (err) {
      setGeminiTest({ state: 'error', message: err.message || 'Gagal terhubung.' });
    } finally {
      setGeminiTestBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="status-bar">
        <span className="status-chip status-chip-neutral">Memeriksa status sistem…</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="status-bar">
        <span className="status-chip status-chip-error">Gagal memuat status sistem</span>
        <button className="status-refresh-btn" onClick={loadStatus} title="Coba lagi">⟳</button>
      </div>
    );
  }

  let dbCls, dbText, dbShortText;
  if (!status.database.configured) {
    dbCls = 'status-chip-error';
    dbText = 'Database: belum diset';
    dbShortText = 'DB: ✗ belum diset';
  } else if (!status.database.connected) {
    dbCls = 'status-chip-error';
    dbText = `Database: gagal terhubung${status.database.error ? ' — ' + status.database.error : ''}`;
    dbShortText = 'DB: ✗ gagal';
  } else {
    dbCls = 'status-chip-ok';
    dbText = `Database: terhubung · ${formatBytes(status.database.sizeBytes)} terpakai`;
    dbShortText = `DB: ✓ ${formatBytes(status.database.sizeBytes)}`;
  }

  let anthropicCls, anthropicText;
  if (!status.anthropicConfigured) {
    anthropicCls = 'status-chip-error';
    anthropicText = 'Anthropic: belum diset';
  } else if (anthropicTest.state === 'ok') {
    anthropicCls = 'status-chip-ok';
    anthropicText = 'Anthropic: ✓ OK';
  } else if (anthropicTest.state === 'error') {
    anthropicCls = 'status-chip-error';
    anthropicText = `Anthropic: ✗ ${anthropicTest.message}`;
  } else if (anthropicTest.state === 'testing') {
    anthropicCls = 'status-chip-neutral';
    anthropicText = 'Anthropic: menguji…';
  } else {
    anthropicCls = 'status-chip-warning';
    anthropicText = 'Anthropic: ⚠ belum ditest';
  }

  let geminiCls, geminiText;
  if (!status.geminiConfigured) {
    geminiCls = 'status-chip-error';
    geminiText = 'Gemini: belum diset';
  } else if (geminiTest.state === 'ok') {
    geminiCls = 'status-chip-ok';
    geminiText = 'Gemini: ✓ OK';
  } else if (geminiTest.state === 'error') {
    geminiCls = 'status-chip-error';
    geminiText = `Gemini: ✗ ${geminiTest.message}`;
  } else if (geminiTest.state === 'testing') {
    geminiCls = 'status-chip-neutral';
    geminiText = 'Gemini: menguji…';
  } else {
    geminiCls = 'status-chip-warning';
    geminiText = 'Gemini: ⚠ belum ditest';
  }

  return (
    <div className="status-bar">
      <div className="status-bar-top">
        <span className={`status-chip ${dbCls}`}>
          <span className="status-text-full">{dbText}</span>
          <span className="status-text-short">{dbShortText}</span>
        </span>
        <button className="status-refresh-btn" onClick={loadStatus} title="Refresh status">⟳</button>
      </div>
      <div className="status-bar-middle">
        <div className="status-bar-group">
          <span className={`status-chip ${anthropicCls}`}>{anthropicText}</span>
          {status.anthropicConfigured && anthropicTest.state !== 'ok' && (
            <button className="status-test-btn" onClick={testAnthropic} disabled={anthropicTestBusy}>
              {anthropicTestBusy ? '…' : 'Test'}
            </button>
          )}
        </div>
        <div className="status-bar-group">
          <span className={`status-chip ${geminiCls}`}>{geminiText}</span>
          {status.geminiConfigured && geminiTest.state !== 'ok' && (
            <button className="status-test-btn" onClick={testGemini} disabled={geminiTestBusy}>
              {geminiTestBusy ? '…' : 'Test'}
            </button>
          )}
        </div>
      </div>
      <div className="status-bar-bottom">
        <ThemeToggle />
      </div>
    </div>
  );
}
