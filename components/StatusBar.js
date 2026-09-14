'use client';

import { useState, useEffect, useCallback } from 'react';
import { callClaude, extractText } from '../lib/claudeClient';

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
  const [expanded, setExpanded] = useState(false);
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

  // Determine dot colors and detail text
  let dbDot = 'neutral', dbDetail = 'Database: memuat…';
  if (status) {
    if (!status.database.configured) { dbDot = 'error'; dbDetail = 'Database: belum diset'; }
    else if (!status.database.connected) { dbDot = 'error'; dbDetail = `Database: gagal terhubung${status.database.error ? ' — ' + status.database.error : ''}`; }
    else { dbDot = 'ok'; dbDetail = `Database: terhubung · ${formatBytes(status.database.sizeBytes)} terpakai`; }
  }

  let anthropicDot = 'neutral', anthropicDetail = 'Anthropic: memuat…';
  if (status) {
    if (!status.anthropicConfigured) { anthropicDot = 'error'; anthropicDetail = 'Anthropic API: belum diset'; }
    else if (anthropicTest.state === 'ok') { anthropicDot = 'ok'; anthropicDetail = 'Anthropic API: terverifikasi ✓'; }
    else if (anthropicTest.state === 'error') { anthropicDot = 'error'; anthropicDetail = `Anthropic API: gagal — ${anthropicTest.message}`; }
    else if (anthropicTest.state === 'testing') { anthropicDot = 'neutral'; anthropicDetail = 'Anthropic API: menguji…'; }
    else { anthropicDot = 'warn'; anthropicDetail = 'Anthropic API: sudah diset (belum dites)'; }
  }

  let geminiDot = 'neutral', geminiDetail = 'Gemini: memuat…';
  if (status) {
    if (!status.geminiConfigured) { geminiDot = 'error'; geminiDetail = 'Gemini API: belum diset'; }
    else if (geminiTest.state === 'ok') { geminiDot = 'ok'; geminiDetail = 'Gemini API: terverifikasi ✓'; }
    else if (geminiTest.state === 'error') { geminiDot = 'error'; geminiDetail = `Gemini API: gagal — ${geminiTest.message}`; }
    else if (geminiTest.state === 'testing') { geminiDot = 'neutral'; geminiDetail = 'Gemini API: menguji…'; }
    else { geminiDot = 'warn'; geminiDetail = 'Gemini API: sudah diset (belum dites)'; }
  }

  return (
    <div className="status-compact">
      {/* Compact always-visible row: dots only */}
      <button
        className="status-compact-btn"
        onClick={() => setExpanded((v) => !v)}
        title="Klik untuk detail status sistem"
      >
        <span className={`status-dot dot-ok-${dbDot === 'ok'}`} style={{ background: dotColor(dbDot) }}></span>
        <span className={`status-dot`} style={{ background: dotColor(anthropicDot) }}></span>
        <span className={`status-dot`} style={{ background: dotColor(geminiDot) }}></span>
        <span className="status-compact-label">STATUS</span>
        <span className="status-compact-caret">{expanded ? '▴' : '▾'}</span>
      </button>

      {/* Expanded detail dropdown */}
      {expanded && (
        <div className="status-compact-dropdown">
          <div className="status-row-detail">
            <span className={`status-dot`} style={{ background: dotColor(dbDot) }}></span>
            <span>{dbDetail}</span>
            <button className="status-refresh-btn" onClick={loadStatus} title="Refresh status">⟳</button>
          </div>
          <div className="status-row-detail">
            <span className={`status-dot`} style={{ background: dotColor(anthropicDot) }}></span>
            <span>{anthropicDetail}</span>
            {status?.anthropicConfigured && anthropicTest.state !== 'ok' && (
              <button className="status-test-btn" onClick={testAnthropic} disabled={anthropicTestBusy}>
                {anthropicTestBusy ? '…' : 'Test'}
              </button>
            )}
          </div>
          <div className="status-row-detail">
            <span className={`status-dot`} style={{ background: dotColor(geminiDot) }}></span>
            <span>{geminiDetail}</span>
            {status?.geminiConfigured && geminiTest.state !== 'ok' && (
              <button className="status-test-btn" onClick={testGemini} disabled={geminiTestBusy}>
                {geminiTestBusy ? '…' : 'Test'}
              </button>
            )}
          </div>
          <div className="status-legend">
            <span><i className="status-dot" style={{ background: dotColor('ok') }}></i> OK</span>
            <span><i className="status-dot" style={{ background: dotColor('warn') }}></i> Belum dites</span>
            <span><i className="status-dot" style={{ background: dotColor('error') }}></i> Gagal/Belum diset</span>
          </div>
        </div>
      )}
    </div>
  );
}

function dotColor(kind) {
  switch (kind) {
    case 'ok': return '#7fcf9e';
    case 'warn': return '#f2b134';
    case 'error': return '#e3384f';
    default: return '#8a8a8e';
  }
}
