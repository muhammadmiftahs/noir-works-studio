'use client';

import { useState, useEffect, useCallback } from 'react';
import { callClaude, extractText } from '../lib/claudeClient';
import { DEFAULT_MODEL_ID } from '../lib/models';

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
  const [apiTest, setApiTest] = useState({ state: 'idle', message: '' }); // idle | testing | ok | error
  const [apiTestBusy, setApiTestBusy] = useState(false);

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
    setApiTestBusy(true);
    setApiTest({ state: 'testing', message: '' });
    try {
      const data = await callClaude({
        model: DEFAULT_MODEL_ID,
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        maxTokens: 20,
      });
      const text = extractText(data);
      setApiTest({ state: 'ok', message: text.trim().slice(0, 40) });
    } catch (err) {
      setApiTest({ state: 'error', message: err.message || 'Gagal terhubung.' });
    } finally {
      setApiTestBusy(false);
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

  let dbCls, dbText;
  if (!status.database.configured) {
    dbCls = 'status-chip-error';
    dbText = 'Database: belum diset';
  } else if (!status.database.connected) {
    dbCls = 'status-chip-error';
    dbText = `Database: gagal terhubung${status.database.error ? ' — ' + status.database.error : ''}`;
  } else {
    dbCls = 'status-chip-ok';
    dbText = `Database: terhubung · ${formatBytes(status.database.sizeBytes)} terpakai`;
  }

  let apiCls, apiText;
  if (!status.anthropicConfigured) {
    apiCls = 'status-chip-error';
    apiText = 'Anthropic API: belum diset';
  } else if (apiTest.state === 'ok') {
    apiCls = 'status-chip-ok';
    apiText = 'Anthropic API: terverifikasi ✓';
  } else if (apiTest.state === 'error') {
    apiCls = 'status-chip-error';
    apiText = `Anthropic API: gagal — ${apiTest.message}`;
  } else if (apiTest.state === 'testing') {
    apiCls = 'status-chip-neutral';
    apiText = 'Anthropic API: menguji…';
  } else {
    apiCls = 'status-chip-neutral';
    apiText = 'Anthropic API: sudah diset (belum dites)';
  }

  return (
    <div className="status-bar">
      <span className={`status-chip ${dbCls}`}>{dbText}</span>
      <span className={`status-chip ${apiCls}`}>{apiText}</span>
      {status.anthropicConfigured && apiTest.state !== 'ok' && (
        <button className="status-test-btn" onClick={testAnthropic} disabled={apiTestBusy}>
          {apiTestBusy ? 'Menguji…' : 'Tes sekarang'}
        </button>
      )}
      <button className="status-refresh-btn" onClick={loadStatus} title="Refresh status database">⟳</button>
    </div>
  );
}
